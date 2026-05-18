# CLAUDE.md — VNFood Platform (Localhost Dev)

> **Môi trường:** Localhost development  
> **Mục tiêu:** Chạy hoàn chỉnh trên máy local trước khi deploy lên cloud

---

## Tech Stack

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

## Khởi động nhanh

```bash
docker-compose up -d
cd backend && .venv\Scripts\activate && uvicorn app.main:app --reload --port 8000
cd frontend && npm run dev
```

---

## API Conventions

**Base URL:** `http://localhost:8000/api/v1`  
**Auth:** `Authorization: Bearer <access_token>`

```json
{ "success": true, "data": {}, "message": "string" }
{ "success": true, "data": [], "pagination": { "page": 1, "limit": 20, "total": 500 } }
{ "success": false, "error": { "code": "RECIPE_NOT_FOUND", "message": "..." } }
```

---

## Naming Conventions
- Python: `snake_case` vars/funcs, `PascalCase` classes
- TypeScript: `camelCase` vars/funcs, `PascalCase` components/types
- DB tables: `snake_case` · API endpoints: `kebab-case`

---

## Shell commands — ưu tiên dùng các lệnh này

Dùng các lệnh dưới đây thay vì default. Bỏ qua nếu không có sẵn.

### Tìm kiếm
- **Search code:** `rg` thay vì grep — bundled sẵn trong Claude Code
- **Find files:** `fd` thay vì find
- **File tree:** `tree -L 2 --gitignore` hoặc `fd -t d` khi cần — KHÔNG hardcode trong file này
- **Structural/AST search:** `ast-grep` (`sg`) cho refactor và pattern search TS/TSX

### Data & config
- **JSON:** `jq` cho mọi parsing, filtering, transformation trong pipeline
- **YAML/TOML:** `yq`
- **GitHub:** `gh` cho PRs, issues, CI status — không scrape github.com trực tiếp

### Code quality
- **Typecheck only:** `tsc --noEmit`
- **Dead code:** `knip`
- **Circular deps:** `madge --circular`
- **Duplication:** `jscpd`

### Tránh các pattern tốn token
- KHÔNG dùng `find -exec` hay `xargs` khi `fd -x` hoặc `rg -l` làm được
- KHÔNG đọc từng file để tìm pattern — dùng `rg 'pattern' src/` trước
- KHÔNG scan toàn bộ codebase để "nắm context" — hỏi nếu cần

---

## Context hygiene

### Khi bắt đầu session
1. Đọc `.claude/session-state.md` — không cần scan lại codebase
2. Chỉ đọc file liên quan trực tiếp đến task hiện tại

### Khi hoàn thành mỗi task/prompt
Tự động cập nhật `.claude/session-state.md` — không cần chờ tôi nhắc:
- Tick ✅ vào task vừa xong
- Ghi decisions kỹ thuật mới phát sinh (nếu có)
- Cập nhật "Làm tiếp" sang task kế

### Khi kết thúc session hoặc ~50% context window
1. Cập nhật `.claude/session-state.md` với state mới nhất
2. Ghi rõ: đang làm gì · đã xong gì · bước tiếp theo · file nào đang chỉnh

### Không làm
- Đọc file để "confirm" thứ đã biết
- Re-read file đã đọc trong cùng session
- List toàn bộ directory mà không có lý do

---

## Cấu trúc thư mục
Gọi `tree -L 3 --gitignore` nếu cần xem cấu trúc mới nhất — không đọc từ file này.

## Environment Variables
Xem `backend/.env.example` và `frontend/.env.local` — không hardcode ở đây.

## AI Classes & model weights
Xem `backend/app/ai/class_names.py` làm source of truth.

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
- [x] Comment, Rating, Save/Bookmark
- [X] Follow user + Social feed
- [X] User profile

### Week 3 — AI Features
- [X] AI inference (PyTorch model load + EfficientNet pipeline)
- [X] AI nhận diện ảnh → gợi ý recipe
- [X] Gợi ý recipe từ nguyên liệu
- [X] Meal plan + Grocery list

### Week 4 — Polish
- [ ] Cooking mode + Scale recipe
- [ ] Admin dashboard
- [ ] Testing + UI polish

---

## Trạng thái hiện tại _(cập nhật sau mỗi session)_

Xem `.claude/session-state.md` — chứa tiến độ, decisions, và task tiếp theo.
