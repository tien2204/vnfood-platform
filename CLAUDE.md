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
- [ ] docker-compose.yml + PostgreSQL
- [ ] FastAPI boilerplate + DB migrations
- [ ] Auth: register, login, JWT refresh
- [ ] Script import 22k recipes JSON → DB
- [ ] Recipe browse + search + filter APIs
- [ ] Next.js setup + Homepage + Recipe list + Recipe detail

### Week 2 — Core Features
- [ ] User đăng recipe + Admin duyệt
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

### Làm tiếp (session kế)
- Chạy `alembic upgrade head` để tạo bảng (cần Docker postgres đang chạy)
- `backend/app/core/security.py` — JWT encode/decode, hash password
- `backend/app/core/deps.py` — get_current_user, require_admin dependencies
- `backend/app/schemas/` — Pydantic schemas cho auth + user
- Auth endpoints: POST /api/v1/auth/register, /login, /refresh, /logout
- Khởi tạo Next.js frontend project

### Quyết định kỹ thuật đã chốt
- PostgreSQL Docker thay Supabase
- JWT tự handle (python-jose), không Supabase Auth
- Ảnh lưu local `backend/uploads/`
- AI model chạy trong FastAPI process (không tách HF Spaces)
- Recipe JSON: dùng file `*_extracted.json` (đã có ingredients_extract)
- Alembic migration viết thủ công (không dùng autogenerate) vì cần offline generation

### Quyết định kỹ thuật đã chốt
- PostgreSQL Docker thay Supabase
- JWT tự handle (python-jose), không Supabase Auth
- Ảnh lưu local `backend/uploads/`
- AI model chạy trong FastAPI process (không tách HF Spaces)
- Recipe JSON: dùng file `*_extracted.json` (đã có ingredients_extract)
