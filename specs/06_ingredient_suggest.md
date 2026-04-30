# 06 — Gợi ý Recipe từ Nguyên liệu

## Actors: Guest, User

## Use Cases

### UC-30: Gợi ý recipe theo nguyên liệu
**Flow:**
1. User vào `/suggest`
2. Frontend load 30 nguyên liệu phổ biến nhất
3. User click chọn 1+ nguyên liệu (chip toggle)
4. Có thể gõ thêm để autocomplete tìm nguyên liệu khác
5. Click "Tìm công thức" → backend search
6. Backend tìm trong DB trước
7. Nếu < 3 kết quả → gọi OpenAI suggest thêm
8. Hiển thị 2 sections: "Có sẵn trong hệ thống" + "Gợi ý thêm từ AI"

## Endpoints

### GET /api/v1/ingredients/popular?limit=30
**Logic:** Đếm số recipe có chứa mỗi `ingredient_name` (status='approved'), sort desc

```sql
SELECT ingredient_name, COUNT(DISTINCT recipe_id) as usage_count
FROM recipe_ingredients ri
JOIN recipes r ON r.id = ri.recipe_id
WHERE r.status = 'approved'
  AND ri.ingredient_name IS NOT NULL
  AND ri.ingredient_name != ''
GROUP BY ingredient_name
ORDER BY usage_count DESC
LIMIT 30
```

```json
Response: {
  "data": [
    { "name": "thịt bò", "usage_count": 1250 },
    { "name": "hành tây", "usage_count": 980 },
    { "name": "nước mắm", "usage_count": 850 }
  ]
}
```

### GET /api/v1/ingredients/search?q={query}&limit=20
**Logic:** Fuzzy search nguyên liệu (autocomplete khi gõ)

```sql
SELECT DISTINCT ingredient_name, COUNT(*) as usage_count
FROM recipe_ingredients
WHERE ingredient_name ILIKE '%' || :q || '%'
GROUP BY ingredient_name
ORDER BY usage_count DESC
LIMIT 20
```

### POST /api/v1/recipes/suggest-by-ingredients
**Request:**
```json
{
  "ingredient_names": ["thịt bò", "hành tây", "cà chua"],
  "match_mode": "any"   // "all" | "any" | "most"  (default: "any")
}
```

**Logic backend:**

```python
# match_mode = "any": có ít nhất 1 nguyên liệu khớp
# match_mode = "all": phải có TẤT CẢ nguyên liệu
# match_mode = "most": có nhiều nhất các nguyên liệu, sort theo match_count desc

# SQL example cho "any" + "most":
SELECT r.*, COUNT(DISTINCT ri.ingredient_name) as match_count,
       ARRAY_AGG(DISTINCT ri.ingredient_name) as matched_ingredients
FROM recipes r
JOIN recipe_ingredients ri ON r.id = ri.recipe_id
WHERE r.status = 'approved'
  AND ri.ingredient_name = ANY(:ingredient_names)
GROUP BY r.id
ORDER BY match_count DESC, r.avg_rating DESC, r.view_count DESC
LIMIT 20
```

**Match score:** `match_count / len(ingredient_names)` (0.0 - 1.0)

**OpenAI fallback** (khi DB trả về < 3 kết quả):
```python
prompt = f"""
Tôi có các nguyên liệu sau: {', '.join(ingredient_names)}
Hãy gợi ý 5 món ăn Việt Nam có thể nấu được từ các nguyên liệu này.
Trả về JSON:
{{
  "suggestions": [
    {{
      "name": "tên món",
      "description": "mô tả ngắn 1-2 câu",
      "key_ingredients": ["nguyên liệu chính 1", "..."],
      "additional_needed": ["nguyên liệu cần thêm 1", "..."]
    }}
  ]
}}
"""
```

**Response:**
```json
{
  "data": {
    "match_mode": "any",
    "selected_ingredients": ["thịt bò", "hành tây", "cà chua"],

    "db_results": [
      {
        "recipe": {
          "id": "", "title": "", "image_url": "",
          "avg_rating": 4.5, "cooking_time": 30,
          "author": {...}
        },
        "match_score": 0.67,           // 2/3
        "matched_ingredients": ["thịt bò", "hành tây"],
        "missing_ingredients": ["cà chua"]
      }
    ],

    "ai_suggestions": [
      {
        "name": "Bò xào hành tây cà chua",
        "description": "Món xào nhanh gọn, đậm đà, ăn với cơm nóng rất hợp.",
        "key_ingredients": ["thịt bò", "hành tây", "cà chua"],
        "additional_needed": ["dầu ăn", "tỏi", "muối", "nước mắm"]
      }
    ],

    "total_db_results": 12,
    "ai_used": false   // true nếu đã gọi OpenAI fallback
  }
}
```

## Frontend Page: `/suggest`

**Layout:**
```
┌─────────────────────────────────────────────────────┐
│ Gợi ý công thức từ nguyên liệu                      │
│                                                     │
│ [🔍 Search nguyên liệu...]                         │
│                                                     │
│ Phổ biến:                                          │
│ [thịt bò ✓] [thịt heo] [hành tây ✓] [tỏi]         │
│ [nước mắm] [đường] [muối] [tiêu] [...]             │
│                                                     │
│ Đã chọn (2): thịt bò ✕  hành tây ✕                │
│                                                     │
│ Match mode:  ( ) Có ít nhất 1   (•) Có nhiều nhất │
│                                                     │
│           [Tìm công thức (12)]                     │
└─────────────────────────────────────────────────────┘

Sau khi search:
┌─────────────────────────────────────────────────────┐
│ Có sẵn trong hệ thống (12)                         │
│ [RecipeCard grid với badge "Khớp 2/2 nguyên liệu"]│
│                                                     │
│ Gợi ý thêm từ AI (5)                              │
│ [AI suggestion cards với CTA "Tìm tương tự"]      │
└─────────────────────────────────────────────────────┘
```

## UI Components
- `IngredientChip` — Toggle button hiển thị tên + count, chọn rồi hiện tick
- `IngredientSearch` — Autocomplete input, debounce 300ms
- `MatchModeSelector` — Radio group 3 mode
- `RecipeMatchCard` — RecipeCard mở rộng có badge "Khớp X/Y nguyên liệu" + danh sách matched
- `AISuggestionCard` — Card với name + description + key_ingredients + additional_needed list

## Edge Cases
- User chọn 0 nguyên liệu → disable button "Tìm"
- User chọn quá nhiều (>10) → warning "Chọn quá nhiều có thể không có kết quả"
- DB trả về 0 kết quả → chỉ hiển thị AI suggestions
- OpenAI fail → vẫn trả `db_results` + `ai_suggestions: []`
- Ingredient không có trong DB (user gõ tay) → vẫn cho gửi lên OpenAI
