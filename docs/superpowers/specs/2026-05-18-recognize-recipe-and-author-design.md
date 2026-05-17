# Design — Recognize Page Recipe Section + RecipeCard Author

**Ngày:** 2026-05-18
**Trạng thái:** Draft — chờ user review
**Scope:** 2 features liên quan
1. Trang `/recognize` hiển thị thêm công thức nấu của món được nhận diện + điều hướng sang search
2. RecipeCard hiển thị tên tác giả để phân biệt recipes trùng tên

---

## 1. Mục tiêu

### Feature A — Recognize page enhancement
- Hiện trạng: `/recognize` chỉ trả tên món + độ chính xác + top predictions + suggested recipes (search keyword)
- Mong muốn: thêm phần **công thức chuẩn** của món được nhận diện (nguyên liệu + các bước nấu) + cho user click tên món / nút CTA để navigate sang trang `/search?q=<dish_name>`

### Feature B — RecipeCard author
- Hiện trạng: RecipeCard chỉ hiện badge nguồn + rating + title → không phân biệt được các recipe trùng tên nhưng khác tác giả
- Mong muốn: dòng tác giả dưới title, hỗ trợ cả user-uploaded recipes (link User profile) và Cookpad recipes (tên scrape được, không link)

---

## 2. Data model

### 2.1 File `backend/app/ai/dish_recipes.json` (static, 103 món curated)

Source of truth cho công thức chuẩn của 103 món AI đã train. Slugs lấy từ `GROUP_CLASSES` trong `backend/app/ai/class_names.py` (flatten + dedup vì `banh-canh`, `bo-kho` xuất hiện ở 2 group).

```json
{
  "banh-beo": {
    "title": "Bánh bèo",
    "description": "Bánh bèo Huế truyền thống...",
    "ingredients": ["Bột gạo 200g", "Bột năng 50g", "Tôm khô 100g", "Hành lá", "Mỡ hành", "Nước mắm 3 muỗng"],
    "steps": ["Trộn bột gạo + bột năng với 600ml nước...", "Đổ bột vào chén nhỏ, hấp 8-10 phút...", "Rắc tôm khô, mỡ hành lên bánh, ăn kèm nước mắm chua ngọt."],
    "cooking_time_minutes": 45,
    "servings": 4,
    "difficulty": "medium"
  }
}
```

- Key = slug (khớp `CLASS_DISPLAY_NAMES` keys)
- Load 1 lần lúc app startup vào `DISH_RECIPES: dict[str, DishRecipe]` trong service module
- Schema validation bằng Pydantic `DishRecipeOut` khi load

### 2.2 Bảng mới `ai_generated_recipes` (cache OpenAI fallback)

| Column | Type | Note |
|---|---|---|
| `id` | UUID PK | |
| `dish_name_normalized` | VARCHAR(200) UNIQUE | lowercased + trimmed, key tra cứu |
| `display_name` | VARCHAR(200) | tên gốc OpenAI trả về |
| `recipe_json` | JSONB | cùng schema dish_recipes.json (title/description/ingredients/steps/time/servings/difficulty) |
| `created_at` | TIMESTAMP | default now() |
| `created_by_user_id` | UUID FK users(id) nullable | user trigger lần đầu (analytics) |

Migration: `backend/alembic/versions/0003_ai_generated_recipes.py`

### 2.3 Cột mới `recipes.original_author_name`

Lưu tên tác giả Cookpad scrape được (Cookpad data không có author trong JSON gốc, phải re-scrape).

| Column | Type | Note |
|---|---|---|
| `original_author_name` | VARCHAR(200) NULL | `NULL` = chưa scrape, `''` = scrape rồi nhưng không có, `'<name>'` = có tên |

Migration: `backend/alembic/versions/0004_recipe_original_author.py`

---

## 3. Backend API

### 3.1 Extend `POST /api/v1/ai/recognize`

Thêm field `dish_recipe` vào response (giữ nguyên các field cũ):

```json
{
  "display_name": "Bánh bèo",
  "model_used": "vnfood",
  "confidence": 0.92,
  "subgroup": "BANH",
  "top_predictions": [...],
  "suggested_recipes": [...],
  "dish_recipe": {
    "source": "curated",
    "title": "Bánh bèo",
    "description": "...",
    "ingredients": [...],
    "steps": [...],
    "cooking_time_minutes": 45,
    "servings": 4,
    "difficulty": "medium"
  }
}
```

`source: "curated" | "ai-generated"`. Trường hợp Unknown → `dish_recipe: null`.

### 3.2 Logic trong `ai_service.recognize_image()`

```
predict → có slug từ VNFood AI model
  → lookup DISH_RECIPES[slug]
  → dish_recipe = { source: "curated", ...DISH_RECIPES[slug] }

predict fail / confidence thấp → fall through OpenAI vision
  → OpenAI trả display_name
  → normalize display_name → lookup ai_generated_recipes table
    → cache HIT → dish_recipe = { source: "ai-generated", ...row.recipe_json }
    → cache MISS → gọi OpenAI lần 2 với prompt sinh recipe JSON (cùng schema)
                   → INSERT ai_generated_recipes
                   → dish_recipe = { source: "ai-generated", ... }

OpenAI trả Unknown → dish_recipe = null
```

Trade-off: cold-cache trường hợp OpenAI fallback chậm thêm ~2-4s (1 OpenAI vision call + 1 OpenAI text call). User đang ở loading state, chấp nhận được.

### 3.3 Files mới / sửa

- `backend/app/services/dish_recipe_service.py` — **NEW**: `load_dish_recipes()` (startup), `get_curated(slug)`, `get_or_generate_ai(dish_name, user_id, db)`
- `backend/app/models/ai_generated_recipe.py` — **NEW**: ORM model
- `backend/app/schemas/recipe.py` — thêm `DishRecipeOut` (source + recipe fields), `original_author_name: str | None` vào `RecipeCardOut`
- `backend/app/services/ai_service.py` — `recognize_image()` gọi `dish_recipe_service`, attach vào response
- `backend/app/main.py` — `lifespan` event call `load_dish_recipes()` + validate

### 3.4 RecipeCardOut + RecipeDetailOut serialization (cho Feature B)

Cả 2 schema thêm field mới `original_author_name: str | None`. `RecipeCardOut.author` và `RecipeDetailOut.author` giữ nguyên `AuthorOut | None` (User relationship — linkable). Frontend tự quyết logic display ở từng nơi (card listing hoặc detail page).

---

## 4. Frontend — Recognize page

### 4.1 Files mới / sửa

- `frontend/lib/types.ts` — thêm `DishRecipe` type, extend `AIRecognitionResult` thêm `dish_recipe: DishRecipe | null`
- `frontend/components/ai/DishRecipeCard.tsx` — **NEW**
- `frontend/components/ai/RecognitionResult.tsx` — sửa (dish name clickable, thêm CTA button, render DishRecipeCard)

### 4.2 Layout DishRecipeCard (two-column)

Container: `bg-white rounded-2xl shadow-sm border border-[#E8DDD4] p-6`. Bám design hiện tại — KHÔNG dùng emoji, KHÔNG dùng `shadow-block` (quá ồn ào cho section phụ trợ).

Header row:
- Label: `<p class="text-xs text-[#7C6A56] uppercase tracking-wider">Công thức gợi ý</p>`
- Title: `<h3 style="font-family: var(--font-heading)" class="text-2xl font-bold text-[#1C1209]">{title}</h3>`
- AI-warning badge (chỉ khi `source === "ai-generated"`): dot-badge style amber `#C97B16`
  ```tsx
  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium
                   bg-[#C97B16]/10 text-[#C97B16] border border-[#C97B16]/20">
    <span className="w-1.5 h-1.5 rounded-full bg-[#C97B16]" />
    Công thức do AI sinh — cần kiểm tra
  </span>
  ```

Meta chips row (Lucide icons, no emoji):
- `<Clock className="w-3 h-3" /> 45 phút`
- `<Users className="w-3 h-3" /> 4 người`
- `<ChefHat className="w-3 h-3" /> Trung bình`
- Pattern: `inline-flex items-center gap-1 text-xs text-[#7C6A56] bg-[#F7F0E8] px-2 py-1 rounded-full`

Divider: `border-t border-[#E8DDD4]`

Grid 2 cột desktop (mobile stack): `grid grid-cols-1 md:grid-cols-[260px_1fr] gap-8`

- **Cột trái — Nguyên liệu:** `bg-[#F7F0E8] rounded-xl p-4`
  - Label `<p class="text-xs text-[#7C6A56] uppercase tracking-wider mb-2">Nguyên liệu</p>`
  - `<ul>` list, mỗi item: bullet `•` color `text-[#E85D26]` + text `text-[#1C1209]` body font

- **Cột phải — Cách làm:** tái dùng pattern step của `RecipeDetailClient`
  - Label `<p class="text-xs text-[#7C6A56] uppercase tracking-wider mb-4">Cách làm</p>`
  - `<div class="space-y-6">` chứa từng step
  - Mỗi step: `flex gap-4`, circle `w-12 h-12 rounded-full bg-[#E85D26]/10 flex items-center justify-center font-bold text-xl text-[#E85D26]` (Playfair font) + content `text-[#1C1209] leading-relaxed`

### 4.3 Sửa RecognitionResult.tsx

- `display_name` từ `<h2>` plain → wrap trong `<Link href="/search?q={encodeURIComponent(display_name)}">` với class `hover:text-[#E85D26] transition-colors cursor-pointer` (không underline để giữ editorial feel)
- Bên dưới `<ConfidenceBar>`, thêm CTA button shadcn `<Button>`:
  ```tsx
  <Button asChild className="bg-[#E85D26] hover:bg-[#D14E1C] text-white">
    <Link href={`/search?q=${encodeURIComponent(result.display_name)}`}>
      <Search className="w-4 h-4 mr-2" />
      Tìm công thức "{result.display_name}"
    </Link>
  </Button>
  ```
- Dưới khối 2-col header, render `{result.dish_recipe && <DishRecipeCard recipe={result.dish_recipe} />}`

### 4.4 Edge cases

- `dish_recipe === null` → không render DishRecipeCard + không render CTA + không clickable dish name
- `isUnknown === true` (existing check) → hiện "Không nhận diện được" message như cũ
- Mobile: header row stack vertical, recipe grid stack vertical, CTA button full-width

---

## 5. Frontend — RecipeCard author

### 5.1 File sửa: `frontend/components/recipes/RecipeCard.tsx`

Thêm dòng author **dưới title** (Variant A đã chốt). Avatar shadcn 18px + tên truncate.

```tsx
const displayName = recipe.author?.display_name ?? recipe.original_author_name ?? "Unknown";
const initials = displayName.slice(0, 2).toUpperCase();
const isLinkable = !!recipe.author;

const authorEl = (
  <div className="flex items-center gap-1.5 mt-1.5">
    <Avatar className="w-[18px] h-[18px]">
      {recipe.author?.avatar_url && <AvatarImage src={recipe.author.avatar_url} />}
      <AvatarFallback className="text-[9px] bg-[#2D6A4F] text-white">
        {initials}
      </AvatarFallback>
    </Avatar>
    <span className="text-xs text-[#7C6A56] truncate">{displayName}</span>
  </div>
);

return isLinkable
  ? <Link href={`/users/${recipe.author!.id}`} onClick={stopPropagation}>{authorEl}</Link>
  : authorEl;
```

`stopPropagation` để click vào author không bubble lên RecipeCard wrapper Link.

### 5.2 3 trường hợp display

| Có User (author) | Có original_author_name | Display |
|---|---|---|
| ✅ | — | Avatar user + tên + link `/users/{id}` |
| ❌ | ✅ | Avatar fallback initials (bg `#2D6A4F`) + tên + KHÔNG link |
| ❌ | ❌ / `''` | Avatar fallback "UN" + text "Unknown" + KHÔNG link |

### 5.3 Phạm vi áp dụng (RecipeCard)

RecipeCard dùng chung → tự động hiện author trên: `/recipes` browse, `/search`, homepage trending, `/me/saved`, `/users/[id]` profile recipes.

KHÔNG sửa `SuggestedRecipeCard` (`RecipeCarousel.tsx`) — component riêng, ngoài scope.

### 5.4 Recipe detail page `/recipes/[id]` — Author card

File sửa: `frontend/app/recipes/[id]/page.tsx` (block "Author card", line 227-256 hiện tại).

**Hiện trạng:**
- `recipe.author` (User) → card đầy đủ: avatar 12x12, full_name, follower_count, nút "Xem hồ sơ" link `/users/{id}`
- `recipe.source === 'cookpad'` + no author → card generic "Cookpad / Công thức tổng hợp" + link Cookpad URL
- Không hiện tên tác giả Cookpad thật

**Sửa logic — 3 nhánh thay vì 2:**

1. **Có User (`recipe.author`)** — giữ nguyên (card user-uploaded hiện tại, có "Xem hồ sơ")

2. **Có `original_author_name` không rỗng** (Cookpad đã scrape) — NEW:
   ```tsx
   <div className="flex items-center gap-3 p-4 bg-[#F7F0E8] rounded-xl border border-[#E8DDD4] mb-6">
     <Avatar className="w-12 h-12">
       <AvatarFallback className="bg-[#2D6A4F] text-white font-semibold">
         {recipe.original_author_name.charAt(0).toUpperCase()}
       </AvatarFallback>
     </Avatar>
     <div className="flex-1 min-w-0">
       <p className="font-semibold text-[#1C1209]">{recipe.original_author_name}</p>
       <p className="text-xs text-[#7C6A56]">Tác giả Cookpad</p>
     </div>
     {recipe.cookpad_url && (
       <a href={recipe.cookpad_url} target="_blank" rel="noopener"
          className="px-4 py-1.5 rounded-full border border-[#E85D26] text-sm text-[#E85D26]
                     hover:bg-[#E85D26] hover:text-white transition-colors">
         Xem trên Cookpad
       </a>
     )}
   </div>
   ```
   Avatar fallback dùng màu secondary `#2D6A4F` (xanh) để phân biệt visual với user-uploaded (orange `#E85D26`).

3. **Cookpad chưa scrape / `original_author_name` empty** — giữ card generic "Cookpad / Công thức tổng hợp" như hiện tại

Sau khi enrichment script chạy xong, hầu hết Cookpad recipes sẽ rơi vào nhánh 2 (tên thật), nhánh 3 chỉ còn các recipes bị xóa.

---

## 6. Data population

### 6.1 Generate `dish_recipes.json` (103 món)

File: `backend/scripts/generate_dish_recipes.py` — chạy 1 lần khi setup, commit kết quả vào git.

Flow:
1. Lấy danh sách unique slugs từ `GROUP_CLASSES` (flatten + dedup)
2. Với mỗi slug, gọi OpenAI GPT-4o-mini với structured output prompt sinh recipe JSON (cùng schema đã chốt)
3. Save từng món vào `dish_recipes.json` (incremental, resumable)
4. Dev manual review + chỉnh sửa để đảm bảo accuracy (đặc biệt ingredient quantities + steps order)

### 6.2 Cookpad author enrichment

File: `backend/scripts/enrich_cookpad_authors.py` — Playwright-based (reuse pattern từ `crawl_general_recipes.py`).

**Vì sao Playwright (không phải httpx):**
Script `crawl_general_recipes.py` của project đã proven bypass 403 Cookpad bằng Playwright + Chrome UA + vi-VN locale + warm-up cookie. httpx async raw request sẽ bị Cookpad chặn.

**Robots.txt compliance:**
- Cookpad robots.txt cho phép `User-agent: *` truy cập `/` (root)
- Recipe pages `/vn/cong-thuc/{id}` KHÔNG trong Disallow list
- Cookpad chỉ cấm AI training bots (GPTBot, Claude-Web, anthropic-ai, …) → dùng UA Chrome 124 bình thường không vi phạm
- Sleep 4s giữa requests (giống crawler hiện tại, đã proven safe)

**Constants:**
```python
SLEEP_SEC = 2               # nghỉ giữa requests
PAGE_TIMEOUT = 10000        # ms
BATCH_COMMIT = 50           # commit DB mỗi 50 rows
```

Lưu ý: SLEEP_SEC giảm xuống 2s (so với 4s của crawler hiện tại) — phải test với `--limit 100` trước, nếu Cookpad không 429/403 thì OK chạy full. Nếu bị throttle → tăng ngược lên 4s.

**Flow:**
1. **Warm-up** trang chủ Cookpad để lấy cookies (giống `crawl_general_recipes.py` line 269-273)
2. **Query batch resumable:**
   ```python
   rows = (await db.execute(
       select(Recipe.id, Recipe.cookpad_url)
       .where(Recipe.source == 'cookpad')
       .where(Recipe.original_author_name.is_(None))
       .order_by(Recipe.save_count.desc().nulls_last(), Recipe.id)
       .limit(BATCH_SIZE)
   )).all()
   ```
3. **Mỗi recipe:**
   - `page.goto(cookpad_url, wait_until='domcontentloaded', timeout=PAGE_TIMEOUT)`
   - `page.wait_for_timeout(1500)`
   - Parse author theo thứ tự fallback:
     - **(a) JSON-LD:** `page.query_selector('script[type="application/ld+json"]')` → JSON.parse → `data.author.name`
     - **(b) `a[href*="/vn/users/"]`:** lấy `inner_text()` (link author thường nằm gần thumb)
     - **(c) `meta[itemprop="author"]`:** content attr
4. **DB UPDATE atomic:**
   ```python
   await db.execute(
       update(Recipe)
       .where(Recipe.id == recipe_id)
       .values(original_author_name=author_name)
   )
   ```
5. Commit batch 50 + sleep 4s.

**3 trạng thái UPDATE:**

| Kết quả parse | Action DB | Lý do |
|---|---|---|
| Có tên (e.g. "Hoàng Thị Tố Hà") | UPDATE `original_author_name = '<tên>'` | Lưu tên thật |
| Recipe đã xóa / không có author element | UPDATE `original_author_name = ''` | Empty string ≠ NULL → query `IS NULL` lần sau sẽ skip |
| Timeout / network error | KHÔNG UPDATE (giữ NULL) | Retry lần chạy sau |

**Argparse:**
- `--limit N` (test 10-100 trước khi chạy full)
- `--headless` (default True)
- `--sleep N` (default 2s, override để tăng/giảm khi cần)

**Resumability — guarantee:**
- Stop Ctrl+C lúc đang sleep → 0 rows mất
- Stop Ctrl+C giữa batch → mất tối đa 49 rows uncommitted (vẫn NULL) → lần sau retry
- Crash / kill -9 → Postgres WAL guarantee atomic per-transaction → không có partial state
- Filter `IS NULL` đảm bảo idempotent khi rerun
- **Chỉ chạy 1 instance script tại 1 thời điểm** (tránh double-scrape, không cấu trúc lock trong design)

**ETA:** 22k × 2s = ~12h. Chạy overnight 1 phiên hoặc chia nhiều phiên — resumable. Nếu bị Cookpad throttle, tăng SLEEP_SEC lên 4s → ~24h.

**Verification sau khi chạy xong:**
```sql
SELECT COUNT(*) FILTER (WHERE original_author_name IS NULL) AS pending,
       COUNT(*) FILTER (WHERE original_author_name = '') AS unavailable,
       COUNT(*) FILTER (WHERE original_author_name != '' AND original_author_name IS NOT NULL) AS scraped
FROM recipes WHERE source = 'cookpad';
```
Kỳ vọng `pending = 0`, `unavailable < 5%`, `scraped > 95%`.

---

## 7. Testing (manual smoke test cho thesis demo)

### Recognize page
- [ ] Recognize 5 ảnh từ 103 món curated → response có `dish_recipe.source = "curated"` + recipe đầy đủ
- [ ] Recognize 1 ảnh ngoài 103 (e.g. pizza, beef wellington) → OpenAI fallback + `dish_recipe.source = "ai-generated"` + cache row mới tạo trong `ai_generated_recipes`
- [ ] Recognize lại cùng ảnh pizza lần 2 → cache HIT, không gọi OpenAI lần 2 (verify qua log + AILog)
- [ ] Recognize ảnh không phải món ăn (xe hơi, người) → `dish_recipe: null`, frontend ẩn DishRecipeCard
- [ ] Click tên món → navigate `/search?q=<tên món>`
- [ ] Click nút CTA "Tìm công thức" → navigate `/search?q=<tên món>`
- [ ] AI-gen badge hiện ĐÚNG khi source=ai-generated, KHÔNG hiện khi source=curated

### RecipeCard author (listing pages)
- [ ] Recipe user-uploaded có author → hiện tên + avatar + link `/users/{id}` work
- [ ] Recipe Cookpad đã scrape → hiện tên + avatar fallback initials + KHÔNG clickable
- [ ] Recipe Cookpad chưa scrape (`original_author_name IS NULL`) → hiện "Unknown" + avatar "UN"
- [ ] Click author không bubble lên parent Link → không navigate sang recipe detail
- [ ] RecipeCard ở `/search`, `/recipes`, homepage, `/me/saved`, `/users/[id]` đều hiện author

### Recipe detail page author card (`/recipes/[id]`)
- [ ] Recipe user-uploaded → card đầy đủ (avatar 12x12, full_name, follower count, "Xem hồ sơ")
- [ ] Recipe Cookpad đã scrape → card hiện `original_author_name` + "Tác giả Cookpad" + nút "Xem trên Cookpad"
- [ ] Avatar fallback Cookpad dùng màu xanh `#2D6A4F` (phân biệt với user màu cam)
- [ ] Recipe Cookpad chưa scrape → card generic "Cookpad / Công thức tổng hợp" như cũ
- [ ] Nút "Xem trên Cookpad" mở `recipe.cookpad_url` ở tab mới

### Enrichment script
- [ ] Chạy `--limit 10` → DB có 10 rows update, log rõ ràng
- [ ] Ctrl+C giữa chừng → rows uncommitted vẫn NULL → chạy lại pick up đúng
- [ ] Chạy lại sau khi xong full → 0 rows được update (idempotent)

---

## 8. Migration plan

Thứ tự thực hiện:

1. **Migration 0003** (`ai_generated_recipes` table) → `alembic upgrade head`
2. **Migration 0004** (`recipes.original_author_name` column) → `alembic upgrade head`
3. **Tạo `dish_recipes.json`** (chạy `generate_dish_recipes.py`, manual review)
4. **Backend changes** (schemas, services, API)
5. **Frontend changes** (types, DishRecipeCard, RecognitionResult, RecipeCard)
6. **Enrichment script** (chạy `enrich_cookpad_authors.py` overnight)
7. **Smoke test full flow**

Bước 6 chạy background — không block UI release. Frontend sẽ hiện "Unknown" cho rows chưa scrape, sau khi script chạy xong tự động hiện tên thật (chỉ là data update, không cần restart).

---

## 9. Out of scope

- Edit/sửa OpenAI-generated recipes trong cache (admin tool) — defer
- Translate recipe names tiếng Anh → tiếng Việt cho OpenAI fallback — defer
- Author profile cho Cookpad authors (link đến trang Cookpad gốc) — defer
- Sửa `SuggestedRecipeCard` trong recognize carousel — ngoài scope
- AI generated recipes cho trang search (chỉ recognize) — ngoài scope
