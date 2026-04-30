# 07 — Meal Plan & Smart Grocery List

## Actors: User (requires auth)

## Use Cases

### UC-31: Tạo Meal Plan mới
**API:** `POST /api/v1/meal-plans` (requires auth)
```json
Request: {
  "name": "Tuần này",
  "week_start": "2024-01-15"   // Bắt buộc là thứ 2 (Monday)
}
Response: {
  "data": { "id": "", "name": "", "week_start": "" }
}
```

**Validation:**
- `week_start` phải là Monday (backend check `date.weekday() == 0`)
- 1 user có thể có nhiều meal plan, nhưng cùng `week_start` thì duplicate sẽ trả về plan cũ

### UC-32: Xem Meal Plan theo tuần
**API:** `GET /api/v1/meal-plans/{plan_id}` (requires auth, chỉ owner)
```json
Response: {
  "data": {
    "id": "", "name": "", "week_start": "2024-01-15",
    "days": {
      "2024-01-15": {   // Monday
        "breakfast": [
          { "item_id": "", "recipe": {...}, "servings": 2, "note": "" }
        ],
        "lunch":  [...],
        "dinner": [...],
        "snack":  []
      },
      "2024-01-16": {...},   // Tuesday
      "2024-01-17": {...},
      "2024-01-18": {...},
      "2024-01-19": {...},
      "2024-01-20": {...},
      "2024-01-21": {...}    // Sunday
    }
  }
}
```

### UC-33: Thêm recipe vào Meal Plan
**API:** `POST /api/v1/meal-plans/{plan_id}/items` (requires auth)
```json
Request: {
  "recipe_id": "",
  "date": "2024-01-15",
  "meal_type": "lunch",   // breakfast | lunch | dinner | snack
  "servings": 2,
  "note": "Nấu thêm cho mai"   // optional
}
Response: {
  "data": { "id": "", "recipe_id": "", "date": "", "meal_type": "", "servings": 2 }
}
```

**Validation:**
- `date` phải nằm trong 7 ngày của plan (week_start đến week_start + 6)
- `meal_type` phải là 1 trong 4 enum
- 1 ô (date + meal_type) có thể có nhiều items (không UNIQUE)

### UC-34: Xóa item khỏi Meal Plan
**API:** `DELETE /api/v1/meal-plans/{plan_id}/items/{item_id}` (requires auth)

### UC-35: Cập nhật item (đổi servings, note)
**API:** `PUT /api/v1/meal-plans/{plan_id}/items/{item_id}` (requires auth)
```json
Request: { "servings": 4, "note": "Đã đổi số người" }
```

### UC-36: Danh sách Meal Plans của user
**API:** `GET /api/v1/me/meal-plans?page=1&limit=10` (requires auth)
```json
Response: {
  "data": [
    {
      "id": "", "name": "", "week_start": "",
      "items_count": 12,
      "created_at": ""
    }
  ],
  "pagination": {...}
}
```

### UC-37: Xóa Meal Plan
**API:** `DELETE /api/v1/meal-plans/{plan_id}` (requires auth)
- CASCADE xóa luôn `meal_plan_items` và `grocery_items`

### UC-38: AI gợi ý Meal Plan cả tuần
**Flow:**
1. User click "AI gợi ý cho tôi"
2. Modal hỏi preferences:
   - Số người ăn (1-10)
   - Loại bữa muốn plan (breakfast/lunch/dinner/snack — multi-select)
   - Exclude ingredients (multi-input chip)
   - Difficulty preference (any/easy/medium/hard)
3. Backend gọi OpenAI với context = danh sách recipes trong DB matching filters
4. OpenAI trả meal plan suggestion (JSON)
5. User xem preview → click "Áp dụng" → save vào DB

**API:** `POST /api/v1/meal-plans/ai-suggest` (requires auth)
```json
Request: {
  "servings": 4,
  "meal_types": ["breakfast", "lunch", "dinner"],
  "exclude_ingredients": ["hải sản"],
  "difficulty": "any",
  "week_start": "2024-01-15"
}

Response: {
  "data": {
    "week_start": "2024-01-15",
    "suggestion": {
      "2024-01-15": {
        "breakfast": {
          "recipe_id": "", "title": "Phở bò",
          "image_url": "", "cooking_time": 60,
          "reason": "Bữa sáng truyền thống, dễ ăn"
        },
        "lunch": {...},
        "dinner": {...}
      },
      "2024-01-16": {...}
      // ... 7 ngày
    }
  }
}
```

**Logic backend gọi OpenAI:**
```python
# 1. Filter recipes trong DB theo preferences
candidates = await get_recipes_filtered(
    exclude_ingredients=req.exclude_ingredients,
    difficulty=req.difficulty,
    limit=200,  # top 200 recipes phổ biến
)

# 2. Tạo prompt cho OpenAI với danh sách recipe candidates
prompt = f"""
Bạn là chuyên gia ẩm thực. Gợi ý meal plan 7 ngày cho gia đình {req.servings} người.
Các bữa cần plan: {req.meal_types}
Tránh nguyên liệu: {req.exclude_ingredients}

Chỉ chọn từ danh sách công thức sau (KHÔNG được tự bịa):
{[{"id": r.id, "title": r.title} for r in candidates]}

Quy tắc:
- Đa dạng món, không lặp trong cùng 1 ngày
- Cân đối nước/khô, mặn/canh
- Mỗi recipe có lý do tại sao chọn

Trả về JSON: {{"plan": {{"YYYY-MM-DD": {{"breakfast": {{"recipe_id":"", "reason":""}}, ...}}}}}}
"""
```

**API:** `POST /api/v1/meal-plans/ai-suggest/save` (requires auth)
```json
Request: {
  "name": "Tuần AI gợi ý",
  "week_start": "2024-01-15",
  "items": [   // copy từ suggestion response trên
    { "recipe_id": "", "date": "2024-01-15", "meal_type": "breakfast", "servings": 4 }
  ]
}
```

### UC-39: Smart Grocery List
**Flow:**
1. Từ meal plan → tổng hợp tất cả `recipe_ingredients` của các recipes trong plan
2. Gộp trùng theo `ingredient_name`, sum quantity nếu có thể parse số
3. Cho phép user check/uncheck từng item

**API:** `GET /api/v1/meal-plans/{plan_id}/grocery-list`
```json
Response: {
  "data": {
    "items": [
      {
        "id": "",
        "ingredient_name": "thịt bò",
        "quantity": "1.2 kg (tổng từ 3 món)",
        "is_checked": false,
        "from_recipes": [
          { "recipe_id": "", "title": "Phở bò", "quantity": "500g" },
          { "recipe_id": "", "title": "Bò lúc lắc", "quantity": "400g" },
          { "recipe_id": "", "title": "Bò né", "quantity": "300g" }
        ]
      }
    ],
    "total_items": 35,
    "checked_count": 12
  }
}
```

**API:** `PATCH /api/v1/grocery-items/{item_id}` (requires auth)
```json
Request: { "is_checked": true }
```

**API:** `POST /api/v1/meal-plans/{plan_id}/grocery-list/regenerate` (requires auth)
- Tạo lại grocery list từ đầu (sau khi user thêm/xóa recipes trong plan)
- Xóa hết `grocery_items` cũ, tạo mới
- Giữ lại `is_checked` của items có cùng `ingredient_name`

**API:** `POST /api/v1/meal-plans/{plan_id}/grocery-list/items` (requires auth)
- User thêm thủ công 1 item
```json
Request: { "ingredient_name": "muối", "quantity": "1 hũ" }
```

## Frontend Pages
| Route | Mô tả |
|---|---|
| `/meal-plan` | Trang chủ meal plan, list các plan đã tạo + nút "Tạo mới" / "AI gợi ý" |
| `/meal-plan/[id]` | Weekly calendar view (7 cột × 4 hàng) |
| `/meal-plan/[id]/grocery` | Grocery list checklist |

## UI Components
- `WeeklyCalendar` — Grid 7 ngày × 4 bữa
  - Mỗi ô có thể chứa multiple recipes (stack vertically)
  - Click ô trống → modal "Thêm recipe"
  - Click recipe trong ô → menu (xem detail, sửa servings, xóa)
  - Drag & drop recipe giữa các ô (optional)
- `MealSlot` — 1 ô bữa ăn, hiển thị mini recipe cards
- `AddRecipeModal` — Search recipe + chọn → POST item
- `AISuggestModal` — Form preferences + preview + confirm
- `GroceryList` — Checklist với checkbox, group theo loại nguyên liệu
- `MealPlanCard` — Card list view cho plans

## Edge Cases
- Plan rỗng (chưa thêm recipe nào) → grocery list trả về `items: []`
- AI suggest fail / recipe_id không có trong DB → bỏ qua, plan vẫn save phần thành công
- Duplicate recipe trong cùng 1 ngày khác bữa → cho phép
- `week_start` không phải Monday → 422 validation error
- User xóa recipe đang được dùng trong meal plan → meal_plan_items giữ `recipe_id` nhưng query JOIN sẽ NULL → frontend hiển thị "Recipe đã bị xóa"
