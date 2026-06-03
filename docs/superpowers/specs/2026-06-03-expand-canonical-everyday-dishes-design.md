# Thiết kế — Mở rộng catalog canonical: ~200 món Việt hằng ngày

**Ngày:** 2026-06-03
**Branch:** `feat/canonical-recipes`
**Bối cảnh:** Catalog tra cứu hiện có **405 canonical** (mỗi món 1 công thức authoritative), trong đó 103 món AI nhận diện ⊆ canonical. User muốn **cào + chuẩn hóa thêm ~200 món Việt hằng ngày** (ăn sáng/trưa/tối) để tăng độ phủ phần tra cứu. Tái dùng pipeline canonical sẵn có.

---

## 1. Mục tiêu
Thêm **~200 món Việt phổ biến hằng ngày** vào catalog canonical (mỗi món 1 công thức chuẩn), ưu tiên món nấu cho **bữa sáng / trưa / tối**. Mỗi món mới gắn thuộc tính **`meal_types`** (sáng/trưa/tối) để sau lọc/gợi ý theo bữa.

## 2. Quyết định đã chốt (với user)
- **Cách chọn danh sách:** curated — Claude sinh danh sách ~200 món, **tự lọc trùng** với 405 canonical + 103 AI-class; user duyệt/chỉnh.
- **Quy mô:** ~200 món (cào trước, dedup có thể giảm số canonical thực tế).
- **Món cào quá ít candidate (< ngưỡng):** **LLM-curated fallback** (sinh công thức như 10 món curated cũ) — luôn có 1 canonical, không bỏ món.
- **`meal_types`:** thêm **cột DB mới** (migration), populate cho món mới. 405 cũ để NULL (backfill sau, ngoài scope).
- **Lookup-only:** món mới KHÔNG nhận diện-bằng-ảnh (model AI giữ 103 class, không retrain). Bất biến **AI ⊆ lookup** vẫn đúng (chỉ THÊM vào lookup).
- **Tiếp cận:** A — tái dùng pipeline canonical, đổi "driver" (danh sách curated thay vì gap của 103 AI-class).
- **Nguồn cào: 2 nguồn — monngonmoingay.com ƯU TIÊN, Cookpad bổ sung.** Mỗi món lấy candidate từ MNMN trước (chất lượng cao, structured), thiếu thì bù Cookpad, vẫn thiếu → LLM-curated fallback.

### Nguồn dữ liệu (đã verify trực tiếp 2026-06-03)
| Nguồn | Vai trò | Lý do |
|---|---|---|
| **monngonmoingay.com** | **Primary** | JSON-LD `Recipe` đầy đủ (recipeIngredient/recipeInstructions HowToStep/ảnh), **server-rendered → httpx lấy được, KHÔNG cần Playwright**, có sitemap liệt kê toàn bộ công thức, curated chuyên nghiệp, đúng món hằng ngày. |
| **Cookpad (cookpad.com/vn)** | Supplement | Volume lớn (UGC); reuse `crawl_general_recipes.py` (Playwright). Dùng khi MNMN thiếu candidate cho món. |
| cooky.vn | Loại | Cert SSL hỏng (curl fail cả `-k`). |
| bachhoaxanh.com/vao-bep | Loại (tạm) | robots cho phép nhưng client-rendered (JS) → cần Playwright, chưa cần. |
| savourydays / esheepkitchen | Loại | Bánh ngọt-only / domain parked. |

### Non-goals
- Không retrain/đụng model AI; món mới không thêm vào `CLASS_DISPLAY_NAMES`.
- Không xây UI lọc-theo-bữa trong task này (chỉ LƯU `meal_types` + expose ở schema; trang lọc/gợi ý = việc sau).
- Không backfill `meal_types` cho 405 món cũ.
- Không đụng frontend ngoài việc schema trả thêm `meal_types`.

## 3. Kiến trúc & components

### 3.1 Danh sách curated — `backend/scripts/data/new_dishes.py`
- `NEW_DISHES: list[dict]`, mỗi phần tử `{ "slug": str, "name": str, "meals": list[str] }` với `meals ⊆ {"sang","trua","toi"}`.
- ~200 món Việt hằng ngày, nhóm theo bữa khi soạn (cơm/kho/xào/canh/luộc/chiên; bún/phở/cháo/xôi/bánh mì ăn sáng; món nhậu/lẩu bữa tối…).
- `slug` = slugify tên (NFKD strip dấu, `đ→d`, kebab-case). **Tự lọc trùng**: bỏ slug đã ∈ 405 canonical hoặc ∈ `CLASS_DISPLAY_NAMES` (so khớp normalized name).
- File này user review trước khi crawl.

### 3.2 Migration + model — `meal_types`
- **Migration 0009** (`down_revision="0008"`): `op.add_column("recipes", sa.Column("meal_types", postgresql.ARRAY(sa.String()), nullable=True))`.
- `backend/app/models/recipe.py`: `meal_types: Mapped[list[str] | None] = mapped_column(ARRAY(String), nullable=True)`.

### 3.3a Crawl PRIMARY — `backend/scripts/crawl_mnmn.py` (monngonmoingay)
- **Index 1 lần:** tải `sitemap_index.xml` → lọc các sitemap chứa công thức (vd `cachnau-sitemap*.xml`) → gom toàn bộ URL công thức → build `slug→url` (cache `cookpad_recipe/_mnmn_index.json`).
- **Match món:** với mỗi `NEW_DISHES` món, tìm URL có slug khớp tên chuẩn hóa (normalized prefix/substring; lấy tối đa `MAX_PER_DISH=15` URL khớp).
- **Scrape:** httpx GET (UA Chrome) từng URL → parse **JSON-LD `Recipe`** (`name`, `recipeIngredient[]`, `recipeInstructions[].text` (HowToStep), `image`, `description`). KHÔNG cần Playwright.
- Lưu `cookpad_recipe/new_<slug>.json` với mỗi record gắn `"src":"monngonmoingay"` + `url`. **Resumable** per-file. `SLEEP_SEC=2` (polite). Robots chỉ chặn `/wp-admin/` → OK.

### 3.3b Crawl SUPPLEMENT — `backend/scripts/crawl_new_dishes.py` (Cookpad)
- Chỉ chạy cho món mà MNMN trả **< `MIN_REAL=3`** candidate.
- Phỏng theo `crawl_missing_dishes.py`, driver = các món thiếu: `search_all_recipes(page, name)` (Playwright) → `title_matches` → scrape tối đa `MAX_PER_DISH` → **append** vào cùng `cookpad_recipe/new_<slug>.json` với `"src":"cookpad"`. Resumable, `SLEEP_SEC=4`, warm-up homepage.

### 3.4 Import thô — `backend/scripts/import_new_crawled.py`
- Đọc `new_<slug>.json` (gồm cả record `src=monngonmoingay` lẫn `cookpad`), insert `Recipe`: `source` = `"monngonmoingay"` | `"cookpad"` theo record, `canonical_dish_slug=slug`, `is_canonical=False`. Idempotent qua URL gốc (`cookpad_url`/`source_url`). Parse ingredients/steps theo format mỗi nguồn (MNMN: list JSON-LD; Cookpad: như import cũ).

### 3.5 Chuẩn hóa — `backend/scripts/canonicalize_new_dishes.py`
- Phỏng theo `fill_missing_canonical.py`: cho mỗi slug ∈ NEW_DISHES:
  - Gom candidate = recipes `canonical_dish_slug==slug AND is_canonical==False`.
  - **≥ `MIN_REAL=3` candidate** → LLM **judge+refine** (reuse logic trong `fill_missing_canonical`/`select_canonical_recipes`) → chọn+refine 1 canonical, `source="llm-canonical"`.
  - **< MIN_REAL** → **LLM-curated fallback**: sinh công thức mới (như `generate_dish_recipes`), insert `source="curated-canonical"`.
  - Set `is_canonical=True`, `canonical_dish_slug=slug`, **`meal_types`** từ `NEW_DISHES[slug].meals`.
  - Idempotent: skip slug đã có canonical.

### 3.6 Schema expose (tối thiểu)
- `backend/app/schemas/recipe.py`: thêm `meal_types: list[str] | None = None` vào **`RecipeDetailOut`** (chỉ detail, không thêm vào card để giữ nhẹ). Builder detail truyền field từ `recipe.meal_types`. **Không** thêm endpoint/filter mới.

## 4. Data flow
```
new_dishes.py (curated, deduped)
  → crawl_mnmn.py (PRIMARY)      → new_<slug>.json (src=monngonmoingay, JSON-LD)
  → crawl_new_dishes.py (SUPP.)  → append new_<slug>.json (src=cookpad) chỉ cho món < MIN_REAL
  → import_new_crawled.py        → Recipe rows (source=monngonmoingay|cookpad, tag slug, is_canonical=False)
  → canonicalize_new_dishes.py   → 1 canonical/slug (judge+refine real, ≥MIN_REAL) | LLM-curated fallback (<MIN_REAL) + meal_types
  → verify_canonical_subset.py (+ count mới) PASS
```
Thứ tự candidate khi canonicalize: gộp mọi record cùng slug (MNMN + Cookpad); judge+refine ưu tiên bản MNMN làm gốc nếu chất lượng tương đương (structured, sạch hơn).

## 5. Dedup & bất biến
- Slug mới ∉ {405 canonical slugs} ∪ {103 AI slugs} (lọc ở 3.1).
- Sau pipeline: **0 trùng slug canonical**, **0 trùng tên canonical** (normalized), **103 AI ⊆ canonical** vẫn đúng (`verify_canonical_subset.py` PASS).
- `meal_types` chỉ set cho món mới; 405 cũ NULL.

## 6. Error handling
- MNMN: httpx timeout/HTTP lỗi → skip URL, tiếp; trang không có JSON-LD `Recipe` hoặc thiếu `recipeIngredient` → bỏ qua record. Sitemap index cache để rerun không tải lại.
- Crawl Cookpad: resumable per-file; Cookpad chặn/timeout → skip recipe, sleep, tiếp; warm-up cookies.
- LLM: judge+refine có cost cap (≈$ vài đô cho ~200 món); fallback curated khi thiếu data; idempotent skip để rerun an toàn.
- Import: idempotent qua `cookpad_url` (không nhân đôi khi rerun).
- Món crawl 0 kết quả thật → vẫn ra canonical nhờ curated fallback.

## 7. Verification
- Sau mỗi giai đoạn: đếm file crawl, số recipe import, số canonical mới.
- `verify_canonical_subset.py` PASS (subset + 0 dup-title + children).
- Query: `canonical count` (405 → ~5xx), `count where meal_types is not null` ≈ số món mới, 0 slug canonical trùng.
- Spot-check vài canonical mới (judge score, refinement_notes, meal_types đúng).

## 8. Vị trí
Mở rộng dữ liệu canonical (tiếp nối canonical-subset). Độc lập với 3 sub-project còn lại (personalization, substitution, video).
