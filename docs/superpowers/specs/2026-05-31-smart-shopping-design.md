# Thiết kế — Smart Shopping (deep-link đặt nguyên liệu) — sub-project 6/6

**Ngày:** 2026-05-31
**Branch:** `feat/canonical-recipes`
**Bối cảnh:** Sub-project cuối trong decomposition 6 phần. Nối tiếp Meal Plan enhancement (grocery list đã là live view, mỗi item có `ingredient_name` + `category` + `from_recipes`).

---

## 1. Mục tiêu

Từ grocery list, mỗi nguyên liệu có nút điều hướng sang nền tảng mua sắm (Cooky → GrabMart → ShopeeFood) để đặt mua, theo **deep-link search** (mở platform với từ khóa = tên nguyên liệu).

## 2. Ràng buộc cứng (đã thống nhất với user)

- 3 nền tảng **không có public ordering/cart API** cho bên thứ ba → **không thể auto-add cả giỏ hàng**. Cái làm được = mở platform với từ khóa nguyên liệu, user tự thêm giỏ + đặt.
- **Không có API tồn kho** → app không tự biết Cooky có bán món đó hay không. "Fallback Cooky → GrabMart → ShopeeFood" = hiển thị Cooky làm lựa chọn chính + 2 platform kia làm phương án thay thế theo thứ tự, **user tự bấm tiếp** nếu Cooky không có (KHÔNG tự động nhảy).
- URL search của platform có thể đổi → thiết kế dạng **bảng config URL template dễ sửa**; platform nào không có search URL ổn định → fallback mở **trang chủ**.

## 3. Quyết định đã chốt
- Granularity: **per-item** (mỗi dòng grocery 1 control mua). KHÔNG làm whole-list.
- Thứ tự ưu tiên cố định: **Cooky → GrabMart → ShopeeFood**.
- UI: nút chính mở Cooky + caret ▾ menu liệt kê cả 3 theo thứ tự (phương án thay thế thủ công).
- **Frontend-only**: không backend, không DB migration, không persistence.

### Non-goals
- Không auto-cart / không gọi API đặt hàng.
- Không detect tồn kho / không tự động chọn platform.
- Không whole-list "đặt tất cả".
- Không lưu platform ưa thích (thứ tự cố định, không picker mặc định).

---

## 4. Thiết kế chi tiết (frontend-only)

### 4.1 Config module `frontend/lib/shopping-links.ts`
- `SHOPPING_PLATFORMS`: mảng theo đúng thứ tự ưu tiên, mỗi phần tử:
  - `id` (`"cooky" | "grabmart" | "shopeefood"`), `label`, `searchUrl(keyword: string): string`.
  - `searchUrl` encode `keyword` bằng `encodeURIComponent`. Nếu platform không có search URL ổn định → trả URL trang chủ (bỏ qua keyword).
- Giá trị URL khởi tạo (xác minh + chốt lúc implement; cái nào search không chạy → để trang chủ):
  - Cooky: search theo từ khóa (Cooky Market có web search — ưu tiên cao nhất vì deep-link search rõ nhất).
  - GrabMart: nếu không có search URL công khai ổn định → trang chủ `food.grab.com` (vùng VN).
  - ShopeeFood: nếu không có → trang chủ `shopeefood.vn`.
- Hàm `buildSearchUrl(platformId, ingredientName)` (dùng cho test + UI).

### 4.2 UI trong `frontend/components/meal-plan/GroceryList.tsx` (`GroceryItemRow`)
- Thêm 1 control mua ở cụm action (cạnh nút expand `from_recipes` / xóa):
  - **Nút chính**: icon giỏ + nhãn ngắn → `window.open(buildSearchUrl("cooky", item.ingredient_name), "_blank", "noopener,noreferrer")`.
  - **Caret ▾**: mở menu nhỏ liệt kê cả 3 platform theo thứ tự (Cooky / GrabMart / ShopeeFood); mỗi mục `window.open` URL tương ứng.
- Menu dùng pattern dropdown đã có trong dự án (Base UI / shadcn) hoặc 1 popover đơn giản tự quản state mở/đóng (nhất quán với cách `expandedId` đang làm). Đóng menu sau khi chọn.
- Item đã tick (`is_checked`) vẫn hiện nút mua (để mua lại được) — không ẩn.

### 4.3 Dữ liệu
- Chỉ dùng `item.ingredient_name` (đã sạch với canonical recipes). URL-encode. Không gửi backend.

## 5. Files
- **New:** `frontend/lib/shopping-links.ts` — config platform + `buildSearchUrl`.
- **Edit:** `frontend/components/meal-plan/GroceryList.tsx` — thêm control mua trong `GroceryItemRow` (+ state menu mở/đóng).
- Không file backend, không migration.

## 6. Error handling
- `window.open` gọi trong user-click → không bị popup-block.
- URL search không khớp / platform đổi layout → user vẫn được đưa tới platform (search rỗng hoặc trang chủ) — fallback graceful, không crash app.
- `ingredient_name` rỗng (không xảy ra vì NOT NULL) → bỏ qua/disable nút.

## 7. Testing / verification
- Unit `buildSearchUrl`: encode đúng (vd "Nước mắm" → `Nu%E1%BB%9Bc%20m%E1%BA%AFm`), trả đúng URL theo platformId, `SHOPPING_PLATFORMS` đúng thứ tự `[cooky, grabmart, shopeefood]`.
- Manual: bấm nút chính → mở tab Cooky search đúng nguyên liệu; mở caret → 3 platform đúng thứ tự, mỗi cái mở đúng tab.
- Implement-time: xác minh URL search thật của 3 platform, chốt template (search-được thì search, không thì trang chủ).

## 8. Vị trí trong decomposition
Sub-project 6/6 (cuối). Đã xong: 1 (meal plan enhance), liên quan trực tiếp grocery list. Còn lại chưa làm: 2 (personalization engine), 3 (substitution), 4 (cooking mode + voice), 5 (video).
