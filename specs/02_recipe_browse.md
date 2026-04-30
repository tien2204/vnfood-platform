# 02 — Recipe Browse, Search & Filter

## Actors: Guest, User, Admin

## Use Cases

### UC-08: Trang chủ — Featured Recipes
**Flow:** Hiển thị recipes nổi bật (avg_rating cao, view_count cao, mới nhất)

**API:** `GET /api/v1/recipes/featured`
```json
Response: {
  "data": {
    "trending": [...],   // 10 recipes view_count cao trong 7 ngày
    "new":      [...],   // 10 recipes mới nhất
    "top_rated":[...]    // 10 recipes avg_rating cao nhất (rating_count >= 5)
  }
}
```

### UC-09: Browse tất cả recipes
**API:** `GET /api/v1/recipes`
```
Query params:
  page        INT   default 1
  limit       INT   default 20 (max 50)
  keyword     TEXT  -- Bánh, Bún, Cá, Canh, Cơm, Gỏi, Phở, Thịt, Xôi
  source      TEXT  -- cookpad | user
  difficulty  TEXT  -- easy | medium | hard
  sort        TEXT  -- newest | popular | top_rated  (default: newest)
  search      TEXT  -- full-text search title + description
```
```json
Response: {
  "success": true,
  "data": [
    {
      "id": "", "title": "", "image_url": "/static/uploads/...",
      "avg_rating": 4.5, "rating_count": 50,
      "cooking_time": 30, "servings": 4, "difficulty": "medium",
      "source": "cookpad",
      "author": { "id": "", "full_name": "", "avatar_url": "" },
      "save_count": 120,
      "is_saved": false      // chỉ trả về khi user đã login
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 500, "total_pages": 25 }
}
```

### UC-10: Chi tiết recipe
**API:** `GET /api/v1/recipes/{recipe_id}`

**Side effects:**
- Tăng `view_count += 1` (async, không block response)
- Trả về full recipe kèm ingredients, steps, author info, rating summary

```json
Response: {
  "data": {
    "id": "", "title": "", "description": "",
    "image_url": "", "cooking_time": 30, "servings": 4,
    "difficulty": "medium", "source": "cookpad", "cookpad_url": "",
    "keyword": "Bánh", "status": "approved",
    "avg_rating": 4.2, "rating_count": 50, "view_count": 1200, "save_count": 89,

    "author": {
      "id": "", "full_name": "", "avatar_url": "",
      "follower_count": 100, "is_following": false
    },

    "ingredients": [
      {
        "id": "",
        "display_text": "240 gram bột mì đa dụng",
        "ingredient_name": "bột mì",
        "quantity": "240 gram",
        "order_index": 0
      }
    ],

    "steps": [
      {
        "step_number": 1,
        "content": "Hoà tan bột với nước...",
        "image_url": "",
        "timer_seconds": 1800
      }
    ],

    "is_saved": false,
    "user_rating": null,   // 1-5 nếu user đã rate, null nếu chưa
    "created_at": "", "updated_at": ""
  }
}
```

### UC-11: Search recipes
**API:** `GET /api/v1/recipes/search?q={query}&page=1&limit=20`

**Implementation (PostgreSQL full-text):**
```sql
SELECT *,
  ts_rank(to_tsvector('simple', title || ' ' || COALESCE(description,'')),
          plainto_tsquery('simple', :q)) as rank
FROM recipes
WHERE to_tsvector('simple', title || ' ' || COALESCE(description,''))
      @@ plainto_tsquery('simple', :q)
  AND status = 'approved'
ORDER BY rank DESC, avg_rating DESC
LIMIT :limit OFFSET :offset
```

Kết hợp filter như UC-09 (keyword, difficulty, source).

### UC-12: Recipes theo nhóm/keyword
**API:** `GET /api/v1/recipes/by-keyword/{keyword}`
- keyword (URL-friendly): banh | bun | ca | canh | com | goi | pho | thit | xoi
- Backend map slug → keyword tiếng Việt: 'banh' → 'Bánh'

### UC-13: Recipes của một user
**API:** `GET /api/v1/users/{user_id}/recipes?page=1&limit=20&status=`
- Public request: chỉ trả về `status='approved'`
- Nếu là chính user đó hoặc admin → trả về cả `pending`, `rejected`

## Frontend Pages
| Route | Mô tả |
|---|---|
| `/` | Homepage với 3 sections: trending / new / top rated |
| `/recipes` | Browse tất cả với filter sidebar |
| `/recipes/[id]` | Recipe detail page |
| `/search?q=` | Kết quả tìm kiếm |
| `/keyword/[slug]` | Recipes theo nhóm (bánh, bún, ...) |

## UI Components
- `RecipeCard` — thumbnail 16:9, title, rating, cooking time, author avatar, save icon
- `RecipeGrid` — responsive grid (1/2/3/4 cột tùy breakpoint)
- `FilterSidebar` — keyword, difficulty, source, sort
- `SearchBar` — debounced search 300ms, keyboard shortcut "/"
- `RecipeDetail` — full layout với ingredients list + step-by-step
- `KeywordChips` — horizontal scroll các nhóm món

## Edge Cases
- Recipe `status='pending'` → chỉ author và admin thấy được
- Recipe của user bị ban (`is_active=false`) → ẩn khỏi tất cả listing
- Image URL broken → hiển thị placeholder theo keyword (banh.jpg, pho.jpg, ...)
- Recipe không có ảnh → placeholder mặc định
- Search rỗng → fallback về browse mặc định
- View count tăng quá nhiều bot → dùng Redis cache hoặc throttle theo IP (sau)
