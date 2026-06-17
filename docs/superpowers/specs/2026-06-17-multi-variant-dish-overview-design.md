# Overview chung cho món đa biến thể (Recognize) — Design

**Ngày:** 2026-06-17
**Phạm vi:** Trang `/recognize` (kết quả nhận diện AI). P1 trong nhóm 3 cải tiến (P1 overview / P2 scope recipes / P3 mô tả món).

## Vấn đề

Khi AI nhận diện một món **có nhiều biến thể** (bánh mì, phở, hủ tiếu...), hệ thống ghim **đúng 1 recipe canonical cụ thể** (vd "Bánh Mì Thịt Heo Nướng") dưới tiêu đề **"Công thức chuẩn cho món này"** ([RecognitionResult.tsx:158](frontend/components/ai/RecognitionResult.tsx#L158)). User mới hiểu nhầm đó là công thức "đúng/duy nhất", trong khi món còn nhiều biến thể khác.

## Quyết định (đã chốt với user)

- **Trigger:** một **danh sách config** các slug đa biến thể. Slug trong list → bật chế độ overview; slug đơn nhất (cao lầu, bánh khọt...) → giữ nguyên hành vi hiện tại.
- **Nguồn nội dung overview:** **file JSON seed bằng LLM, sửa tay được** (`dish_overviews.json`, giống pattern `dish_recipes.json`). Runtime KHÔNG gọi LLM.
- **Cách trình bày (phương án b):** **giữ** thẻ recipe tiêu biểu hiện có nhưng **dán nhãn rõ "1 trong nhiều biến thể"**, và **thêm overview chung phía trên**. Không bỏ thẻ recipe.

## Kiến trúc

### Backend

1. **Config** trong `backend/app/core/variant_config.py`: thêm `MULTI_VARIANT_SLUGS: set[str]` (~20-30 slug). Danh sách khởi tạo:
   `pho, banh-mi, banh-canh, hu-tieu, mi-quang, bun-rieu, banh-cuon, banh-xeo, com-chien, com-tam, canh-chua, ca-kho-to, banh-bao, banh-tet, banh-chung, banh-trung-thu, goi-cuon, nem-chua, lap-xuong, rau-muong-xao, banh-bo, banh-da-lon, banh-pia, banh-duc, banh-hoi, ca-loc-nuong`.

2. **`backend/app/ai/dish_overviews.json`** (mới) — key = slug, value:
   ```json
   "banh-mi": {
     "display_name": "Bánh mì",
     "tasting": "2-3 câu về vị + cách thưởng thức: vỏ giòn, ruột mềm, nhân mặn-béo-chua-cay, ăn nóng kèm rau thơm/đồ chua.",
     "key_ingredients": ["Bánh mì vỏ giòn", "Pate/bơ", "Rau thơm + đồ chua", "Nhân tùy chọn (thịt/chả/trứng)"],
     "main_steps": ["Chuẩn bị nhân theo biến thể", "Phết pate/bơ + sốt", "Kẹp nhân + rau + đồ chua, ăn nóng"],
     "variant_examples": ["Bánh mì thịt nướng", "Bánh mì pate", "Bánh mì chả cá", "Bánh mì xíu mại"]
   }
   ```

3. **`backend/app/services/dish_overview_service.py`** (mới) — pattern giống `dish_recipe_service`:
   - `load_dish_overviews() -> int` (gọi ở startup, cạnh `load_dish_recipes`).
   - `get_overview(slug) -> Optional[dict]`.

4. **`backend/scripts/seed_dish_overviews.py`** (mới) — chạy 1 lần. Với mỗi slug trong `MULTI_VARIANT_SLUGS`, gọi LLM (gpt-4o-mini, JSON mode) sinh `{display_name, tasting, key_ingredients, main_steps, variant_examples}` → ghi `dish_overviews.json`. Idempotent: bỏ qua slug đã có (trừ khi `--force`).

5. **`recognize_image`** ([ai_service.py:119-148](backend/app/services/ai_service.py#L119-L148)): sau khi có `resolved_slug`, tính `is_multi_variant = resolved_slug in MULTI_VARIANT_SLUGS`. Nếu true → thêm `dish_overview = dish_overview_service.get_overview(resolved_slug)`. Response thêm 2 field:
   - `is_multi_variant: bool`
   - `dish_overview: Optional[dict]` (None nếu không multi-variant hoặc JSON thiếu slug).
   - **Giữ nguyên** `canonical_recipe`, `dish_recipe`, `variants`, `suggested_recipes` (phương án b).

   Edge case: nếu `is_multi_variant` nhưng `dish_overview` None (chưa seed) → frontend không render overview card, thẻ recipe vẫn reframe nhãn (xem dưới). Không crash.

6. **Schema** (`backend/app/schemas/...` nếu recognize có response model; hiện endpoint trả dict thô qua `{"success": True, "data": result}` nên chỉ cần thêm key vào dict). Không cần đổi Pydantic nếu không có model. Xác nhận khi implement.

### Frontend

1. **Type** `AIRecognitionResult` ([lib/types.ts](frontend/lib/types.ts)): thêm
   ```ts
   is_multi_variant?: boolean;
   dish_overview?: {
     display_name: string;
     tasting: string;
     key_ingredients: string[];
     main_steps: string[];
     variant_examples: string[];
   } | null;
   ```

2. **`frontend/components/ai/DishOverviewCard.tsx`** (mới) — render overview: heading "Giới thiệu món {display_name}", đoạn `tasting`, list "Nguyên liệu chủ chốt" (`key_ingredients`), list "Các bước chính" (`main_steps`). KHÔNG hiển định lượng/recipe đầy đủ. `variant_examples` hiển dạng chip gợi ý (optional).

3. **`RecognitionResult.tsx`**:
   - Khi `is_multi_variant && dish_overview` → render `<DishOverviewCard>` **phía trên** section recipe.
   - Trong section recipe ([RecognitionResult.tsx:158-199](frontend/components/ai/RecognitionResult.tsx#L158-L199)): khi `is_multi_variant`, đổi tiêu đề `"Công thức chuẩn cho món này"` → **"Một công thức tiêu biểu"**, và thay `<CanonicalBadge />` bằng badge **"1 trong nhiều biến thể"** (component/biến thể nhãn mới hoặc prop). Khi không multi-variant → giữ nguyên tiêu đề + `CanonicalBadge`.
   - "Biến thể khác" + suggestions giữ nguyên.

## Out of scope (YAGNI)
- Không đổi logic resolve/canonical, không đổi DB schema.
- Không gọi LLM lúc runtime.
- P2 (scope /recipes) và P3 (mô tả vị giác cho recipe thường) làm riêng ở spec khác. Lưu ý: `tasting` trong overview chính là P3 áp cho nhóm đa biến thể; P3 sẽ xử lý mô tả cho từng recipe cụ thể.

## Testing
Backend không có test runner riêng cho phần này (theo dự án). Xác minh:
- `dish_overview_service` load đúng số entry.
- Recognize trả `is_multi_variant`/`dish_overview` đúng cho slug trong/ngoài config (manual qua endpoint hoặc script nhỏ).
- Frontend: `tsc --noEmit` + lint clean; manual xem card với 1 món đa biến thể (bánh mì) và 1 món đơn nhất (cao lầu).
