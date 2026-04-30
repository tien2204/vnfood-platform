# 00 — Tổng quan & Database Schema (Localhost)

## Kiến trúc localhost

```
[Browser: localhost:3000]
        │
        ▼
[Next.js 14 — next dev]
        │
        ▼  HTTP REST
[FastAPI — uvicorn :8000]
    │        │        │
    ▼        ▼        ▼
[PostgreSQL] [uploads/] [PyTorch Models]
[Docker:5432] [local]   [memory loaded]
                │
                ▼ (fallback)
          [OpenAI API]
```

## Database Schema

### users
```sql
id            UUID PRIMARY KEY DEFAULT gen_random_uuid()
email         TEXT UNIQUE NOT NULL
hashed_password TEXT NOT NULL
full_name     TEXT
avatar_url    TEXT                        -- path: /static/uploads/avatars/xxx.jpg
bio           TEXT
role          TEXT DEFAULT 'user'         -- 'user' | 'admin'
is_active     BOOLEAN DEFAULT true
created_at    TIMESTAMPTZ DEFAULT now()
updated_at    TIMESTAMPTZ DEFAULT now()
```

### recipes
```sql
id               UUID PRIMARY KEY DEFAULT gen_random_uuid()
title            TEXT NOT NULL
description      TEXT
source           TEXT DEFAULT 'user'      -- 'cookpad' | 'user'
cookpad_url      TEXT
keyword          TEXT                     -- Bánh | Bún | Cá | Canh | Cơm | Gỏi | Phở | Thịt | Xôi
status           TEXT DEFAULT 'pending'   -- 'pending' | 'approved' | 'rejected'
reject_reason    TEXT
author_id        UUID REFERENCES users(id)
image_url        TEXT
cooking_time     INT                      -- phút
servings         INT DEFAULT 2
difficulty       TEXT                     -- 'easy'|'medium'|'hard'
avg_rating       FLOAT DEFAULT 0
rating_count     INT DEFAULT 0
view_count       INT DEFAULT 0
save_count       INT DEFAULT 0
created_at       TIMESTAMPTZ DEFAULT now()
updated_at       TIMESTAMPTZ DEFAULT now()
```

### recipe_ingredients
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
recipe_id       UUID REFERENCES recipes(id) ON DELETE CASCADE
display_text    TEXT NOT NULL             -- "240 gram bột mì đa dụng"
ingredient_name TEXT                      -- "bột mì" (từ ingredients_extract)
quantity        TEXT                      -- "240 gram"
order_index     INT DEFAULT 0
```

### recipe_steps
```sql
id           UUID PRIMARY KEY DEFAULT gen_random_uuid()
recipe_id    UUID REFERENCES recipes(id) ON DELETE CASCADE
step_number  INT NOT NULL
content      TEXT NOT NULL
image_url    TEXT
timer_seconds INT DEFAULT 0
```

### comments
```sql
id          UUID PRIMARY KEY DEFAULT gen_random_uuid()
recipe_id   UUID REFERENCES recipes(id) ON DELETE CASCADE
user_id     UUID REFERENCES users(id)
content     TEXT NOT NULL
is_hidden   BOOLEAN DEFAULT false
created_at  TIMESTAMPTZ DEFAULT now()
updated_at  TIMESTAMPTZ DEFAULT now()
```

### ratings
```sql
id          UUID PRIMARY KEY DEFAULT gen_random_uuid()
recipe_id   UUID REFERENCES recipes(id) ON DELETE CASCADE
user_id     UUID REFERENCES users(id)
score       INT CHECK (score BETWEEN 1 AND 5)
created_at  TIMESTAMPTZ DEFAULT now()
UNIQUE(recipe_id, user_id)
```

### saved_recipes
```sql
id          UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id     UUID REFERENCES users(id) ON DELETE CASCADE
recipe_id   UUID REFERENCES recipes(id) ON DELETE CASCADE
created_at  TIMESTAMPTZ DEFAULT now()
UNIQUE(user_id, recipe_id)
```

### follows
```sql
id            UUID PRIMARY KEY DEFAULT gen_random_uuid()
follower_id   UUID REFERENCES users(id) ON DELETE CASCADE
following_id  UUID REFERENCES users(id) ON DELETE CASCADE
created_at    TIMESTAMPTZ DEFAULT now()
UNIQUE(follower_id, following_id)
```

### meal_plans
```sql
id          UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id     UUID REFERENCES users(id) ON DELETE CASCADE
name        TEXT DEFAULT 'Meal Plan tuần này'
week_start  DATE NOT NULL
created_at  TIMESTAMPTZ DEFAULT now()
```

### meal_plan_items
```sql
id            UUID PRIMARY KEY DEFAULT gen_random_uuid()
meal_plan_id  UUID REFERENCES meal_plans(id) ON DELETE CASCADE
recipe_id     UUID REFERENCES recipes(id)
date          DATE NOT NULL
meal_type     TEXT NOT NULL              -- 'breakfast'|'lunch'|'dinner'|'snack'
servings      INT DEFAULT 2
note          TEXT
```

### grocery_items
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
meal_plan_id    UUID REFERENCES meal_plans(id) ON DELETE CASCADE
ingredient_name TEXT NOT NULL
quantity        TEXT
is_checked      BOOLEAN DEFAULT false
```

### ai_logs
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id         UUID REFERENCES users(id)
image_url       TEXT
predicted_class TEXT
confidence      FLOAT
model_used      TEXT                    -- 'vnfood' | 'openai'
created_at      TIMESTAMPTZ DEFAULT now()
```

## Import Strategy (22k recipes)

Script `backend/scripts/import_recipes.py`:
1. Đọc tất cả `*_extracted.json` từ `cookpad_recipe/`
2. Insert vào `recipes` với `source='cookpad'`, `status='approved'`
3. Mỗi item `ingredients_display[i]` → insert vào `recipe_ingredients`
   - `display_text` = text gốc
   - `ingredient_name` = `ingredients_extract[i]` (nếu có)
4. Mỗi item `instructions[i]` → insert vào `recipe_steps`
5. Chạy idempotent (skip nếu `cookpad_url` đã tồn tại)

## Roles & Permissions

| Action | Guest | User | Admin |
|---|---|---|---|
| Xem recipes | ✅ | ✅ | ✅ |
| Register/Login | ✅ | - | - |
| Comment, rate | ❌ | ✅ | ✅ |
| Save recipe | ❌ | ✅ | ✅ |
| Đăng recipe | ❌ | ✅ | ✅ |
| Follow user | ❌ | ✅ | ✅ |
| AI nhận diện | ✅ | ✅ | ✅ |
| Meal plan | ❌ | ✅ | ✅ |
| Approve recipe | ❌ | ❌ | ✅ |
| Ban user | ❌ | ❌ | ✅ |
| Quản lý DB | ❌ | ❌ | ✅ |
