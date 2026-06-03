# Thiết kế — Mở rộng catalog canonical bằng crawl toàn bộ monngonmoingay.com

**Ngày:** 2026-06-03
**Branch:** `feat/canonical-recipes`
**Bối cảnh:** Catalog tra cứu hiện có **405 canonical** (mỗi món 1 công thức authoritative; 103 món AI ⊆ canonical). User muốn **cào toàn bộ monngonmoingay.com** (MNMN) — nguồn curated chuyên nghiệp, món Việt hằng ngày — rồi auto-discover + chuẩn hóa thành canonical mới. Tăng độ phủ phần tra cứu, lookup-only.

> **Pivot (đã thống nhất):** ban đầu định curated ~200 món + Cookpad. Đổi sang **crawl-all MNMN + auto-discover** vì MNMN structured (JSON-LD), server-rendered (httpx, không Playwright), **curated 1 công thức/món** nên mỗi recipe MNMN authoritative → đủ làm canonical sau khi LLM polish. Cookpad supplement HOÃN.

---

## 1. Mục tiêu
Cào **toàn bộ** công thức MNMN (~2000+), import thô (browse), và **auto-discover** các món **MỚI** (chưa có trong 405 canonical) → mỗi món 1 canonical (LLM refine bản MNMN) + gắn **`meal_types`** (sáng/trưa/tối). Lookup-only.

## 2. Quyết định đã chốt (với user)
- **Nguồn:** MNMN-only pass này (`monngonmoingay.com`). Cookpad supplement **hoãn** (gần như mỗi món MNMN 1 candidate → bật Cookpad = hàng trăm lượt Playwright, nhiều giờ).
- **Quy mô:** cào HẾT MNMN; số canonical mới = số món MNMN khác 405 (auto, không cap). Dự kiến +vài trăm món, +~2000 recipe browse. LLM ~$5-15.
- **Chuẩn hóa:** mỗi recipe MNMN = 1 món (title = tên món, đã sạch). Món → **LLM refine** (KHÔNG cần ngưỡng ≥3 candidate; MNMN curated là authoritative). Món có >1 recipe MNMN cùng slug → judge+refine chọn bản tốt nhất.
- **Trùng 405 (slug đã canonical) → THAY THẾ (MNMN thắng):** demote canonical cũ `is_canonical=False`, promote bản MNMN-refined làm canonical, **giữ nguyên `canonical_dish_slug`**. **KHÔNG xóa** row cũ (giữ FK saves/ratings/comments/meal-plan/AI-log; nó thành recipe thường, vẫn browse được). Áp dụng cả cho 103 AI-class (slug giữ nguyên → AI lookup vẫn trỏ đúng canonical mới).
- **`meal_types`:** cột DB mới (migration), **LLM tag** mỗi món mới (gộp vào call refine).
- **Lookup-only:** không retrain/đụng model AI; không thêm vào `CLASS_DISPLAY_NAMES`. Bất biến **AI ⊆ lookup** vẫn đúng.
- **Lọc rác:** chỉ nhận trang có JSON-LD `@type=Recipe` + `recipeIngredient` không rỗng (loại "thực đơn tuần/mẹo vặt").

### Non-goals
- Không Cookpad pass này; không curated-200 list (món đến từ MNMN).
- Không retrain AI; không backfill `meal_types` cho 405 cũ (chỉ set cho canonical do pass này tạo/thay).
- Không xây UI lọc-theo-bữa (chỉ LƯU + expose schema).
- Không XÓA recipe cũ khi thay thế (chỉ demote `is_canonical=False`).

### Nguồn dữ liệu (đã verify trực tiếp 2026-06-03)
| Nguồn | Vai trò | Bằng chứng |
|---|---|---|
| **monngonmoingay.com** | **Engine** | JSON-LD `Recipe` đầy đủ (recipeIngredient/recipeInstructions HowToStep/ảnh/rating); server-rendered → httpx OK, không Playwright; `sitemap_index.xml` (recipe ở `cachnau-sitemap*.xml`); robots chỉ chặn `/wp-admin/`. |
| Cookpad | Hoãn | UGC/Playwright; để đợt sau nếu cần bù món MNMN thiếu. |
| cooky.vn / bachhoaxanh / savourydays / esheep | Loại | cert hỏng / JS-rendered / bánh ngọt-only / parked. |

## 3. Kiến trúc & components

### 3.1 Migration + model — `meal_types`
- **Migration 0009** (`down_revision="0008"`): `op.add_column("recipes", sa.Column("meal_types", postgresql.ARRAY(sa.String()), nullable=True))`.
- `app/models/recipe.py`: `meal_types: Mapped[list[str] | None] = mapped_column(ARRAY(String), nullable=True)`.

### 3.2 Crawl — `backend/scripts/crawl_mnmn.py` (httpx, không Playwright)
- **Enumerate:** GET `sitemap_index.xml` → chọn sub-sitemap công thức (`cachnau-sitemap*.xml`; nếu không chắc, fetch các sub-sitemap rồi lọc bằng JSON-LD Recipe ở bước scrape) → gom toàn bộ `<loc>` URL. Cache `cookpad_recipe/_mnmn_urls.json`.
- **Scrape:** với mỗi URL: httpx GET (UA Chrome, timeout, retry nhẹ) → trích block `<script type="application/ld+json">` → parse JSON (xử lý cả `@graph`) → tìm node `@type` chứa `Recipe`. Lấy `name`, `recipeIngredient[]`, `recipeInstructions[].text` (HowToStep; cũng hỗ trợ chuỗi/HTML), `image`, `description`.
- **Lọc:** bỏ trang không có Recipe hoặc `recipeIngredient` rỗng.
- **Lưu:** ghi dần `cookpad_recipe/mnmn_all.json` (list record: `{name, url, ingredients[], instructions[], image, description, src:"monngonmoingay"}`). **Resumable** (skip url đã có). `SLEEP_SEC≈1.5` (polite).

### 3.3 Import thô — `backend/scripts/import_mnmn.py`
- Đọc `mnmn_all.json`; mỗi record insert `Recipe`: `source="monngonmoingay"`, `cookpad_url=<MNMN url>` (tái dùng cột làm khóa dedup), `is_canonical=False`, `canonical_dish_slug = slugify(name)`. Parse ingredients (RecipeIngredient rows) + steps (RecipeStep rows) như import hiện có.
- **Idempotent** qua `cookpad_url` (rerun không nhân đôi).
- `slugify`: NFKD strip dấu, `đ→d`, lowercase, `[^a-z0-9]+ → -`, trim/collapse.

### 3.4 Auto-discover + canonical — `backend/scripts/canonicalize_mnmn.py`
- Map slug → canonical_recipe_id hiện có (405) + set slug AI (`CLASS_DISPLAY_NAMES`).
- Gom recipe MNMN theo `canonical_dish_slug`. Với **mỗi slug** có recipe MNMN:
  - Candidates = recipe MNMN (1+ bản) cùng slug.
  - **LLM refine** (reuse logic `fill_missing_canonical`/`select_canonical_recipes`): judge+chọn bản tốt nhất (nếu >1) + refine title/ingredients/steps về chuẩn; cùng call trả **`meal_types`** (subset `["sang","trua","toi"]`). Bản refine = 1 canonical mới `source="llm-canonical"`, `canonical_dish_slug=slug`, `is_canonical=True`, + `meal_types`, `refinement_notes`, `llm_judge_score/reason`.
  - **Nếu slug ∈ 405 (trùng):** trước khi promote bản mới, **demote canonical cũ** (`UPDATE recipes SET is_canonical=False WHERE id=<old_canonical_id>`); KHÔNG xóa. Slug giữ nguyên → AI lookup vẫn đúng.
  - **Nếu slug mới:** chỉ promote bản mới.
- **Idempotent:** đánh dấu đã xử lý (vd cờ/`refinement_notes` chứa "mnmn") để rerun skip slug đã thay; tránh thay vòng lặp. Cost cap + log; per-slug try/except (lỗi 1 slug không chặn slug khác).

### 3.5 Schema expose (tối thiểu)
- `app/schemas/recipe.py`: thêm `meal_types: list[str] | None = None` vào **`RecipeDetailOut`**; builder detail truyền `recipe.meal_types`. Không thêm endpoint/filter.

## 4. Data flow
```
sitemap_index.xml
  → crawl_mnmn.py     → cookpad_recipe/mnmn_all.json  (~2000+, JSON-LD, đã lọc Recipe)
  → import_mnmn.py    → Recipe rows (source=monngonmoingay, slug=slugify(title), is_canonical=False)
  → canonicalize_mnmn.py → mỗi slug: LLM refine → canonical (llm-canonical) + meal_types
                            (slug trùng 405 → demote canonical cũ rồi promote bản MNMN; slug mới → thêm)
  → verify_canonical_subset.py (+ count) PASS
```

## 5. Dedup & bất biến
- Slug MNMN trùng 405/103 → **thay thế** (demote cũ + promote MNMN), giữ **đúng 1 canonical/slug**. Slug mới → thêm canonical.
- Bất biến giữ nguyên: **0 trùng slug canonical**, **0 trùng tên canonical** (normalized), **103 AI ⊆ canonical** vẫn đúng (mỗi slug AI vẫn có đúng 1 canonical — chỉ đổi bản) → `verify_canonical_subset.py` PASS.
- `meal_types` set cho mọi canonical pass này tạo/thay; 405 không-bị-thay vẫn NULL.

## 6. Error handling
- MNMN scrape: httpx timeout/HTTP lỗi → skip URL, tiếp; không có JSON-LD Recipe / thiếu ingredient → bỏ record. URL list + mnmn_all.json cache để rerun không tải lại.
- Import: idempotent qua `cookpad_url`; record thiếu field → skip.
- LLM: cost cap; idempotent skip slug đã canonical → rerun an toàn; lỗi 1 slug không chặn slug khác (try/except per slug, log).
- Slug rỗng/không hợp lệ sau slugify → skip.

## 7. Verification
- Đếm: URL sitemap, record `mnmn_all.json`, recipe import (`source=monngonmoingay`), canonical **mới** vs **thay thế**.
- `verify_canonical_subset.py` PASS — **mỗi slug đúng 1 canonical** (sau thay thế không sinh 2), 103 AI ⊆ canonical.
- Query: `canonical count` (405 → 4xx/5xx), `count(meal_types not null)`, `count where source=monngonmoingay`, **0 slug có >1 canonical**, demoted cũ = `is_canonical=False` (không xóa).
- Spot-check: vài món thay thế (canonical mới là bản MNMN, slug giữ nguyên, AI-class lookup OK) + vài món mới (meal_types, ingredients/steps đầy đủ).

## 8. Vị trí
Mở rộng dữ liệu canonical (tiếp nối canonical-subset). Độc lập 3 sub-project còn lại (personalization, substitution, video). Cookpad supplement = đợt sau (optional).
