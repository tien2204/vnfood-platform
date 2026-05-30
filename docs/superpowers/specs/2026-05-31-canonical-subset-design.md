# Thiết kế — Đảm bảo "AI-recognizable ⊆ Lookup" + hợp nhất hệ canonical

**Ngày:** 2026-05-31
**Branch:** `feat/canonical-recipes`
**Liên quan:** ADR 0002 (canonical-recipes), spec 2026-05-27-canonical-recipes-design.md

---

## 1. Bối cảnh & vấn đề

Platform có 2 phần: **nhận diện món ăn** (AI model cascade 103 class) và **tra cứu món ăn** (369 canonical recipes). Yêu cầu nghiệp vụ: **tập món AI nhận diện được phải là tập con của tập món tra cứu được** — mọi món AI đoán ra đều phải có công thức chuẩn để tra.

### Số liệu điều tra (đo thật từ DB ngày 2026-05-31)

- **AI model nhận diện 103 class riêng biệt** (`backend/app/ai/class_names.py` · `CLASS_DISPLAY_NAMES` — source of truth, cố định).
- **369 canonical recipes** (`recipes.is_canonical = true`), 369 `canonical_dish_slug` distinct, 0 null, 0 dessert.
- **Subset BỊ VI PHẠM:** chỉ **46/103** AI class có canonical recipe khớp `canonical_dish_slug`. **57 class thiếu** (trong đó 5 món có canonical dưới slug khác, 52 hoàn toàn không có).
- **Trùng tên hiển thị:** 17 cụm title trùng nhau (1 cụm ×4, 16 cụm ×2 = 36 recipe), do pipeline LLM extract slug tách cùng 1 món thành nhiều slug (vd `pho` + `pho-bo` cùng title "Phở Bò"), kèm slug rác (`*-unknown`, slug có dấu, typo, catch-all viết hoa `Xôi`).
- **2 hệ recipe rời nhau:** `/recognize` hiển thị công thức từ `backend/app/ai/dish_recipes.json` (103 entry curated, in-memory, 1:1 với AI class) — KHÔNG phải từ 369 canonical. Tra cứu dùng canonical. Hai nguồn độc lập, có thể phân kỳ.

### Phân tích khả thi gap-fill (đo thật)

Đếm candidate Cookpad trong 22k recipe hiện có cho 57 món thiếu (ngưỡng pipeline gốc = ≥5):

| Nhóm | Số món | Ghi chú |
|---|---|---|
| ≥5 candidate sẵn | 13 | judge+refine chạy được ngay |
| 1–4 candidate sẵn | 15 | quá ít để judge |
| 0 candidate sẵn | 29 | dataset 22k không có |

→ Pipeline thật một mình không phủ nổi 44/57 món. Cần crawl thêm Cookpad + lưới an toàn curated.

---

## 2. Mục tiêu & tiêu chí thành công

Kiểm chứng bằng script regression sau mỗi pha:

1. **103/103** AI class có **đúng 1** canonical recipe với `canonical_dish_slug` = AI slug.
2. **0** canonical recipe trùng `title`.
3. recognize mọi class → `canonical_recipe` khác null, link sang `/recipes/[id]` thật.
4. **Một nguồn duy nhất:** lookup và recognize cùng đọc canonical DB.

### Non-goals

- KHÔNG đổi `class_names.py` (AI class slug/tên giữ nguyên tuyệt đối).
- KHÔNG retrain model.
- KHÔNG đổi schema DB (migration 0006 đã đủ cột).
- KHÔNG đổi `title` hiển thị của recipe giữ lại (chỉ căn `canonical_dish_slug`).

---

## 3. Nguyên tắc cốt lõi (đã làm rõ với user)

Phân biệt **slug** (khóa ẩn nối AI ↔ recipe) vs **title** (tên hiển thị):

- AI class (slug + display name) **cố định, không đổi**.
- Cái được căn cho khớp AI là cột `canonical_dish_slug` của recipe — người dùng không thấy.
- Title hiển thị **không bị đổi**. Vd AI class `pho` → canonical recipe `canonical_dish_slug='pho'` nhưng title vẫn là "Phở Bò".
- Dedupe = **bớt bản trùng** (hạ `is_canonical`), không phải đổi tên.

---

## 4. Quyết định đã chốt

| Quyết định | Lựa chọn |
|---|---|
| Gap-fill 57 món | **Hybrid crawl-first** (B thật khi có candidate, curated khi 0) |
| Ngưỡng dùng candidate sẵn (22k) | ≥5 → pipeline B |
| Ngưỡng sau crawl | **≥1 candidate thật → pipeline B; 0 → curated** |
| Dedupe 17 cụm | **D1** giữ best, hạ cờ phần còn lại |
| Nhóm A (slug∈AI) | **(b)** giữ nội dung bản điểm cao nhất + đổi `canonical_dish_slug` về AI slug |
| `com-chien-ca-hoi` | **Hạ** (đã verify: nội dung là Cơm Chiên Dương Châu, không có cá hồi) |
| Unify | **U1** canonical = single source of truth |

---

## 5. Thiết kế chi tiết — 3 pha idempotent

Chạy tuần tự Pha 1 → 2 → 3. Mỗi pha idempotent (chạy lại không hỏng). Verify regression giữa các pha.

### Pha 1 — Dedupe (D1)

**Script:** `backend/scripts/dedupe_canonical.py`

Với mỗi cụm canonical recipe trùng `title` (chuẩn hóa):
1. **Chọn bản giữ** theo quy tắc ưu tiên:
   - ① Nội dung bản có `llm_judge_score` cao nhất.
   - ② Tie-break: slug sạch hơn (loại `-unknown`, slug chứa ký tự có dấu, typo rõ ràng, catch-all viết hoa).
2. **Căn slug (phương án b):** nếu cụm có một slug ∈ 103 AI class, **set `canonical_dish_slug` của bản giữ = AI slug đó** (kể cả khi bản giữ vốn mang slug dài hơn). Bảo toàn subset mà vẫn giữ recipe chất lượng nhất.
3. **Hạ các bản còn lại:** `is_canonical = false` (giữ nguyên trong DB như recipe cộng đồng thường, không xóa). Reversible.

**17 cụm cụ thể** (✦ = slug∈AI):

*Nhóm A — giữ slug AI (7 cụm):* Phở Bò→`pho`✦ · Bún Bò Huế→`bun-bo-hue`✦ (giữ nội dung bản 9.0, re-slug) · Bún Riêu Cua→`bun-rieu`✦ (giữ nội dung bản 9.0, re-slug) · Canh Chua Cá Lóc→`canh-chua`✦ · Cơm Chiên Tôm→`com-chien`✦ · Bánh Da Lợn→`banh-da-lon`✦ · Cơm Rang Dưa Bò→`com-rang-dua-bo`✦

*Nhóm B — loại slug rác (4 cụm):* Cơm Chiên Dương Châu→giữ `com-chien-duong-chau`, hạ `com-chien-unknown`/`com-chiên-duong-chau`/`com-chien-ca-hoi` · Xôi Khúc→`xoi-khuc` (hạ `Xôi`) · Bánh Chuối Hấp Nước Cốt Dừa→`banh-chuoi-hap` (hạ `-unknown`) · Cơm Chiên Cá Mặn→`com-chien-ca-man` (hạ typo `ca-mang`)

*Nhóm C — chọn bản khớp tên/điểm cao (6 cụm):* Cơm Chiên Dưa Bò→`com-chien-dua-bo` · Canh Bầu Nấu Tôm→`canh-bau-nau-tom` · Canh Khổ Qua Nhồi Thịt→`canh-kho-qua-nhoi-thit` · Canh Sườn Bò→`canh-suon-bo` · Canh Ngao Chua→`canh-ngao-chua` · Canh Bí Đỏ Thịt Bằm→`canh-bi-do-thit-bam`

**Kết quả:** 369 → **350** canonical, 0 trùng title, 46 AI-slug canonical bảo toàn.

### Pha 2 — Gap-fill 57 món thiếu (crawl-first hybrid)

**2a. Pipeline B trên candidate sẵn (13 món ≥5 candidate)**
Tái dùng logic judge+refine trong `backend/scripts/select_canonical_recipes.py`. Gom candidate bằng **title-keyword match** (vì slug cluster rỗng cho mấy món này): normalize title chứa display name, top 5 theo `save_count` + có ảnh. GPT-4o-mini judge → refine → INSERT canonical.

**2b. Crawl có target (44 món 0–4 candidate)**
**Script:** `backend/scripts/crawl_missing_dishes.py` — adapt `crawl_general_recipes.py` (browser context, infinite-scroll search, `scrape_recipe`).
- Config mới: map mỗi slug thiếu → search term = tên món (`bánh canh`, `tiết canh`, `khâu nhục`, `trứng vịt lộn`…).
- Filter title **chứa** tên món (nới từ `starts_with` vì món nhiều chữ như "Ba ba nấu chuối đậu" rất ít kết quả).
- Scrape ~10–15 bản/món, resumable, sleep 4s, output `cookpad_recipe/missing_<slug>.json`.

**2c. Import crawled → DB**
Tái dùng pattern `backend/scripts/import_recipes.py`: INSERT recipe `source='cookpad'`, `status='approved'`, `canonical_dish_slug` = AI slug, child `RecipeIngredient`/`RecipeStep`. Lợi phụ: trang lookup có recipe cộng đồng thật cho các món này. Author enrichment = follow-up tùy chọn (không chặn).

**2d. Pipeline B hoặc curated fallback (mỗi món trong 44)**
- Sau import, nếu món có **≥1 candidate thật** (sẵn + crawled) → pipeline B judge+refine → INSERT canonical `source='llm-canonical'`.
- Nếu crawl ra **0 bản** → **promote curated**: INSERT canonical từ `dish_recipes.json[slug]`, `source='curated-canonical'`. Tạo child từ mảng `ingredients`/`steps` (populate `RecipeIngredient.display_text`, `RecipeStep.content` + `step_number`).

**Thuộc tính canonical mới (mọi nhánh):** `is_canonical=true`, `canonical_dish_slug`=AI slug, `is_dessert=false`, `variant_label=null`, gán account hệ thống như llm-canonical hiện có. Skip nếu slug đã có canonical (idempotent).

**Kết quả:** + 57 canonical (slug=AI) → **103/103** AI class phủ. Tổng canonical ≈ **407** (động theo kết quả crawl; nhiều "thật" hơn, ít curated hơn).

### Pha 3 — Unify (U1: canonical = single source)

**Backend `backend/app/services/ai_service.py`:**
- Nhánh VNFood (103 class): dựa hoàn toàn `canonical_recipe` từ `_find_canonical_for_class` (giờ luôn khác null). **Bỏ đính `dish_recipe` curated** cho nhánh này.
- Nhánh OpenAI OOD (món ngoài 103): giữ nguyên `get_or_generate_ai` (`ai-generated`) — món này không thể nằm trong lookup.
- `dish_recipes.json` lui về vai trò: seed cho Pha 2d + fallback phòng thủ (nếu canonical lỡ thiếu).

**Frontend:**
- `frontend/components/ai/RecognitionResult.tsx` + `DishRecipeCard.tsx`: render `canonical_recipe`, tiêu đề/CTA link `/recipes/[id]` (recipe thật trong lookup).
- Giữ `variants[]` accordion như hiện có.

---

## 6. Data model

**Không migration mới.** Chỉ thêm giá trị `source`:
- `cookpad` — recipe cộng đồng crawled (Pha 2c).
- `llm-canonical` — canonical refine từ candidate thật (Pha 2a/2d) + canonical 369 cũ.
- `curated-canonical` — canonical promote từ curated json (Pha 2d fallback) — tag riêng để báo cáo thesis minh bạch ("X món từ Cookpad thật, Y món curated").

**Tên cột con (đã verify):**
- `RecipeIngredient`: `display_text`, `ingredient_name`, `quantity`, `order_index`.
- `RecipeStep`: `step_number`, `content`, `image_url`, `timer_seconds`.

---

## 7. Verification (regression script)

`backend/scripts/verify_canonical_subset.py` (mở rộng từ script điều tra đã dùng):
- assert: mọi slug ∈ `CLASS_DISPLAY_NAMES` có đúng 1 `is_canonical` recipe → 103/103.
- assert: 0 canonical trùng `title`.
- assert: mỗi canonical mới có ≥1 ingredient + ≥1 step.
- spot-check: gọi `_find_canonical_for_class` cho vài class → khác null.

Chạy trước Pha 1 (baseline), sau mỗi pha.

---

## 8. Rủi ro & xử lý

- **Món hiếm crawl ra 0 bản** (Nậm pịa, Chả lụi, Ba ba nấu chuối đậu…): lưới an toàn curated đảm bảo 103/103.
- **Cost LLM:** pipeline B cho ~13–28 món, trong cost ceiling $12 hiện có. Idempotent skip tránh chạy lại tốn tiền.
- **Crawl time:** ~44 món × scrape × sleep 4s ≈ vài giờ; chạy nền + resumable.
- **Branch song song share Postgres:** giữ idempotent + chạy tuần tự, không migration mới nên không đụng revision collision.
- **Cookpad 403:** crawler đã có Playwright Chromium + Chrome 124 UA + warm-up cookie (đã chứng minh hoạt động ở enrichment trước).
- **Trùng title khi món đã có canonical dưới slug khác** (vd `banh-tom-ho-tay`: đã tồn tại canonical title "Bánh Tôm Hồ Tây" dưới slug `banh-tom`): KHÔNG INSERT bản mới (tránh tạo title trùng) — thay vào đó **re-slug** canonical sẵn có về AI slug (như Pha 1 bước 2). Pha 2 phải check theo title chuẩn hóa trước khi INSERT; nếu đã có canonical cùng tên → re-slug, không thêm. Verify regression (0 trùng title) bắt được trường hợp sót.

---

## 9. Out of scope / follow-up

- Author enrichment cho recipe crawled mới (Playwright scrape `original_author_name`) — tùy chọn, không chặn.
- Seed synthetic user cho author crawled mới.
- Top-3 prediction clickable, "công thức tương tự" — polish UI riêng.
