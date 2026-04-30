# 04 — Social Features (Like, Comment, Rating, Follow, Feed)

## Actors
- **User** (requires auth): rate, comment, save, follow
- **Guest**: chỉ đọc

## Use Cases

### UC-20: Rating recipe (1-5 sao)
**Flow:**
1. User mở recipe detail → click sao (1-5)
2. Backend upsert vào bảng `ratings` (UNIQUE recipe_id + user_id)
3. Trigger update `recipes.avg_rating` và `recipes.rating_count`

**API:** `POST /api/v1/recipes/{recipe_id}/rate` (requires auth)
```json
Request:  { "score": 5 }
Response: {
  "success": true,
  "data": {
    "avg_rating": 4.3,
    "rating_count": 51,
    "user_rating": 5
  }
}
```
- Nếu user đã rate trước đó → update score mới
- Recompute avg: `(SUM(score) / COUNT(*))`

**API:** `GET /api/v1/recipes/{recipe_id}/my-rating` (requires auth)
- Trả về rating user đã chấm: `{ "score": 5 }` hoặc `null`

**API:** `DELETE /api/v1/recipes/{recipe_id}/rate` (requires auth)
- Xóa rating của user → recompute avg

### UC-21: Comment recipe
**API:**
```
GET    /api/v1/recipes/{recipe_id}/comments?page=1&limit=20    -- Guest đọc được
POST   /api/v1/recipes/{recipe_id}/comments                    -- requires auth
PUT    /api/v1/comments/{comment_id}                           -- chỉ author
DELETE /api/v1/comments/{comment_id}                           -- author hoặc admin
```

```json
GET Response: {
  "data": [
    {
      "id": "", "content": "Ngon quá, mình đã thử rồi!",
      "is_hidden": false, "created_at": "", "updated_at": "",
      "user": { "id": "", "full_name": "", "avatar_url": "" },
      "is_mine": false   // true nếu là comment của user hiện tại
    }
  ],
  "pagination": {...}
}

POST Request:  { "content": "Cảm ơn công thức ạ!" }
POST Response: { "data": { "id": "", "content": "", "user": {...}, "created_at": "" } }

PUT Request:   { "content": "Đã sửa nội dung..." }

DELETE: 204 No Content
```

**Edge cases comment:**
- Comment bị xóa: hard delete, hoặc soft delete bằng `is_hidden=true` và content = "Bình luận đã bị xóa"
- User bị ban → tất cả comment ẩn (`is_hidden=true`)
- Content rỗng/spam quá ngắn → 400 (validation: 2-1000 ký tự)

### UC-22: Lưu/Bỏ lưu recipe (Bookmark)
**API:**
```
POST   /api/v1/recipes/{recipe_id}/save     -- lưu
DELETE /api/v1/recipes/{recipe_id}/save     -- bỏ lưu
GET    /api/v1/me/saved-recipes?page=1      -- danh sách đã lưu
```

```json
POST Response: {
  "data": { "is_saved": true, "save_count": 121 }
}

GET Response: {
  "data": [
    { ...recipe card..., "saved_at": "2024-01-15T10:30:00Z" }
  ],
  "pagination": {...}
}
```

**Side effects:**
- Save → `recipes.save_count += 1`
- Unsave → `recipes.save_count -= 1`

### UC-23: Follow / Unfollow user
**API:**
```
POST   /api/v1/users/{user_id}/follow
DELETE /api/v1/users/{user_id}/follow
GET    /api/v1/users/{user_id}/followers?page=1&limit=20
GET    /api/v1/users/{user_id}/following?page=1&limit=20
```

```json
POST Response: {
  "data": { "is_following": true, "follower_count": 101 }
}
```

- Không cho follow chính mình → 400 "Không thể tự follow bản thân"
- Đã follow rồi mà follow lại → 409 hoặc idempotent (return success)

### UC-24: Profile user (public)
**API:** `GET /api/v1/users/{user_id}/profile`
```json
Response: {
  "data": {
    "id": "", "full_name": "", "avatar_url": "", "bio": "",
    "created_at": "",
    "stats": {
      "recipe_count": 15,         // chỉ tính status=approved
      "follower_count": 200,
      "following_count": 50,
      "total_likes_received": 350 // tổng rating count của tất cả recipes
    },
    "is_following": false,        // null nếu Guest, true/false nếu logged in
    "is_self": false,             // true nếu là profile của chính user hiện tại
    "recent_recipes": [
      // top 6 recipes mới nhất status=approved
    ]
  }
}
```

### UC-25: Social Feed (Newsfeed)
**Flow:**
1. Lấy danh sách user mà current_user đang follow
2. Lấy recipes mới nhất từ những user đó (`status='approved'`)
3. Sort theo `created_at DESC`
4. Nếu chưa follow ai → fallback "Discover" mode (top recipes phổ biến)

**API:** `GET /api/v1/feed?page=1&limit=20` (requires auth)
```json
Response: {
  "data": [
    {
      "type": "recipe",
      "recipe": { ...recipe card... },
      "author": { ...user info... },
      "posted_at": "2024-01-15T10:30:00Z"
    }
  ],
  "pagination": {...},
  "is_discover_mode": false   // true nếu đang fallback
}
```

### UC-26: Cập nhật profile
**API:** `PUT /api/v1/me/profile` (requires auth)
```json
Request: {
  "full_name": "Nguyễn Văn A",
  "bio": "Yêu thích ẩm thực miền Tây",
  "avatar_url": "/static/uploads/avatars/xxx.jpg"
}
```

**Upload avatar:** POST /api/v1/upload/image với `category=avatar`

## Frontend Pages
| Route | Mô tả | Protection |
|---|---|---|
| `/users/[id]` | Public profile page | Guest đọc được |
| `/me/profile` | Edit profile | requires auth |
| `/me/saved` | Saved recipes | requires auth |
| `/feed` | Social feed / Discover | requires auth |

## UI Components
- `StarRating` — Interactive 1-5 sao với hover preview, half-star display khi đọc
- `CommentList` + `CommentForm` — Thread comments với pagination, edit/delete inline
- `FollowButton` — Toggle follow/unfollow với optimistic UI update
- `UserCard` — Avatar + name + follow button (dùng trong follower list)
- `FeedCard` — Recipe card mở rộng với author info + timestamp
- `SaveButton` — Heart icon toggle, animation khi click

## Edge Cases
- Self-follow → 400 "Không thể tự follow bản thân"
- Self-rate → cho phép (không cấm rate recipe của chính mình)
- User bị ban → tất cả comments có `is_hidden=true`, recipes ẩn khỏi feed
- Feed trống (chưa follow ai) → hiển thị "Discover" với top trending recipes
- Comment xóa → giữ placeholder, không break UI thread
- Rate score ngoài 1-5 → 422 validation error
- Comment quá dài (>1000 ký tự) → 422 validation error
