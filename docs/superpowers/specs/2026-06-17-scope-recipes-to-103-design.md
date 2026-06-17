# Scope /recipes to the 103 AI Dishes + Variants (P2) — Design

**Ngày:** 2026-06-17
**Phạm vi:** Trang duyệt công thức `/recipes` (list + search + featured) + chip category. P2 trong nhóm 3 cải tiến.

## Vấn đề

`/recipes` hiển thị **toàn bộ 2.806 recipe `is_canonical`**, nhưng tập canonical trải trên ~8.700 dish-slug khác nhau — gồm rất nhiều món **ngoài 103 lớp AI** (vịt kho củ cải, ức gà quinoa...). User muốn `/recipes` chỉ tập trung **103 món AI nhận diện được + biến thể** của chúng.

## Dữ liệu thực tế (đã đo)

- `is_canonical` approved: **2.806**; `source='user'`: **0**.
- `canonical_dish_slug`: **8.723 distinct** → là slug *cụ thể từng món*, KHÔNG giới hạn 103. Không phải tag dùng được trực tiếp.
- Khớp **exact** slug ∈ 103: 294 canonical (mỏng, ~1/món).
- Khớp **title-prefix** (tiêu đề bắt đầu bằng display-name 1 trong 103, **phân biệt dấu**): **521 canonical**, **0 false positive** (vd "Phở gà"✓, "Phô mai que"✗). ← đã chọn.
- `keyword` trong pool 521: **184 NULL**, "Bánh"=237 át hết, phần còn lại rác lẫn lộn (slug / tên món / keyword thô) → **không dùng để phân loại được**.

## Quyết định (đã chốt với user)

1. **Định nghĩa scope:** title-prefix → **521 canonical** (canonical + biến thể có tiêu đề khớp 1 trong 103 tên).
2. **UGC luôn hiện:** `source='user'` luôn nằm trong pool dù ngoài 103.
3. **Chip category lọc theo GROUP** (8 GROUP_CLASSES), KHÔNG theo `keyword` nữa (vì keyword hỏng trên pool mới).

## Kiến trúc

### 1. Cột tag `ai_class_slug`
Thêm cột `recipes.ai_class_slug VARCHAR(80) NULL` (indexed) — lưu **slug 103-class mà recipe thuộc về** (vd "Phở gà" → `pho`), hoặc NULL nếu ngoài 103. Lưu slug (không phải boolean) để: lọc theo group, nhóm biến thể, và P3 dùng lại.

**Migration:** Alembic (repo dùng alembic — xem `backend/alembic/versions/`). `ADD COLUMN ai_class_slug VARCHAR(80) NULL` + `CREATE INDEX ix_recipes_ai_class_slug`.

### 2. Backfill script `backend/scripts/tag_ai_class_slug.py` (1 lần)
Với mỗi recipe approved, gán `ai_class_slug` theo quy tắc (ưu tiên trên xuống):
1. Nếu `canonical_dish_slug` đúng bằng 1 trong 103 → gán slug đó.
2. Else nếu **tiêu đề bắt đầu bằng display-name** của 1 class (so khớp **phân biệt dấu, case-insensitive**, ưu tiên **tên dài nhất** để "Bánh mì chảo" thắng "Bánh mì") → gán class đó.
3. Else NULL.
- Idempotent; in tiến độ; `sys.stdout.reconfigure(encoding="utf-8")` đầu file (Windows cp1252).
- Reuse `CLASS_DISPLAY_NAMES` + danh sách 103 slug từ `GROUP_CLASSES`.

### 3. Helper group ↔ slug — trong `backend/app/ai/class_names.py`
Thêm (suy ra từ `GROUP_CLASSES`):
- `GROUP_OF_SLUG: dict[str, str]` (slug → group; lưu ý 3 slug ở 2 group: `banh-canh`, `bo-kho`, `ca-muoi-xoi` — chấp nhận thuộc cả hai).
- `slugs_for_group(group: str) -> list[str]`.
- `VALID_GROUPS: set[str]` = 8 group code.

### 4. Filter pool (backend `recipe_service.py`)
3 hàm `list_recipes`, `search_recipes`, `get_featured_recipes` — nhánh `if not show_all` đổi:
```
# cũ
or_(Recipe.is_canonical.is_(True), Recipe.source == "user")
# mới
or_(and_(Recipe.is_canonical.is_(True), Recipe.ai_class_slug.isnot(None)),
    Recipe.source == "user")
```
→ pool ~521 + user. `show_all=True` (admin) giữ nguyên = xem tất cả.

### 5. Param `group` cho list (backend)
- `list_recipes` thêm tham số `group: Optional[str]`. Nếu set & ∈ `VALID_GROUPS` → thêm `WHERE Recipe.ai_class_slug = ANY(slugs_for_group(group))`. Group không hợp lệ → bỏ qua (không lọc).
- API `GET /recipes` ([recipes.py:112](backend/app/api/v1/recipes.py#L112)) thêm query param `group`, truyền xuống.
- `keyword` param **giữ nguyên** (không xóa, để không vỡ link cũ) nhưng chip không dùng nữa.

### 6. Frontend `RecipeBrowse.tsx`
- Đổi mảng `KEYWORDS` ([RecipeBrowse.tsx:24-34](frontend/app/recipes/RecipeBrowse.tsx#L24-L34)) → `CATEGORIES` map **label → group code**:
  - Bánh→`BANH`, Bún / Phở→`BUN_PHO`, Cơm→`COM`, Canh→`CANH_CHAO`, Món Khô→`MON_KHO_NUONG`, Xôi→`XOI`, Gỏi Cuốn→`GOI_CUON`, Đặc Biệt→`DAC_BIET`, Tất cả→`""`.
- Chip đọc/ghi param `group` thay vì `keyword` (state + `updateParam("group", ...)` + `params.group`).
- Số đếm "2.806 công thức" tự đổi theo `pagination.total` (~521) — không cần sửa.

## Out of scope (YAGNI)
- Không đụng recognize lookup/suggestions (`_find_canonical_for_class`, `_in_recipes_page_pool`) — vốn đã neo theo 103 qua `canonical_dish_slug`. (Cân nhắc align sau nếu suggestion trỏ tới recipe ngoài pool — không thuộc P2.)
- Không đụng `/recipes/by-keyword`, không xóa cột `keyword`.
- Không đổi recipe detail.
- P3 (mô tả vị giác) sẽ chạy trên đúng pool 521 này — làm sau, spec riêng.

## Testing
- pytest (pure): helper `slugs_for_group`/`GROUP_OF_SLUG` đúng theo GROUP_CLASSES; quy tắc `resolve_ai_class(title, slug)` của backfill (exact-slug, title-prefix longest-match, "Phô mai"→None, "Bánh mì chảo X"→banh-mi-chao).
- Manual + DB: sau backfill, đếm `ai_class_slug NOT NULL AND is_canonical` ≈ 521; `/recipes` trả ~521; chip `?group=BUN_PHO` ra phở/bún/hủ tiếu...; `?group=MON_KHO_NUONG` ra bò kho/cá kho/thịt kho.
- Frontend: `tsc --noEmit` + lint clean; chip đổi pool đúng.
