# Thiết kế — Facet filter (vùng miền / dịp nấu / loại món / chế độ ăn) — sub-project 3/3

**Ngày:** 2026-06-04
**Branch:** `feat/canonical-recipes`
**Bối cảnh:** Catalog hiện **2615 canonical** (nguồn monngonmoingay + Cookpad + llm-canonical/curated). Trang `/recipes` đã có filter keyword + meal (sub-project 2/3). Thêm **4 facet** lọc nâng cao — lấp gap so monngonmoingay. Đây là sub-project DUY NHẤT cần **dữ liệu mới**: recipe chưa có cột vùng miền/dịp/loại/chế độ ăn → phải TAG trước rồi mới filter.

Tiền lệ: meal-filter (sub-project 2/3, `docs/superpowers/{specs,plans}/2026-06-03-meal-filter*`) — pattern cột ARRAY → backfill script → `list_recipes` param + where array → chip trên `RecipeBrowse.tsx`. Facet = 4× pattern đó, khác ở: nguồn tag = crawl, multi-select OR, vocab động.

---

## Quyết định đã chốt (với user)

- **Nguồn tag:** **Crawl MNMN taxonomy** (4 sitemap vungmien/dipnau/loaimon/dinhduong → map món→facet). 1:1 với 4 facet.
- **Gap coverage:** Crawl chỉ phủ subset `monngonmoingay` (~84%). ~400 canonical non-MNMN (llm-canonical + curated) → **LLM-fill** (reuse pattern `classify_meal_types`) vào ĐÚNG bộ raw-term mà crawl khám phá ra. Mục tiêu: mọi canonical được tag đủ 4 facet (NULL→0 per facet).
- **Vocabulary:** **Adopt MNMN raw terms** — chip values = danh sách term thô từ taxonomy. Crawl sinh `facet_vocab.json` làm single source of truth (dùng chung cho chip + allowed-labels của LLM-fill).
- **Select mode:** **Multi-select within facet (OR)** — chọn nhiều term trong 1 facet (OR), 4 facet kết hợp **AND across**, và AND với keyword/meal/difficulty/source/search sẵn có.
- **Schema:** 4 cột mới `ARRAY(String)` nullable (migration 0010), theo tiền lệ `meal_types` (0009).
- **Scope:** chỉ canonical (browse mặc định). Raw Cookpad/raw MNMN để NULL — không hiện ở browse mặc định.

### Non-goals
- Không tag raw Cookpad (~25k) hay raw MNMN.
- Không facet cho show_all/community pool.
- Không LLM-classify toàn bộ catalog (crawl là nguồn chính cho subset MNMN).

---

## Join key (đã verify trong repo)
- Recipe MNMN: `source == "monngonmoingay"`, `is_canonical == False`, URL nguồn lưu ở **`cookpad_url`** (reuse), có `canonical_dish_slug`.
- Taxonomy term page liệt kê recipe URL → match `Recipe.cookpad_url == url AND source='monngonmoingay'` → lấy `canonical_dish_slug` → canonical row (`is_canonical=True`, cùng slug). Nhiều raw → 1 canonical → **union** term.
- Helper crawl có sẵn: `crawl_mnmn.py` (`BASE="https://monngonmoingay.com"`, `SITEMAP_INDEX=/sitemap_index.xml`, `get()` httpx, `LOC_RE`, `ARTICLE_RE`).

---

## Components

### 1. Migration — `backend/alembic/versions/0010_recipe_facets.py`
- `ALTER TABLE recipes ADD COLUMN` 4 cột `ARRAY(String)` nullable: `regions`, `occasions`, `dish_types`, `diets`.
- Downgrade: drop 4 cột. Theo style migration thủ công của repo (không autogenerate).
- ORM `backend/app/models/recipe.py`: thêm 4 `Mapped[list[str] | None] = mapped_column(ARRAY(String), nullable=True)` cạnh `meal_types`.

### 2. Crawl — `backend/scripts/crawl_facets.py`
Reuse sitemap/httpx helpers từ `crawl_mnmn.py` (no Playwright).
1. Fetch `sitemap_index.xml` → chọn 4 sub-sitemap taxonomy: vungmien/dipnau/loaimon/dinhduong (match substring trên loc).
2. Mỗi sub-sitemap liệt kê **term page** (vd `/vung-mien/mien-bac/`). Mỗi term page → paginate, thu recipe URL (`ARTICLE_RE`).
3. Dựng `{facet: {term: set(recipe_url)}}`. Lưu:
   - `cookpad_recipe/facet_vocab.json` — raw term per facet (ordered) + label.
   - map url→{facet:[term]} (in-memory) cho bước tag.
4. **Tag DB:** với mỗi url, query raw MNMN recipe theo `cookpad_url` → `canonical_dish_slug` → canonical id; **union** term vào 4 cột của canonical. Idempotent (recompute từ crawl mỗi lần chạy; ghi đè theo union toàn bộ crawl, không cộng dồn lặp).
5. Log: số term/ facet, số canonical được tag/ facet, số url không match.

Facet → cột:
| Facet | Sitemap | Cột |
|---|---|---|
| Vùng miền | vungmien | `regions` |
| Dịp nấu | dipnau | `occasions` |
| Loại món | loaimon | `dish_types` |
| Chế độ ăn | dinhduong | `diets` |

### 3. LLM-fill — `backend/scripts/backfill_facets.py`
- Cho mỗi facet: select canonical `is_canonical=True AND <col> IS NULL` (~400 non-MNMN + bất kỳ MNMN món không nằm trong taxonomy đó).
- `classify_facets(client, title, facet, allowed_terms)` (mới, theo khuôn `classify_meal_types` gpt-4o-mini): trả **subset** của `allowed_terms` (đọc từ `facet_vocab.json`), fallback `[]`/term phổ biến nếu lỗi. Multi-label.
- `UPDATE recipes SET <col>=:terms WHERE id=:id`. Commit theo batch. Idempotent (chỉ chạm NULL → rerun an toàn).

### 4. API filter — `backend/app/services/recipe_service.list_recipes`
- Thêm 4 param `region/occasion/dish_type/diet: Optional[str] = None` (comma list, OR-within-facet).
- Mỗi facet có giá trị → split comma → Postgres **array overlap** `&&` (any-of):
  ```python
  if region:
      vals = [v for v in region.split(",") if v]
      if vals:
          stmt = stmt.where(text("recipes.regions && :rv").bindparams(
              bindparam("rv", value=vals, type_=ARRAY(String))))
  ```
  Tương tự `occasions/dish_types/diets`. NULL row không overlap → tự loại. Bindparam → injection-safe.
- 4 facet AND across; AND với keyword/meal/difficulty/source/search. (Import `bindparam`, `ARRAY`, `String` nếu chưa có; `text` đã dùng sẵn.)

### 5. Endpoint — `backend/app/api/v1/recipes.py` (GET list)
- Thêm 4 query param `region/occasion/dish_type/diet: Optional[str] = Query(default=None)` → forward vào `list_recipes`. Param khác giữ nguyên.

### 6. Frontend — `frontend/app/recipes/RecipeBrowse.tsx` + `frontend/lib/facets.ts`
- `frontend/lib/facets.ts` (sinh từ `facet_vocab.json`): export
  `FACETS = [{ key:"region", param:"region", label:"Vùng miền", terms:[{value,label}] }, …4 facet]`.
- Render **4 hàng facet chip** (label + chip wrapping, multi-select), reuse style chip meal. State = URL comma param (`region`, `occasion`, `dish_type`, `diet`). Click chip = toggle vào/ra comma list của param đó.
- Thêm 4 param vào API call + effect deps; gộp vào `hasFilters`; `updateParam` reset `page=1`. "Xóa bộ lọc" clear cả 4 facet.
- **Layout:** facet nhiều term (dish-type/occasion) → nếu > ~12 term, collapse sau toggle **"Xem thêm"** (ngưỡng chốt từ số liệu crawl thực tế trong plan).

---

## Data flow
```
crawl_facets.py
  sitemap_index → 4 taxonomy sub-sitemap → term pages → recipe URLs
  → facet_vocab.json (raw terms)
  → match cookpad_url → canonical_dish_slug → canonical → union 4 cột
backfill_facets.py
  canonical NULL per facet → classify_facets(allowed=facet_vocab) → tag
/recipes UI chip (multi) → ?region=a,b&dish_type=c
  → list_recipes(region="a,b", dish_type="c")
  → where regions && {a,b}  AND  dish_types && {c}  → cards
```

## Error handling
- Crawl: fetch fail 1 page → skip (như `crawl_mnmn.get()`); url không match canonical → đếm + bỏ qua.
- LLM-fill: lỗi 1 món → fallback `[]` (giữ NULL, rerun sau); rerun chỉ chạm NULL.
- API: facet param rỗng/space → bỏ qua (không lỗi); term lạ → overlap rỗng (không match, không lỗi).
- UI: không chọn term → không gửi param facet đó.

## Verification
- **Crawl:** chạy → in #term/facet + #canonical tagged/facet + #url unmatched; `facet_vocab.json` tồn tại, 4 facet non-empty; spot-check (phở→regions chứa term miền Bắc).
- **LLM-fill:** chạy → `count(is_canonical AND <col> IS NULL)` = 0 (hoặc ~0 nếu vài lỗi LLM) cho cả 4 cột.
- **API:** `?region=<t>` → mọi card overlap; `?region=<t>&dish_type=<u>` lọc AND; multi `?dish_type=a,b` → OR.
- **Frontend:** `npx tsc --noEmit` 0 lỗi mới (chỉ 3 file pre-existing: `app/admin/page.tsx`, `app/me/profile/page.tsx`, `app/recognize/page.tsx`); manual: toggle chip nhiều term, URL comma sync, "Xóa bộ lọc" clear hết, kết hợp keyword/meal AND.

## Vị trí
Sub-project 3/3 (cuối). Hoàn tất bộ filter `/recipes`: keyword + meal (2/3) + 4 facet (3/3).

## Ghi chú vận hành
- Backend chạy từ `backend/`: `$env:PYTHONUTF8=1; .venv\Scripts\python.exe -m scripts.<name>`. Frontend từ `frontend/`.
- **Vocab artifact policy (chốt):** `cookpad_recipe/facet_vocab.json` là output thô của crawl → **KHÔNG commit** (theo rule `cookpad_recipe/*.json`). UI dùng `frontend/lib/facets.ts` — file generate từ `facet_vocab.json` và **CÓ commit**. Crawl emit json; một bước nhỏ (trong `crawl_facets.py` hoặc thủ công) sinh `facets.ts`. Backend filter không cần vocab (lọc theo value bất kỳ).
- KHÔNG commit `.claude/settings*`, `backups/`, `cookpad_recipe/*.json`. Commit cuối mỗi task: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
