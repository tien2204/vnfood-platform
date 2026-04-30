# 09 — Admin Dashboard

## Actors: Admin only

## Use Cases

### UC-42: Dashboard Overview
**API:** `GET /api/v1/admin/stats` (requires admin)
```json
Response: {
  "data": {
    "users": {
      "total": 1200,
      "new_today": 15,
      "new_this_week": 87,
      "active_today": 230,    // có login trong 24h
      "banned": 5
    },
    "recipes": {
      "total": 23000,
      "approved": 22950,
      "pending": 8,
      "rejected": 42,
      "from_cookpad": 22273,
      "from_users": 727,
      "new_today": 12
    },
    "engagement": {
      "total_comments": 5600,
      "total_ratings": 8900,
      "total_saves": 12500,
      "ai_recognitions_today": 230
    }
  }
}
```

**Charts đề xuất** (trên frontend):
- Line chart: Users mới theo ngày (30 ngày qua)
- Line chart: Recipes mới theo ngày (30 ngày qua)
- Pie chart: Recipes by status (approved/pending/rejected)
- Bar chart: Top 10 keywords được tạo recipe nhiều nhất

### UC-43: Quản lý User

**Danh sách users:**
```
GET /api/v1/admin/users?page=1&limit=20&search=&role=&is_active=&sort=newest
```
Query params:
- `search`: tìm theo email hoặc full_name
- `role`: filter user | admin
- `is_active`: true | false
- `sort`: newest | oldest | most_recipes

```json
Response: {
  "data": [
    {
      "id": "", "email": "", "full_name": "", "avatar_url": "",
      "role": "user", "is_active": true,
      "created_at": "",
      "stats": {
        "recipe_count": 5,
        "comment_count": 23,
        "follower_count": 12
      }
    }
  ],
  "pagination": {...}
}
```

**Chi tiết user:**
**API:** `GET /api/v1/admin/users/{user_id}` (requires admin)
```json
Response: {
  "data": {
    "user": {
      "id": "", "email": "", "full_name": "", "avatar_url": "",
      "bio": "", "role": "", "is_active": true,
      "created_at": "", "updated_at": ""
    },
    "stats": {
      "recipe_count": 5,
      "comment_count": 20,
      "follower_count": 12,
      "following_count": 30,
      "total_ratings_given": 45,
      "ai_recognitions": 8,
      "joined_days": 90
    },
    "recent_recipes": [...],   // 5 recipes mới nhất
    "recent_comments": [...]   // 5 comments mới nhất
  }
}
```

**Ban / Unban user:**
**API:** `PATCH /api/v1/admin/users/{user_id}/status` (requires admin)
```json
Request: {
  "is_active": false,
  "reason": "Spam comment, vi phạm quy tắc cộng đồng"
}
```

**Side effects khi ban:**
- `users.is_active = false`
- Tất cả recipes của user → ẩn khỏi public listing (nhưng giữ trong DB)
- Tất cả comments → `is_hidden = true`
- User không login được nữa (login API check `is_active`)

**Side effects khi unban:**
- Khôi phục mọi thứ về trạng thái cũ

**Đổi role:**
**API:** `PATCH /api/v1/admin/users/{user_id}/role` (requires admin)
```json
Request: { "role": "admin" }   // hoặc "user"
```

**Validation:**
- Admin không thể tự đổi role/ban chính mình
- Server check: `if user_id == current_admin.id: raise 400`

### UC-44: Duyệt Recipe

**Danh sách pending:**
**API:** `GET /api/v1/admin/recipes?status=pending&page=1&limit=20&sort=oldest`

```json
Response: {
  "data": [
    {
      "id": "", "title": "", "image_url": "",
      "description": "", "keyword": "Bánh",
      "status": "pending", "reject_reason": null,
      "author": { "id": "", "full_name": "", "avatar_url": "" },
      "created_at": "",
      "ingredients_count": 12,
      "steps_count": 8
    }
  ],
  "pagination": {...}
}
```

**Approve / Reject:**
**API:** `PATCH /api/v1/admin/recipes/{recipe_id}/status` (requires admin)
```json
Request: {
  "status": "approved",   // hoặc "rejected"
  "reject_reason": "Thiếu ảnh minh họa"   // optional, chỉ dùng khi reject
}
Response: { "success": true, "data": { "status": "approved" } }
```

**Side effects khi approve:**
- Recipe public ngay
- (Future) Gửi notification cho author

**Side effects khi reject:**
- Recipe vẫn `status='rejected'`
- Author thấy được trong `/me/recipes` với badge đỏ + reject_reason
- Author có thể edit và submit lại → status về `pending`

**Xóa recipe (admin):**
**API:** `DELETE /api/v1/admin/recipes/{recipe_id}` (requires admin)
- Áp dụng cả Cookpad recipes và user recipes

### UC-45: Quản lý Comments

**Danh sách:**
**API:** `GET /api/v1/admin/comments?page=1&limit=20&is_hidden=` (requires admin)
- Filter: `is_hidden` (true/false/none)
- Default: tất cả comments, sort newest

```json
Response: {
  "data": [
    {
      "id": "", "content": "Spam content...",
      "is_hidden": false, "created_at": "",
      "user": { "id": "", "full_name": "", "avatar_url": "" },
      "recipe": { "id": "", "title": "" }
    }
  ],
  "pagination": {...}
}
```

**Ẩn / Hiện comment:**
**API:** `PATCH /api/v1/admin/comments/{comment_id}` (requires admin)
```json
Request: { "is_hidden": true }
```

**Xóa comment:**
**API:** `DELETE /api/v1/admin/comments/{comment_id}` (requires admin)

### UC-46: Quản lý Ingredients (cho gợi ý)

**Logic:** Bảng `recipe_ingredients` có column `ingredient_name`. Admin có thể:
- Xem danh sách `ingredient_name` distinct với usage count
- Merge các tên trùng (vd: "thịt bò" và "Thịt Bò" → gộp thành 1)
- Sửa typo

**Danh sách ingredients:**
**API:** `GET /api/v1/admin/ingredients?page=1&limit=50&search=` (requires admin)
```json
Response: {
  "data": [
    {
      "name": "thịt bò",
      "usage_count": 1250,
      "variants": ["Thịt Bò", "thịt bò tươi"]   // các biến thể tương tự
    }
  ],
  "pagination": {...}
}
```

**Merge ingredients:**
**API:** `POST /api/v1/admin/ingredients/merge` (requires admin)
```json
Request: {
  "from_names": ["Thịt Bò", "thịt bò tươi"],
  "to_name": "thịt bò"
}
```
- UPDATE `recipe_ingredients SET ingredient_name = :to_name WHERE ingredient_name IN (:from_names)`

**Rename ingredient:**
**API:** `POST /api/v1/admin/ingredients/rename` (requires admin)
```json
Request: { "from": "thit bo", "to": "thịt bò" }
```

## Frontend Pages
| Route | Mô tả |
|---|---|
| `/admin` | Dashboard overview với stats + charts |
| `/admin/users` | Bảng quản lý users (search, filter, ban) |
| `/admin/users/[id]` | Chi tiết user + lịch sử hoạt động |
| `/admin/recipes` | Bảng recipes với tabs (pending / approved / rejected) |
| `/admin/recipes/[id]` | Preview recipe + actions approve/reject |
| `/admin/comments` | Bảng comments với filter is_hidden |
| `/admin/ingredients` | Quản lý nguyên liệu (merge, rename) |

## UI Components
- `AdminLayout` — Sidebar navigation với 5 menu items + logout
- `StatsCard` — Card hiển thị 1 metric (icon + label + value + trend)
- `DataTable` — Sortable, filterable, paginated table
  - Columns: customizable
  - Row actions: dropdown menu
  - Bulk actions: checkbox + bulk action bar (sau)
- `RecipePreviewModal` — Preview full recipe trước khi approve/reject
  - Hiển thị giống `/recipes/[id]` nhưng có 2 button bottom
- `ConfirmDialog` — Xác nhận trước khi ban user / xóa recipe / xóa comment
  - Props: `title`, `description`, `confirmText`, `confirmVariant`
- `UserStatsBadge` — Mini badge hiển thị recipe_count / follower_count

## Route Protection
```typescript
// frontend/middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/admin')) {
    const token = request.cookies.get('access_token')?.value;
    if (!token) {
      return NextResponse.redirect(new URL('/auth/login', request.url));
    }

    // Decode JWT để check role
    const payload = decodeJWT(token);
    if (payload?.role !== 'admin') {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
```

**Backend dependency:**
```python
# core/deps.py
async def require_admin(user: User = Depends(get_current_active_user)) -> User:
    if user.role != 'admin':
        raise HTTPException(403, detail="Yêu cầu quyền admin")
    return user
```

## Edge Cases
- Admin tự ban bản thân → 400 "Không thể ban chính mình"
- Admin tự đổi role thành user → 400 "Không thể tự hạ quyền"
- Nếu chỉ còn 1 admin trong hệ thống → không cho ban admin đó
- Approve recipe của user đã bị ban → recipe vẫn `pending` (vì user inactive)
- Merge ingredients → recompute popular ingredients cache (nếu có)
- Xóa ingredient đang được dùng → cập nhật `recipe_ingredients.ingredient_name = NULL`
- Comment ẩn vẫn count vào stats

## Bảo mật & Audit Log (optional cho v2)
Có thể thêm bảng `admin_actions` để log mọi action của admin:
```sql
admin_actions:
  id, admin_id, action_type, target_type, target_id, details(jsonb), created_at
```
- action_type: ban_user / unban_user / approve_recipe / reject_recipe / delete_comment / ...
- target_type: user / recipe / comment
- details: { reason: "...", before: {...}, after: {...} }
