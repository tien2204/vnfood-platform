# 03 — Recipe CRUD & Admin Approval

## Actors
- **User**: tạo/sửa/xóa recipe của mình
- **Admin**: duyệt/từ chối/xóa bất kỳ recipe nào

## Use Cases

### UC-14: Tạo recipe mới
**Flow:**
1. User điền form: title, description, ingredients[], steps[], ảnh, cooking_time, servings, difficulty, keyword
2. Upload ảnh → lưu vào `backend/uploads/recipes/{uuid}.jpg`
3. Insert vào DB với `status='pending'`, `source='user'`, `author_id`
4. Hiển thị: "Công thức đang chờ Admin duyệt"

**API:** `POST /api/v1/recipes` (requires auth)
```json
Request: {
  "title": "Bánh xèo miền Tây",
  "description": "Cách làm bánh xèo giòn rụm...",
  "image_url": "/static/uploads/recipes/abc-123.jpg",
  "cooking_time": 45,
  "servings": 4,
  "difficulty": "medium",
  "keyword": "Bánh",
  "ingredients": [
    {
      "display_text": "200g bột gạo",
      "ingredient_name": "bột gạo",
      "quantity": "200g",
      "order_index": 0
    }
  ],
  "steps": [
    {
      "step_number": 1,
      "content": "Pha bột với nước cốt dừa, nghệ...",
      "image_url": "",
      "timer_seconds": 0
    }
  ]
}

Response: {
  "success": true,
  "data": { "id": "", "status": "pending" },
  "message": "Công thức đã được tạo, đang chờ Admin duyệt"
}
```

### UC-14b: Upload ảnh recipe (riêng)
**API:** `POST /api/v1/upload/image` (requires auth)
```
Content-Type: multipart/form-data
Body:
  file        (required) — jpg/png/webp, max 10MB
  category    (optional) — "recipe" | "step" | "avatar"  (default: "recipe")

Server xử lý:
  1. Validate file type + size
  2. Tạo UUID filename
  3. Lưu vào: backend/uploads/{category}s/{uuid}.{ext}
  4. Trả về URL serve qua /static/uploads/...
```
```json
Response: {
  "data": {
    "url": "/static/uploads/recipes/abc-123.jpg",
    "filename": "abc-123.jpg",
    "size_bytes": 245678
  }
}
```

### UC-15: Sửa recipe (chỉ author)
**Điều kiện:**
- Chỉ author hoặc admin mới sửa được
- Nếu recipe đang `approved` mà user sửa → tự động chuyển về `pending` chờ duyệt lại
- Cookpad recipes (`source='cookpad'`) → user không sửa được

**API:** `PUT /api/v1/recipes/{recipe_id}` (requires auth)
- Body giống POST
- Trả về recipe đã update với status mới

### UC-16: Xóa recipe
**API:** `DELETE /api/v1/recipes/{recipe_id}` (requires auth)
- Chỉ xóa recipe của chính mình (trừ admin)
- Cookpad recipes → user không xóa được, chỉ admin
- Hard delete (vì có CASCADE), nhưng có thể chuyển thành soft delete sau

### UC-17: Xem recipes của bản thân
**API:** `GET /api/v1/me/recipes?status=&page=1&limit=20` (requires auth)
- Trả về tất cả recipe kể cả `pending`, `rejected`
- Filter theo status nếu có

```json
Response: {
  "data": [
    { ...recipe..., "status": "pending", "reject_reason": null }
  ],
  "pagination": {...}
}
```

### UC-18: Admin duyệt recipe
**Flow:**
1. Admin vào `/admin/recipes` → tab "Chờ duyệt"
2. Xem danh sách `status='pending'`, sort theo `created_at` ASC (cũ nhất trước)
3. Click → modal preview đầy đủ recipe
4. Chọn **Approve** hoặc **Reject** + lý do (optional)

**API:**
```
GET   /api/v1/admin/recipes?status=pending&page=1&limit=20  (requires admin)
PATCH /api/v1/admin/recipes/{recipe_id}/status              (requires admin)
```

```json
PATCH Request: {
  "status": "approved" | "rejected",
  "reject_reason": "Thiếu ảnh minh họa cho bước nấu"  // optional
}
PATCH Response: { "success": true, "data": { "status": "approved" } }
```

**Side effects khi approve:**
- Recipe hiển thị công khai
- (Future) Gửi notification cho author

**Side effects khi reject:**
- Recipe vẫn ẩn, lưu `reject_reason` vào DB
- Author thấy được lý do trong `/me/recipes`
- Author có thể edit lại → status về `pending`

### UC-19: Admin xóa recipe bất kỳ
**API:** `DELETE /api/v1/admin/recipes/{recipe_id}` (requires admin)
- Áp dụng cho cả Cookpad recipes lẫn user recipes

## Frontend Pages
| Route | Mô tả | Protection |
|---|---|---|
| `/recipes/new` | Form tạo recipe (multi-step) | requires auth |
| `/recipes/[id]/edit` | Form sửa recipe | requires auth, chỉ author/admin |
| `/me/recipes` | Recipe của tôi với status badges | requires auth |
| `/admin/recipes` | Admin duyệt recipe | requires admin (xem 09_admin.md) |

## UI Components
- `RecipeForm` — Multi-step form:
  - Step 1: Basic info (title, description, image, time, servings, difficulty, keyword)
  - Step 2: Ingredients editor (drag to reorder, autocomplete `ingredient_name`)
  - Step 3: Steps editor (add/remove/reorder, timer per step, optional image)
  - Step 4: Preview + Submit
- `IngredientInput` — Input với autocomplete từ bảng `recipe_ingredients.ingredient_name`
- `StepEditor` — Textarea + timer input + image upload cho mỗi step
- `ImageUploader` — Drag & drop với preview, gọi POST /api/v1/upload/image
- `StatusBadge` — Hiển thị pending/approved/rejected với màu sắc

## Validation
| Field | Rule |
|---|---|
| title | 5 - 200 ký tự |
| description | tối đa 2000 ký tự |
| ingredients | tối thiểu 1, tối đa 50 |
| steps | tối thiểu 1, tối đa 30 |
| cooking_time | 1 - 600 phút |
| servings | 1 - 50 |
| difficulty | enum: easy/medium/hard |
| keyword | enum 9 nhóm |
| image | jpg/png/webp, max 10MB |

## Edge Cases
- User update recipe đang `approved` → status về `pending`, hiển thị warning
- User bị ban (`is_active=false`) → 403 khi tạo recipe mới
- Cookpad recipes → user không sửa/xóa được (403)
- Admin reject không nhập lý do → vẫn cho phép, `reject_reason=null`
- File upload sai định dạng → 400 "Chỉ chấp nhận jpg, png, webp"
- File upload > 10MB → 400 "Ảnh quá lớn (max 10MB)"
- Title trùng với recipe khác → vẫn cho phép (không unique)
- Step có timer 0 → bình thường, chỉ là step không có countdown
