# CLAUDE.md — VNFood Platform (Localhost Dev)

> **Môi trường:** Localhost development  
> **Mục tiêu:** Chạy hoàn chỉnh trên máy local trước khi deploy lên cloud

---

## Tech Stack (Localhost)

| Layer | Technology | Chi tiết |
|---|---|---|
| Frontend | Next.js 14 (App Router) + TypeScript | `next dev` port 3000 |
| Styling | Tailwind CSS + shadcn/ui | |
| Backend | FastAPI (Python 3.11) | `uvicorn` port 8000 |
| Database | PostgreSQL 16 (Docker) | port 5432 |
| Auth | JWT tự handle (`python-jose`) | |
| File Storage | Local `backend/uploads/` | serve qua `/static/uploads` |
| AI Model | Chạy trong FastAPI backend | PyTorch EfficientNet |
| AI Fallback | OpenAI Vision (`gpt-4o-mini`) | |

---

## Cấu trúc thư mục

```
vnfood-platform/
├── backend/
│   ├── app/
│   │   ├── api/v1/
│   │   │   ├── auth.py
│   │   │   ├── recipes.py
│   │   │   ├── users.py
│   │   │   ├── comments.py
│   │   │   ├── ai.py
│   │   │   ├── meal_plans.py
│   │   │   └── admin.py
│   │   ├── core/
│   │   │   ├── config.py       # Settings từ .env
│   │   │   ├── database.py     # SQLAlchemy async engine
│   │   │   ├── security.py     # JWT encode/decode
│   │   │   └── deps.py         # FastAPI dependencies
│   │   ├── models/             # SQLAlchemy ORM models
│   │   ├── schemas/            # Pydantic schemas
│   │   ├── services/           # Business logic
│   │   ├── ai/
│   │   │   ├── inference.py    # PyTorch model load & predict
│   │   │   └── class_names.py  # GROUP_CLASSES + display names
│   │   └── main.py
│   ├── alembic/
│   ├── uploads/                # Ảnh upload lưu ở đây
│   ├── scripts/
│   │   └── import_recipes.py   # Import 22k JSON vào DB
│   ├── .env
│   ├── .env.example
│   └── requirements.txt
├── frontend/
│   ├── app/
│   ├── components/
│   ├── lib/
│   ├── .env.local
│   └── package.json
├── model_weights/              # Copy file .pth vào đây
│   ├── best_group_effb0.pth
│   ├── best_sub_BANH_effb2.pth
│   ├── best_sub_BUN_PHO_effb2.pth
│   ├── best_sub_CANH_CHAO_effb2.pth
│   ├── best_sub_COM_effb2.pth
│   ├── best_sub_DAC_BIET_effb2.pth
│   ├── best_sub_GOI_CUON_effb2.pth
│   ├── best_sub_MON_KHO_NUONG_effb2.pth
│   └── best_sub_XOI_effb2.pth
├── cookpad_recipe/             # Recipe JSON (extracted version)
└── docker-compose.yml
```

---

## Khởi động nhanh

```bash
# 1. Database
docker-compose up -d

# 2. Backend
cd backend
python -m venv .venv && .venv\Scripts\activate
pip install -r requirements.txt
alembic upgrade head
python scripts/import_recipes.py
uvicorn app.main:app --reload --port 8000

# 3. Frontend
cd frontend
npm install && npm run dev
```

---

## docker-compose.yml

```yaml
version: "3.9"
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: vnfood_db
      POSTGRES_USER: vnfood
      POSTGRES_PASSWORD: vnfood123
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
  pgadmin:
    image: dpage/pgadmin4
    environment:
      PGADMIN_DEFAULT_EMAIL: admin@admin.com
      PGADMIN_DEFAULT_PASSWORD: admin
    ports:
      - "5050:80"
    depends_on: [postgres]
volumes:
  postgres_data:
```

---

## Environment Variables

### `backend/.env`
```env
DATABASE_URL=postgresql+asyncpg://vnfood:vnfood123@localhost:5432/vnfood_db
SECRET_KEY=your-super-secret-key-change-this
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
REFRESH_TOKEN_EXPIRE_DAYS=7
OPENAI_API_KEY=sk-...
UPLOAD_DIR=uploads
MAX_UPLOAD_SIZE_MB=10
MODEL_WEIGHTS_DIR=../model_weights
```

### `frontend/.env.local`
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_UPLOAD_URL=http://localhost:8000/static/uploads
```

---

## API Conventions

**Base URL:** `http://localhost:8000/api/v1`  
**Auth:** `Authorization: Bearer <access_token>`

```json
// Success
{ "success": true, "data": {}, "message": "string" }

// Success với pagination
{ "success": true, "data": [], "pagination": { "page": 1, "limit": 20, "total": 500 } }

// Error
{ "success": false, "error": { "code": "RECIPE_NOT_FOUND", "message": "..." } }
```

---

## AI Classes đã train

```python
# Dùng file này làm source of truth cho inference
GROUP_CLASSES = {
    'BANH': ['banh-bao','banh-beo','banh-bo','banh-bot-loc','banh-can',
             'banh-canh','banh-chung','banh-cong','banh-cuon','banh-da-cua',
             'banh-da-lon','banh-duc','banh-gai','banh-giay','banh-gio',
             'banh-hoi','banh-khot','banh-la','banh-mi','banh-mi-chao',
             'banh-pia','banh-tai-heo','banh-tet','banh-tieu','banh-tom-ho-tay',
             'banh-trang-nuong','banh-troi-nuoc','banh-trung-thu','banh-u',
             'banh-xeo','cao-lau'],
    'BUN_PHO': ['pho','bun-bo-hue','bun-cha','bun-cha-ca','bun-dau-mam-tom',
                'bun-mam','bun-rieu','bun-thit-nuong','hu-tieu','mi-quang',
                'mi-xao-gion','nui-xao','nam-pia','banh-canh'],
    'COM': ['com-chay-cha-bong','com-chien','com-ga-xoi-mo',
            'com-lam','com-rang-dua-bo','com-tam'],
    'MON_KHO_NUONG': ['bo-kho','bo-la-lot','bo-luc-lac','bo-ne','bo-nuong-la-lot',
                      'ca-kho-to','ca-loc-nuong','ca-muoi-xoi','ca-sot-ca-chua',
                      'ga-chien-nuoc-mam','kho-muc-nuong','kho-quet','lap-xuong',
                      'luon-xao-xa-ot','muc-nhoi-thit','rau-muong-xao','thit-kho-tau'],
    'CANH_CHAO': ['canh-bi-do','canh-chua','canh-cua','canh-kho-hoa',
                  'canh-khoai-tim','ca-ri-ga','chao-long','chao-vit',
                  'sup-cua','bo-kho','luon-om-chuoi-dau'],
    'XOI': ['xoi-gac','xoi-nep-than','xoi-xeo'],
    'GOI_CUON': ['goi-ca-chich','goi-cuon','nem-chua','nem-nuong-nha-trang',
                 'cha-com','cha-lui'],
    'DAC_BIET': ['baba-nau-chuoi-dau','ca-muoi-xoi','cha-ca-la-vong',
                 'cua-hap-bia','cut-lon-xao-me','ga-hap-la-chanh','khau-nhuc',
                 'mam-chung','mam-tep-chung-thit','oc-buou-hap','oc-huong-xao',
                 'oc-len-xao-dua','tau-hu-nhoi-thit','tau-hu-non','thit-dong',
                 'thit-trau-gac-bep','tiet-canh','trung-vit-lon'],
}

GROUP_TO_WEIGHT = {
    'BANH':          'best_sub_BANH_effb2.pth',
    'BUN_PHO':       'best_sub_BUN_PHO_effb2.pth',
    'COM':           'best_sub_COM_effb2.pth',
    'MON_KHO_NUONG': 'best_sub_MON_KHO_NUONG_effb2.pth',
    'CANH_CHAO':     'best_sub_CANH_CHAO_effb2.pth',
    'XOI':           'best_sub_XOI_effb2.pth',
    'GOI_CUON':      'best_sub_GOI_CUON_effb2.pth',
    'DAC_BIET':      'best_sub_DAC_BIET_effb2.pth',
}
```

---

## Naming Conventions
- Python: `snake_case` vars/funcs, `PascalCase` classes
- TypeScript: `camelCase` vars/funcs, `PascalCase` components/types
- DB tables: `snake_case`
- API endpoints: `kebab-case`

---

## Thứ tự implement

### Week 1 — Foundation
- [x] docker-compose.yml + PostgreSQL
- [x] FastAPI boilerplate + DB migrations
- [x] Auth: register, login, JWT refresh
- [x] Script import 22k recipes JSON → DB
- [x] Recipe browse + search + filter APIs
- [x] Next.js setup + Homepage + Recipe list + Recipe detail

### Week 2 — Core Features
- [x] User đăng recipe + Admin duyệt
- [ ] Comment, Rating, Save/Bookmark
- [ ] Follow user + Social feed
- [ ] User profile

### Week 3 — AI Features
- [ ] AI inference (PyTorch model load + EfficientNet pipeline)
- [ ] AI nhận diện ảnh → gợi ý recipe
- [ ] Gợi ý recipe từ nguyên liệu
- [ ] Meal plan + Grocery list

### Week 4 — Polish
- [ ] Cooking mode + Scale recipe
- [ ] Admin dashboard
- [ ] Testing + UI polish

---

## Trạng thái hiện tại _(cập nhật sau mỗi session)_

### Đã hoàn thành
- [x] Thiết kế spec toàn bộ usecase
- [x] normalize_ingredients.py (chuẩn hóa ingredients)
- [x] CLAUDE.md + specs localhost version
- [x] `docker-compose.yml` (PostgreSQL 16 + pgAdmin)
- [x] FastAPI boilerplate: `backend/app/main.py` + health check endpoints
- [x] `backend/app/core/config.py` (pydantic-settings load .env)
- [x] `backend/requirements.txt` (fastapi, sqlalchemy, asyncpg, jose, passlib, torch...)
- [x] `backend/.env` + `backend/.env.example`
- [x] Cấu trúc thư mục đầy đủ: `api/v1/`, `models/`, `schemas/`, `services/`, `ai/`
- [x] `backend/app/core/database.py` — async engine, AsyncSessionLocal, get_db(), Base
- [x] ORM models đầy đủ 12 bảng (user, recipe, social, meal_plan, ai_log) với relationships, CASCADE, UNIQUE, CHECK constraints, indexes
- [x] Alembic init + `alembic/env.py` (async engine, import models, đọc .env)
- [x] Migration `0001_initial_schema.py` — 12 bảng, đầy đủ indexes + constraints
- [x] Đã chạy `alembic upgrade head` thành công — 12 bảng đã tạo trong PostgreSQL
- [x] pgAdmin auto-register server (`pgadmin-servers.json`) + persistent volume `pgadmin_data` → config không mất khi `docker-compose down`/`up`
- [x] `start.bat` — script tự động khởi động Docker + activate venv + chạy uvicorn
- [x] `backend/app/core/security.py` — hash_password, verify_password, create_access_token, create_refresh_token, decode_token
- [x] `backend/app/core/deps.py` — oauth2_scheme, get_current_user, get_current_active_user, require_admin, get_optional_current_user
- [x] `backend/app/schemas/auth.py` — RegisterRequest, LoginRequest, RefreshRequest, TokenResponse, UserOut, ChangePasswordRequest
- [x] `backend/app/services/auth_service.py` — register_user, login, refresh_access_token, change_password
- [x] `backend/app/api/v1/auth.py` — 5 endpoints: /register, /login, /refresh, /logout, /change-password
- [x] `main.py` — mount auth_router tại /api/v1/auth
- [x] `backend/scripts/seed_admin.py` — tạo admin@vnfood.local / Admin@123 (idempotent)
- [x] `backend/scripts/import_recipes.py` — import 22k recipes từ 9 file `*_extracted.json`, batch 200, idempotent (skip duplicate cookpad_url), argparse (--dry-run, --files, --batch-size)
- [x] `backend/scripts/check_recipes.py` — verify recipes trong DB: total, by source, by keyword, by status
- [x] 22k recipes đã import thành công vào DB (source=cookpad, status=approved)
- [x] `backend/app/schemas/recipe.py` — AuthorOut, AuthorDetailOut, IngredientOut, StepOut, PaginationOut, RecipeCardOut, RecipeDetailOut
- [x] `backend/app/services/recipe_service.py` — list_recipes, get_recipe_detail, increment_view_count (background), search_recipes (PostgreSQL full-text), get_featured_recipes, get_recipes_by_keyword, get_user_recipes
- [x] `backend/app/api/v1/recipes.py` — 5 endpoints: GET /recipes, GET /recipes/featured, GET /recipes/search, GET /recipes/by-keyword/{slug}, GET /recipes/{id}
- [x] `backend/app/api/v1/users.py` — GET /users/{user_id}/recipes (UC-13)
- [x] `main.py` — mount recipes_router + users_router

- [x] `frontend/` — Next.js 16 + React 19 + Tailwind v4 + shadcn/ui (Base UI)
- [x] `frontend/app/globals.css` — VNFood design system: primary #E85D26, secondary #2D6A4F, warm background #FFFBF5
- [x] `frontend/app/layout.tsx` — Playfair Display (heading) + Inter (body), Navbar, Footer, MobileBottomNav, Sonner Toaster
- [x] `frontend/lib/api.ts` — Axios instance, Bearer interceptor, 401 → auto refresh token → retry → nếu fail clear + redirect
- [x] `frontend/lib/types.ts` — TypeScript types: User, Author, Ingredient, Step, RecipeCard, RecipeDetail, etc.
- [x] `frontend/lib/auth.ts` — saveTokens (localStorage + httpOnly cookie), clearTokens, getAccessToken, getRefreshToken, getStoredUser, decodeJWT
- [x] `frontend/lib/actions/auth-cookies.ts` — `"use server"` actions: setTokensCookie / clearTokensCookie dùng `cookies()` từ `next/headers`
- [x] `frontend/lib/hooks/useUser.ts` — `useUser()` hook (SWR cache), `refreshUser()` global mutate
- [x] `frontend/components/layout/` — Navbar (sticky, mobile search, auth-aware: avatar dropdown / login+register buttons), Footer, MobileBottomNav (5 tabs)
- [x] `frontend/components/recipes/` — RecipeCard (hover scale+shadow, badge Cookpad dot-style không gradient, badge Cộng đồng xanh), RecipeCardSkeleton, RecipeGrid (1/2/3/4 col responsive)
- [x] `frontend/components/common/SearchBar.tsx` — debounced 300ms
- [x] `frontend/app/page.tsx` — Homepage: Hero gradient, keyword chips, trending (horizontal scroll), top_rated grid, new grid
- [x] `frontend/app/recipes/page.tsx` — Browse: keyword chips filter, sort/difficulty dropdowns, pagination, URL search params
- [x] `frontend/app/recipes/[id]/page.tsx` — Detail: stripEmoji title, blockquote description, meta row (ẩn view<100, ẩn servings null), underline tabs, comments tab "Sắp có", steps card (w-12 circle), 2-col desktop layout (tabs + sticky sidebar info card + quick actions), mobile fixed bottom bar, action bar (save count, Cookpad link conditional)
- [x] `frontend/app/auth/login/page.tsx` — Form login, toast error, redirect về `?next=` hoặc `/`
- [x] `frontend/app/auth/register/page.tsx` — Form đăng ký (validate pw ≥ 8, match), auto-login sau register
- [x] `frontend/middleware.ts` — bảo vệ `/me/*`, `/admin/*`, `/recipes/new`, `/recipes/:id/edit`; check httpOnly cookie + JWT exp + role
- [x] `backend/alembic/versions/0002_nullable_servings_timer.py` — ALTER `recipes.servings` + `recipe_steps.timer_seconds` thành nullable; UPDATE 22k Cookpad recipes servings → NULL, tất cả steps timer_seconds = 0 → NULL
- [x] `backend/app/schemas/recipe.py` — sync với migration 0002: `RecipeCardOut.servings`, `RecipeDetailOut.servings`, `StepOut.timer_seconds` đổi thành `int | None` (fix 500 trên `GET /api/v1/recipes` do Pydantic validate fail khi DB trả NULL)

- [x] **Prompt 7 — User đăng recipe + Admin duyệt (spec 03)**
- [x] `backend/app/schemas/recipe.py` — thêm RecipeCreate, RecipeUpdate, RecipeStatusUpdate, RecipeCardWithStatus
- [x] `backend/app/services/recipe_service.py` — thêm create_recipe, update_recipe, delete_recipe, get_my_recipes, get_pending_recipes, approve_recipe
- [x] `backend/app/services/upload_service.py` — save_upload_file (validate ext + size, lưu local `uploads/`)
- [x] `backend/app/api/v1/upload.py` — POST /upload/image (multipart, trả url)
- [x] `backend/app/api/v1/recipes.py` — thêm POST /recipes, PATCH /recipes/{id}, DELETE /recipes/{id}
- [x] `backend/app/api/v1/users.py` — thêm GET /users/me/recipes (filter by status, pagination)
- [x] `backend/app/api/v1/admin.py` — GET /admin/recipes, PATCH /admin/recipes/{id}/status, DELETE /admin/recipes/{id}
- [x] `backend/app/main.py` — mount upload_router + admin_router
- [x] `frontend/lib/types.ts` — thêm RecipeCreate, RecipeUpdate, RecipeCardWithStatus, UploadResponse, RECIPE_KEYWORDS, RECIPE_DIFFICULTIES
- [x] `frontend/components/common/ImageUploader.tsx` — drag-and-drop + preview, upload lên /upload/image
- [x] `frontend/components/recipes/StatusBadge.tsx` — badge pending/approved/rejected với tooltip lý do từ chối
- [x] `frontend/components/recipes/RecipeForm.tsx` — form tạo/sửa recipe (ingredients dynamic, steps dynamic, ImageUploader)
- [x] `frontend/app/recipes/new/page.tsx` — trang đăng công thức mới
- [x] `frontend/app/recipes/[id]/edit/page.tsx` — trang sửa công thức (pre-fill từ API)
- [x] `frontend/app/me/recipes/page.tsx` — danh sách công thức của tôi (tabs: tất cả/chờ/duyệt/từ chối, edit/delete)
- [x] `frontend/app/admin/recipes/page.tsx` — trang admin duyệt recipe (tabs, approve/reject modal/delete)
- [x] `frontend/middleware.ts` — bảo vệ /me/*, /admin/* (role=admin), /recipes/new, /recipes/:id/edit

- [x] **Bugfix — Auth login 422**
- [x] `backend/app/api/v1/auth.py` — đổi `/login` từ `OAuth2PasswordRequestForm` (form-urlencoded, field `username`) sang `LoginRequest` (JSON body, field `email`) — nhất quán với toàn bộ API
- [x] `backend/app/schemas/auth.py` — `LoginRequest.email` đổi từ `EmailStr` → `str` để `admin@vnfood.local` (TLD `.local` reserved) không bị Pydantic EmailStr từ chối; `RegisterRequest` giữ `EmailStr`

### Làm tiếp (session kế)
- Comment, Rating, Save/Bookmark (Week 2)
- Follow user + Social feed (Week 2)
- User profile page `/me`

### Quyết định kỹ thuật đã chốt
- PostgreSQL Docker thay Supabase
- JWT tự handle (python-jose), không Supabase Auth
- Ảnh lưu local `backend/uploads/`
- AI model chạy trong FastAPI process (không tách HF Spaces)
- Recipe JSON: dùng file `*_extracted.json` (đã có ingredients_extract)
- Alembic migration viết thủ công (không dùng autogenerate) vì cần offline generation
- pgAdmin chạy desktop mode (`PGADMIN_CONFIG_SERVER_MODE=False`) để dùng được servers.json auto-register
- pgAdmin connect tới postgres qua Docker network (host: `postgres`), KHÔNG phải `localhost`
- `bcrypt` pin ở `4.0.1` — passlib 1.7.4 không tương thích với bcrypt 4.1+ (bỏ `__about__`)
- SQLAlchemy `default=uuid.uuid4` chỉ chạy lúc flush, KHÔNG lúc tạo object → phải truyền `id=uuid.uuid4()` tường minh khi bulk insert
- Next.js 16 dùng **Tailwind v4** (`@theme` CSS directive, không có `tailwind.config.js`) và **Base UI** (không phải Radix UI). Base UI `Select.onValueChange` nhận `(value: string | null)` — phải handle null
- `RecipeCard` phải có `"use client"` vì có `onClick` event handler — không thể dùng trong Server Component
- `recipe.author` có thể null trong Cookpad data → luôn null-check trước khi render
- Token storage dùng **dual strategy**: httpOnly cookie (set qua `"use server"` action) cho middleware server-side check + localStorage cho axios client-side. Cả hai được sync đồng thời trong `saveTokens()`
- `ReadonlyRequestCookies` trong Next.js 16 (`next/headers`) vẫn có `.set()` và `.delete()` — gọi được trong server actions
- Sau login/register gọi `refreshUser()` (`globalMutate(USER_CACHE_KEY)`) để SWR invalidate cache → Navbar cập nhật avatar ngay, không cần reload
- Navbar ẩn auth buttons khi `isLoading === true` (SWR chưa resolve) để tránh hydration flash
- `{0 && <Component />}` trong React render ra số `0` (khác `false`) → luôn dùng `{value > 0 && ...}` hoặc `{!!value && ...}` thay vì `{value && ...}` khi value là number
- `recipes.servings` và `recipe_steps.timer_seconds` phải nullable — Cookpad data không có thông tin này; hardcode default gây misleading UI
- Khi đổi cột DB sang nullable, PHẢI update Pydantic schema tương ứng cùng lúc — nếu không, endpoint trả 500 và CORSMiddleware không gắn header lên 500 → frontend báo lỗi CORS gây hiểu nhầm gốc lỗi
- Upload ảnh: lưu local `backend/uploads/`, serve qua FastAPI `StaticFiles` tại `/static/uploads`; frontend gọi `NEXT_PUBLIC_API_URL + image_url` để hiển thị
- `RecipeCardWithStatus` extends `RecipeCard` thêm `status`, `reject_reason`, `created_at` — dùng chung cho /me/recipes và /admin/recipes
- `if status_filter:` trong Python falsy-check đúng cả `None` lẫn `""` → tab "Tất cả" gửi `status=""` vẫn trả về toàn bộ recipes không cần xử lý thêm
- `useSWR` cache key phải encode đủ params (status + page) để invalidate đúng khi tab/page thay đổi; dùng `mutate(key)` sau mỗi action approve/reject/delete
- Admin route `/admin/:path*` trong middleware kiểm tra `payload.role !== "admin"` → redirect `/` thay vì login (đã đăng nhập nhưng không đủ quyền)
- `/login` endpoint KHÔNG dùng `OAuth2PasswordRequestForm` — FastAPI OAuth2 form expect `application/x-www-form-urlencoded` + field `username`, frontend gửi JSON `{ email, password }` → 422; dùng `LoginRequest` JSON body thay thế
- `LoginRequest.email` dùng `str` không phải `EmailStr` — seed data dùng `admin@vnfood.local` (TLD `.local` reserved cho mDNS), Pydantic EmailStr từ chối → 422 khi admin login; `RegisterRequest` vẫn giữ `EmailStr` để validate email user mới
