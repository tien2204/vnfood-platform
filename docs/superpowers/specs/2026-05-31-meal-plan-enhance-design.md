# Thiết kế — Meal Plan Enhancement (sub-project 1/6)

**Ngày:** 2026-05-31
**Branch:** `feat/canonical-recipes`
**Bối cảnh:** Đây là sub-project ĐẦU TIÊN trong 6 sub-project được tách ra từ yêu cầu mở rộng VNFood (xem phần "Decomposition" cuối). Mỗi sub-project có spec→plan→implement riêng.

---

## 1. Bối cảnh & phát hiện

Người dùng yêu cầu "restore meal plan + grocery list (đã bị hide ở refocus branch)". **Phát hiện khi explore:** trên branch `feat/canonical-recipes`, meal plan + grocery list **đã có đầy đủ và đã wired** (không bị hide — việc hide chỉ xảy ra ở refocus branch):
- Backend: `meal_plans.py` (11 endpoints), `meal_plan_service.py`, routers đã mount tại `/api/v1/meal-plans` + `/api/v1`.
- Frontend: `app/meal-plan/` (3 trang: list, `[id]`, `[id]/grocery`), link "Meal Plan" trong Navbar dropdown.
- Middleware: `/meal-plan` bảo vệ qua catch-all (cần login).

→ "Restore" cơ bản đã xong. Sub-project này tập trung vào **4 enhancement** đã chốt với user, **không cần build lại** và **không cần DB migration**.

## 2. Mục tiêu (4 phần)

A. **Verify** toàn luồng meal plan + grocery chạy đúng.
B. **Canonical-first recipe picker:** meal plan ưu tiên dùng 405 canonical recipe (nguồn chuẩn, ingredients sạch).
C. **Smart grocery list:** phân nhóm theo loại nguyên liệu + dedup tên trùng (không migration).
D. **Personalized slot suggestions:** gợi ý món cho slot trống theo taste history, qua interface thay được.

### Non-goals
- KHÔNG migration DB.
- KHÔNG cộng dồn số lượng nguyên liệu (định lượng tiếng Việt tự do → rủi ro sai). Chỉ concat + dedup chuỗi.
- KHÔNG build full personalization engine ở đây (đó là sub-project riêng) — chỉ signal nhẹ + interface.
- KHÔNG đụng smart-shopping/voice/video/substitution (sub-project khác).

## 3. Quyết định đã chốt
- `canonical_only` mặc định `true` khi search từ meal plan; user mở rộng được bằng toggle.
- Grocery: **concat + dedup chuỗi quantity**, KHÔNG cộng số.
- Suggestions endpoint đặt tại `GET /api/v1/meal-plans/suggestions`.
- Phân nhóm grocery: **keyword-map on-the-fly** (không cột DB).
- Personalization: signal nhẹ giờ + interface ổn định để engine đầy đủ thay sau.

---

## 4. Thiết kế chi tiết (4 unit độc lập)

### A. Verify end-to-end (không code)
Smoke checklist (cần login): tạo plan (week_start = Monday) → AddRecipeModal thêm ≥2 món vào các slot → sinh grocery list → tick/untick item → thêm grocery thủ công → xóa item → xóa plan. Xác nhận không lỗi 4xx/5xx, dữ liệu nhất quán.

### B. Canonical-first recipe picker

**Backend** (recipe search endpoint mà `AddRecipeModal` gọi — hiện là `GET /recipes/search`):
- Thêm query param `canonical_only: bool = False` (default false để không đổi hành vi các caller khác).
- Khi `canonical_only=true` → thêm điều kiện `Recipe.is_canonical.is_(True)` vào query.
- Nếu endpoint search hiện tại không tiện thêm param (vd dùng full-text riêng), thêm nhánh filter tối thiểu; giữ shape response `RecipeCardOut` như cũ.

**Frontend `AddRecipeModal.tsx`:**
- State `canonicalOnly` default `true`. Search gọi với `canonical_only=canonicalOnly`.
- Toggle "Hiện tất cả công thức" (off mặc định) → set false → search lại.
- Kết quả canonical hiển thị badge "Chuẩn" (tái dùng `CanonicalBadge` nếu có).

### C. Smart grocery list (no migration)

**Module mới `backend/app/services/grocery_categories.py`:**
- Dict `CATEGORY_KEYWORDS: dict[str, list[str]]` cho 5 nhóm: `rau-cu` (rau, củ, cà, hành, tỏi, ớt, nấm…), `thit-ca` (thịt, bò, heo, gà, cá, tôm, mực, trứng…), `gia-vi` (muối, đường, nước mắm, tiêu, dầu, bột ngọt…), `kho-dong-goi` (bún, phở khô, bánh tráng, đậu hũ, lạp xưởng…), `khac` (fallback).
- `categorize(name: str) -> str`: normalize (lowercase, strip dấu, đ→d) → match keyword đầu tiên → trả slug nhóm; không match → `khac`.
- `CATEGORY_LABELS: dict[str,str]` (slug → nhãn tiếng Việt cho UI).

**`meal_plan_service.py` — helper chung `_build_grocery_payload(items_rows) -> dict`:**
- Dedup key = `norm(ingredient_name or display_text)` (lowercase-trim, đ→d) → gộp "Hành lá"/"hành lá".
- `quantity`: concat các chuỗi quantity **distinct** (bỏ trùng), join ", "; rỗng → "vừa đủ".
- `category = categorize(name)`.
- `from_recipes`: list {recipe_id, title, quantity}.
- Trả `{items: [...], total_items, checked_count}` với mỗi item có `category`.
- `generate_grocery_list`: dùng helper; vẫn persist `GroceryItem` (name, quantity, is_checked) như cũ (category KHÔNG lưu, tính khi trả).
- `get_grocery_list`: đọc các `GroceryItem` đã persist; với mỗi item gắn `category = categorize(name)` và **recompute `from_recipes`** bằng cách match `norm(name)` với ingredients của các recipe trong meal plan (read-only) — sửa bất nhất hiện tại (get trả `from_recipes=[]`). Giữ `is_checked` từ bảng `GroceryItem`. **Item thủ công** (thêm qua `add_grocery_item_manual`, không khớp recipe nào) → `from_recipes=[]`, vẫn có `category`.

**Frontend `GroceryList.tsx`:** group items theo `category`, render header nhóm + chip; trong nhóm giữ checklist/optimistic/expand from_recipes/manual-add/delete như cũ.

### D. Personalized slot suggestions

**Module mới `backend/app/services/recommend_service.py` — interface ổn định:**
```
async def suggest_recipes_for_user(db, user_id, n: int = 6, exclude_recipe_ids: set = None) -> list[dict]
```
- Signal nhẹ (gom taste history):
  1. Ratings cao: `Rating.score >= 4` của user → recipe của chúng → `canonical_dish_slug`/`keyword`.
  2. Saved: `SavedRecipe` của user → tương tự.
  3. AI history: `AILog.predicted_class` (user_id) → slug.
  - Đếm tần suất slug/keyword → top preferences.
- Trả canonical recipe (`is_canonical=true`) thuộc các slug/keyword ưa thích, loại `exclude_recipe_ids`, sort theo `llm_judge_score`/`avg_rating`. Thiếu → fallback popular canonical (avg_rating/save_count desc). Shape = `RecipeCardOut`-like dict.
- **Isolation:** Personalization engine sub-project sau chỉ thay nội dung hàm này, giữ nguyên signature → meal plan không đổi.

**Endpoint** (`meal_plans.py`): `GET /api/v1/meal-plans/suggestions?n=6` (auth) → gọi `suggest_recipes_for_user(db, current_user.id, n)`. (Đặt ở router meal-plans theo chốt của user.)

**Frontend:** section "Gợi ý cho bạn" trong `AddRecipeModal` (và/hoặc slot trống ở `WeeklyCalendar`) hiển thị suggestions → 1-click thêm vào slot đang chọn.

---

## 5. Files

**New:**
- `backend/app/services/grocery_categories.py` — keyword→category map + `categorize`.
- `backend/app/services/recommend_service.py` — `suggest_recipes_for_user` interface + signal nhẹ.

**Edit:**
- `backend/app/services/meal_plan_service.py` — helper `_build_grocery_payload`, generate/get dùng helper.
- `backend/app/api/v1/meal_plans.py` — `GET /suggestions`.
- recipe search (`backend/app/api/v1/recipes.py` + `recipe_service.py`) — param `canonical_only`.
- `frontend/components/meal-plan/AddRecipeModal.tsx` — canonical toggle + suggestions section.
- `frontend/components/meal-plan/GroceryList.tsx` — group theo category.
- `frontend/lib/types.ts` — thêm `category` vào grocery item type, suggestions type.

**No DB migration.**

## 6. Error handling
- Taste history rỗng → fallback popular canonical.
- Suggestions rỗng / search canonical rỗng → UI state graceful (empty message).
- `canonical_only=true` mà 0 kết quả → user toggle "tất cả".

## 7. Testing / verification
- Manual smoke checklist (phần A).
- Script assert nhỏ (`backend/scripts/`, throwaway hoặc giữ): `suggest_recipes_for_user` chỉ trả `is_canonical=true`; mọi grocery item có `category` ∈ 5 nhóm hợp lệ.

---

## 8. Decomposition (toàn bộ 6 sub-project — tham chiếu)
1. **Meal plan enhance** (spec này).
2. Personalization engine (taste-history recommend) — sẽ thay ruột `recommend_service.suggest_recipes_for_user`.
3. Substitution suggestions ("hết ngò → rau mùi tàu").
4. Cooking mode advanced + Voice (Web Speech API, hands-free, auto-timer/bước).
5. Video content (embed/link, governance lệch text vs canonical).
6. Smart shopping — ràng buộc: ShopeeFood/GrabMart **không có public ordering API** → chỉ deep-link/search-prefill hoặc mock; phụ thuộc grocery list (sub-project 1).
