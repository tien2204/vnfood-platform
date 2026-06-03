# Thiết kế — Món tương tự + Mục "Mách nhỏ" riêng (sub-project 1/3)

**Ngày:** 2026-06-03
**Branch:** `feat/canonical-recipes`
**Bối cảnh:** Lấp gap so monngonmoingay, tăng UX "tư vấn". Hai phần nhỏ trên **trang chi tiết công thức** (`/recipes/[id]`), **không cần dữ liệu mới**:
1. **Món tương tự** — gợi ý công thức liên quan.
2. **Mách nhỏ riêng** — tách mục mẹo ra khỏi danh sách bước.

Catalog: 2615 canonical + ~25k recipe. Recipe detail = `app/recipes/[id]/page.tsx` (server) + `RecipeDetailClient.tsx`.

---

## Phần 1 — Món tương tự

### Quyết định đã chốt (với user)
- **Tín hiệu:** full-text search trên **tên món** (token OR) + boost cùng `keyword`/`canonical_dish_slug`. Chạy được cho mọi recipe kể cả MNMN (không có `keyword`).
- **Phạm vi ứng viên:** **chỉ canonical** (2615, đã dedup, có ảnh/video/metadata).
- **Số lượng:** 6. **Lazy load** (endpoint riêng, không phình response detail).

### Ràng buộc đã biết
- Recipe MNMN **không có `keyword`** (chỉ `canonical_dish_slug`) → boost theo keyword chỉ áp dụng khi cả 2 có keyword; slug-boost + FTS title là chính.
- FTS dùng config `'simple'` (như `search_recipes`): `to_tsvector('simple', title)` — accent-sensitive, không stemming. Hợp tiếng Việt cho khớp từ.

### Backend
**`recipe_service.get_related_recipes(db, recipe_id, limit=6, current_user)` → list[RecipeCardOut]:**
1. Load recipe `(id, title, keyword, canonical_dish_slug)`. Không thấy → `[]`.
2. Build **OR tsquery** từ title: lowercase, thay ký tự không phải chữ-số bằng khoảng trắng, lấy token `len≥2`, nối ` | `. Nếu rỗng → bỏ qua bước FTS (chỉ dùng fallback ở 4).
3. Query canonical: `where is_canonical AND not is_dessert AND id != recipe_id AND to_tsvector('simple', title) @@ to_tsquery('simple', :orq)`, `order by`:
   - `(canonical_dish_slug = :slug)` DESC (biến thể cùng món lên đầu),
   - `(keyword IS NOT NULL AND keyword = :kw)` DESC,
   - `ts_rank(to_tsvector('simple', title), to_tsquery('simple', :orq))` DESC,
   - `save_count` DESC NULLS LAST.
   `limit :limit`.
4. **Fallback nếu < limit:** bổ sung canonical cùng `canonical_dish_slug` hoặc cùng `keyword` chưa có trong kết quả; vẫn thiếu → canonical phổ biến nhất (save_count desc), loại self+dessert+trùng. Đảm bảo trả tối đa `limit` (có thể < limit nếu catalog quá ít, chấp nhận).
5. Lấy author + `_get_saved_ids`, dựng `_build_recipe_card` cho mỗi row.

**Endpoint** `backend/app/api/v1/recipes.py`: `@router.get("/{recipe_id}/related")` → `{ "success": True, "data": [RecipeCardOut...] }`. Param `limit` (default 6, cap 12). `current_user` qua `get_optional_current_user` (để tính `is_saved`). Route `/{recipe_id}/related` không đụng `/{recipe_id}` (path khác).

### Frontend
- **`frontend/components/recipes/RelatedRecipes.tsx`** (client): SWR `GET /recipes/{id}/related`; nếu data rỗng/đang load lỗi → render `null`. Có data → section tiêu đề "Món tương tự" + lưới `RecipeCard` (tái dùng, 2–3 cột responsive như `RecipeGrid`).
- Render trong trang chi tiết (`RecipeDetailClient.tsx` hoặc `app/recipes/[id]/page.tsx`) ở **cuối cột nội dung chính**, sau phần bình luận. Truyền `recipeId`.
- `lib/types.ts`: tái dùng `RecipeCard` type (đã có). Không cần type mới.

---

## Phần 2 — Mục "Mách nhỏ" riêng (frontend-only, KHÔNG migration)

### Bối cảnh dữ liệu
- Recipe MNMN: `parse_steps` đã prefix tên mục → có bước nội dung bắt đầu `"Mách nhỏ: …"` (cũng `"Sơ Chế: …"`, `"Thực hiện: …"`, `"Cách dùng: …"`). Mẹo đã nằm sẵn trong steps, **không cần data mới**.
- Recipe khác (Cookpad/llm-canonical 405): steps không có prefix "Mách nhỏ" → phần này tự ẩn.

### Thiết kế (chỉ frontend)
- Ở chỗ render danh sách bước trên trang chi tiết: **phân tách** steps thành:
  - `tipSteps` = bước có `content` khớp `/^\s*mách nhỏ\s*[:.]/i`.
  - `normalSteps` = phần còn lại (đánh số như cũ).
- Render `normalSteps` như hiện tại (số thứ tự liên tục, không gồm tip).
- Render `tipSteps` thành **callout "Mách nhỏ" riêng** (1 khối, icon 💡, nền nhạt), đặt **sau danh sách bước**. Bỏ tiền tố "Mách nhỏ:" khỏi nội dung khi hiển thị (đã có tiêu đề khối).
- Không có tipStep → không render khối.

> Chỉ tách **"Mách nhỏ"** theo yêu cầu. Các mục khác (Sơ Chế/Thực hiện/Cách dùng) giữ trong danh sách bước như hiện tại.

---

## Files
- **Backend:** modify `app/services/recipe_service.py` (+`get_related_recipes`), `app/api/v1/recipes.py` (+endpoint).
- **Frontend:** new `components/recipes/RelatedRecipes.tsx`; modify recipe-detail render (RelatedRecipes + tách Mách nhỏ trong nơi render steps). Không migration, không đổi schema.

## Error handling
- Related: recipe không tồn tại / title rỗng token → fallback hoặc `[]`; endpoint luôn trả mảng (≤ limit). FTS lỗi cú pháp do token lạ → token đã sanitize (chỉ chữ-số + ` | `).
- Tips: regex không khớp → khối ẩn; nội dung sau khi strip prefix rỗng → bỏ qua bước đó.

## Verification
- **Backend:** smoke `get_related_recipes` cho 1 canonical (vd phở) → trả ≥1 món cùng nhóm, không gồm self, toàn canonical. Endpoint curl (có/không token) trả mảng.
- **Frontend:** `npx tsc --noEmit` 0 lỗi mới. Manual: mở 1 recipe MNMN → thấy "Món tương tự" (bấm sang đúng) + khối "Mách nhỏ" tách riêng, danh sách bước không còn dòng "Mách nhỏ"; mở 1 recipe Cookpad → "Món tương tự" vẫn có, khối Mách nhỏ ẩn.

## Vị trí trong decomposition
Sub-project 1/3 (rẻ, không data mới). Sau: 2/3 lọc theo bữa (+backfill `meal_types`), 3/3 facet filter (crawl taxonomy MNMN + UI).
