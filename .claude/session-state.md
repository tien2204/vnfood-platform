# Session state — VNFood Platform
_Cập nhật file này trước khi kết thúc mỗi session._

---

## Trạng thái hiện tại
**Cập nhật lần cuối:** 2026-05-10  
**Branch:** `main`  
**Task đang làm:** Week 3 — AI Features (Prompt 13 xong — Gợi ý recipe từ nguyên liệu)

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

- [x] **Prompt 8 — Comment + Rating (UC-20, UC-21)**
- [x] `backend/app/schemas/social.py` — CommentCreate, CommentUpdate, CommentOut (with is_mine), CommentUserOut, RatingCreate, RatingOut
- [x] `backend/app/services/social_service.py` — list_comments (pagination, filter is_hidden), create/update/delete_comment (auth: owner only/owner+admin), upsert_rating (UNIQUE constraint), get_my_rating, delete_rating (auto recompute avg_rating + rating_count trên Recipe)
- [x] `backend/app/api/v1/comments.py` — 4 endpoints: GET /recipes/{id}/comments, POST, PUT /comments/{id}, DELETE /comments/{id}
- [x] `backend/app/api/v1/ratings.py` — 3 endpoints: POST /recipes/{id}/rate, GET /recipes/{id}/my-rating, DELETE /recipes/{id}/rate
- [x] `backend/app/main.py` — mount comments_router + ratings_router tại /api/v1
- [x] `frontend/lib/types.ts` — thêm Comment, CommentUser, RatingOut
- [x] `frontend/components/recipes/StarRating.tsx` — 5 sao, hover preview, readonly mode (half-star), interactive (onChange), size prop
- [x] `frontend/components/recipes/RatingSection.tsx` — hiển thị avg+count (readonly), interactive stars cho logged-in, optimistic update, toast, redirect guest to login
- [x] `frontend/components/recipes/CommentSection.tsx` — paginated "Load more", form gửi comment (logged-in only), mỗi comment: avatar+name+relative_time+content, inline edit (nếu is_mine), delete confirm (is_mine or admin), menu actions
- [x] `frontend/app/recipes/[id]/page.tsx` — decode JWT server-side (cookies), fetch recipe với auth (no-store) hoặc cached (revalidate 60), render RatingSection + CommentSection, pass isAdmin prop

- [x] **Prompt 9 — Save/Bookmark recipes (UC-22)**
- [x] `backend/app/schemas/social.py` — thêm SaveResponse (is_saved, save_count), SavedRecipeOut (id, title, image_url, avg_rating, rating_count, cooking_time, servings, difficulty, source, author, save_count, is_saved, saved_at)
- [x] `backend/app/services/social_service.py` — thêm save_recipe, unsave_recipe, list_saved_recipes; fix SQLAlchemy synchronize_session bug: capture `new_count` BEFORE UPDATE statement
- [x] `backend/app/api/v1/saved.py` — NEW FILE: POST /recipes/{id}/save, DELETE /recipes/{id}/save, GET /me/saved-recipes (với pagination)
- [x] `backend/app/main.py` — mount saved_router tại /api/v1
- [x] `backend/app/services/recipe_service.py` — update get_featured_recipes nhận `current_user: Optional[User]`; gọi `_get_saved_ids` để tính `is_saved` cho tất cả featured recipes trong một query
- [x] `backend/app/api/v1/recipes.py` — update GET /featured inject `current_user` qua `get_optional_current_user`
- [x] `frontend/lib/types.ts` — thêm SaveResponse, SavedRecipeOut
- [x] `frontend/components/recipes/SaveButton.tsx` — NEW FILE: Heart icon, variant "card" (overlay nhỏ) + "action" (border button to), optimistic toggle, useRef lock chống double-click, router.refresh() để invalidate server cache, onChange callback
- [x] `frontend/components/recipes/RecipeCard.tsx` — thay Bookmark bằng SaveButton, thêm onSaveChange prop
- [x] `frontend/components/recipes/RecipeGrid.tsx` — forward onSaveChange(recipeId, isSaved, saveCount) xuống RecipeCard
- [x] `frontend/app/recipes/[id]/page.tsx` — thay Bookmark buttons (desktop + mobile) bằng SaveButton variant="action"
- [x] `frontend/app/me/saved/page.tsx` — NEW FILE: danh sách công thức đã lưu, SWR + optimistic removal khi unsave (mutate filter + revalidate: false), pagination
- [x] `frontend/app/page.tsx` — read access_token từ httpOnly cookie, fetch featured với auth + cache: "no-store" cho logged-in user (fix stale save_count trên homepage)
- [x] `frontend/components/layout/Navbar.tsx` — thêm link "Đã lưu" → /me/saved với Bookmark icon trong dropdown avatar

- [x] **Bugfix — Save count +2 thay vì +1**
- [x] SQLAlchemy `synchronize_session='auto'` silently cập nhật in-memory `recipe.save_count` sau `UPDATE ... SET save_count = save_count + 1` → `recipe.save_count` đã là giá trị mới → return `recipe.save_count + 1` cho kết quả +2; fix: capture `new_count = recipe.save_count + 1` TRƯỚC khi gọi `db.execute(update(...))`

- [x] **Bugfix — Homepage stale save_count (cache 5 phút) + /me/saved chậm biến mất**
- [x] Homepage: đọc token từ cookie, fetch với Bearer + cache: "no-store" cho logged-in; anonymous vẫn dùng revalidate: 60
- [x] /me/saved: SaveButton.onChange → RecipeGrid.onSaveChange → page.handleSaveChange → SWR mutate filter (revalidate: false) → instant optimistic removal

- [x] **Prompt 10 — Follow + Public profile + Social feed (UC-23, 24, 25, 26)**
- [x] `backend/app/schemas/user.py` — UserStats, UserMiniOut, UserProfileOut, UserUpdate, FollowResponse, FollowerOut, FeedItem
- [x] `backend/app/services/user_service.py` — get_user_profile, update_profile
- [x] `backend/app/services/social_service.py` — follow_user, unfollow_user, list_followers, list_following, get_feed
- [x] `backend/app/api/v1/users.py` — profile + follow + followers/following endpoints + PUT /me/profile
- [x] `backend/app/api/v1/feed.py` — GET /feed (auth, is_discover_mode)
- [x] `frontend/lib/types.ts` — UserStats, UserMini, UserProfile, FollowerOut, FollowResponse, FeedItem, FeedResponse
- [x] `frontend/components/users/FollowButton.tsx` — optimistic, 401 → redirect login
- [x] `frontend/components/users/UserCard.tsx` + `UserStatsBar.tsx`
- [x] `frontend/app/users/[id]/page.tsx` + `UserProfileClient.tsx` — public profile, tabs lazy
- [x] `frontend/app/me/profile/page.tsx` — edit profile + avatar upload
- [x] `frontend/app/feed/page.tsx` — useSWRInfinite, FeedCard, discover mode
- [x] Navbar dropdown updated, MobileBottomNav updated, RecipeCard author link, recipe detail author link

- [x] **Prompt 12 — AI Recognize endpoint + /recognize page**
- [x] `backend/app/services/ai_service.py` — recognize_image() pipeline: VNFood → OpenAI fallback → DB query → AILog; fetch_image_from_url(); _find_suggested_recipes() (title ilike + keyword fallback); _openai_recognize() dùng AsyncOpenAI
- [x] `backend/app/api/v1/ai.py` — thêm POST /recognize (multipart), POST /recognize-url (JSON url), GET /me/recognition-history (auth required)
- [x] `frontend/lib/types.ts` — thêm SuggestedRecipe, AITopPrediction, AIRecognitionResult
- [x] `frontend/components/ai/ImageDropzone.tsx` — drag & drop, validate type + 10MB, preview, warm style
- [x] `frontend/components/ai/RecognitionResult.tsx` — 2-col desktop: ảnh trái, kết quả phải; confidence bar gradient; ModelBadge; top3 list
- [x] `frontend/components/ai/RecipeCarousel.tsx` — horizontal scroll, SuggestedRecipeCard với rating + cooking_time
- [x] `frontend/app/recognize/page.tsx` — public route, idle/loading/done/error states, "Thử ảnh khác" reset
- [x] `frontend/components/layout/Navbar.tsx` — link /ai/scan → /recognize

- [x] **Bugfix — OpenAI SDK httpx proxies conflict**
- [x] `openai==1.30.1` truyền `proxies=` vào `httpx.AsyncClient` nhưng `httpx>=0.28` đã bỏ param này → `TypeError`
- [x] `backend/requirements.txt` — nâng `openai>=1.52.0`, `httpx>=0.27.0,<1`; chạy `pip install "openai>=1.52.0" --upgrade` để fix

- [x] **Prompt 13 — Gợi ý recipe từ nguyên liệu (UC-30)**
- [x] `backend/app/services/ingredient_service.py` — get_popular_ingredients, search_ingredients, suggest_recipes_by_ingredients (any/all/most mode, PostgreSQL array_agg, match_score)
- [x] `backend/app/services/ingredient_ai_service.py` — ai_suggest_recipes() OpenAI GPT-4o-mini fallback, returns 5 gợi ý khi DB < 3 kết quả
- [x] `backend/app/api/v1/ingredients.py` — GET /ingredients/popular, GET /ingredients/search, POST /ingredients/suggest-recipes
- [x] `backend/app/main.py` — mount ingredients_router tại /api/v1/ingredients
- [x] `frontend/lib/types.ts` — thêm IngredientItem, RecipeMatchResult, AISuggestion, IngredientSuggestResult
- [x] `frontend/components/ingredients/IngredientChip.tsx` — toggle chip với check icon + usage count
- [x] `frontend/components/ingredients/IngredientSearch.tsx` — autocomplete debounce 300ms, dropdown suggestions
- [x] `frontend/components/ingredients/SelectedIngredients.tsx` — chips đã chọn với X button, warning > 10
- [x] `frontend/components/ingredients/MatchModeSelector.tsx` — radio group 3 mode (any/most/all)
- [x] `frontend/components/ingredients/RecipeMatchCard.tsx` — RecipeCard + badge Khớp X/Y, matched/missing ingredients
- [x] `frontend/components/ingredients/AISuggestionCard.tsx` — AI suggestion với key/additional ingredients, CTA tìm tương tự
- [x] `frontend/app/suggest/page.tsx` — public route /suggest, hero + chips + search + mode selector + results grid + mobile sticky bar

- [x] **Bugfix — OpenAI fallback trả về "Unknown" thay vì tên món**
- [x] Prompt cũ chỉ bảo "set confidence below 0.3" → OpenAI tự đặt dish_name = "Unknown"
- [x] `backend/app/services/ai_service.py` — cập nhật prompt: bắt buộc trả tên thật của món (kể cả non-VN food), không được reply "Unknown"
- [x] `frontend/components/ai/RecognitionResult.tsx` — thêm `result.display_name.toLowerCase() === "unknown"` vào `isUnknown` check làm safety fallback

- [x] **Prompt 11 — AI Foundation (VNFoodPredictor)**
- [x] `backend/app/ai/class_names.py` — GROUP_CLASSES (OrderedDict 8 groups), GROUP_TO_WEIGHT (best_* filenames), GROUP_MODEL_FILE, CLASS_DISPLAY_NAMES (slug → tên tiếng Việt), get_keyword_from_class()
- [x] `backend/app/ai/inference.py` — VNFoodPredictor: load EfficientNet-B0 (group) + 8×EfficientNet-B2 (sub-class); transforms khớp training (Resize trực tiếp, không CenterCrop); classifier = Sequential(Dropout(0.3), Linear); class ordering = sorted() khớp training; predict() trả group + top5 + needs_fallback
- [x] `backend/app/ai/state.py` — global predictor state (set_predictor / get_predictor / get_predictor_optional), tách khỏi main.py tránh circular import
- [x] `backend/app/api/v1/ai.py` — GET /api/v1/ai/health (loaded status, device, groups)
- [x] `backend/app/main.py` — lifespan event load models khi startup; mount ai_router; logging.basicConfig(INFO)
- [x] `backend/requirements.txt` — thêm `starlette==0.37.2` pin (FastAPI 0.111.0 cần, tránh NumPy 2.x break)
- [x] `backend/scripts/test_predict.py` — CLI smoke-test: load models + predict 1 ảnh, in group/class/confidence/top5
- [x] **Verify**: GET /api/v1/ai/health → `{"loaded":true,"device":"cpu","groups":["BANH","BUN_PHO","COM","MON_KHO_NUONG","CANH_CHAO","XOI","GOI_CUON","DAC_BIET"]}`

---

## Tiến độ theo tuần

### ✅ Week 1 — Foundation (Hoàn thành)
Docker · FastAPI · DB migrations · Auth · Import 22k recipes · Recipe APIs · Next.js · Homepage · Recipe list/detail

### ✅ Week 2 — Core Features (Hoàn thành)
User đăng recipe · Admin duyệt · Comment · Rating · Save/Bookmark · Follow · Public profile · Social feed

### 🔄 Week 3 — AI Features (Đang làm — Prompt 12 xong)
- [x] AI foundation: VNFoodPredictor load models + predict() test được
- [x] Prompt 12: POST /api/v1/ai/recognize + OpenAI fallback + /recognize page
- [x] Gợi ý recipe từ nguyên liệu (Prompt 13)
- [ ] Meal plan + Grocery list

### ⏳ Week 4 — Polish (Chưa bắt đầu)
- [ ] Cooking mode + Scale recipe
- [ ] Admin dashboard
- [ ] Testing + UI polish

---

## Làm tiếp (session kế bắt đầu từ đây)
**Prompt 14 — Meal plan + Grocery list**
- Lên kế hoạch bữa ăn theo tuần, tổng hợp grocery list từ các recipe

---

## Files đang chỉnh sửa
_(Không có — Prompt 11 hoàn chỉnh)_

---

## Quyết định kỹ thuật đã chốt

### Infrastructure
- PostgreSQL Docker thay Supabase
- JWT tự handle (`python-jose`), không Supabase Auth
- Ảnh lưu local `backend/uploads/`, serve qua FastAPI StaticFiles `/static/uploads`
- AI model chạy trong FastAPI process (không tách HF Spaces)
- Alembic migration viết thủ công (không autogenerate) — cần offline generation
- `bcrypt` pin ở `4.0.1` — passlib 1.7.4 không tương thích với bcrypt 4.1+

### Backend
- `/login` dùng `LoginRequest` JSON body, KHÔNG `OAuth2PasswordRequestForm` (OAuth2 form expect `username` field + urlencoded)
- `LoginRequest.email` dùng `str`, KHÔNG `EmailStr` — `admin@vnfood.local` (TLD `.local`) bị Pydantic từ chối
- SQLAlchemy `default=uuid.uuid4` chỉ chạy lúc flush → phải truyền `id=uuid.uuid4()` tường minh khi bulk insert
- SQLAlchemy `synchronize_session='auto'` sau UPDATE silently thay đổi in-memory object → capture computed values BEFORE gọi `db.execute(update(...))`
- `recipes.servings` và `recipe_steps.timer_seconds` nullable — Cookpad data không có thông tin này
- Khi đổi cột DB sang nullable: PHẢI update Pydantic schema cùng lúc — nếu không, endpoint trả 500 và CORS không gắn header lên 500 → frontend báo CORS gây hiểu nhầm

### Frontend
- Next.js 16 dùng **Tailwind v4** (`@theme` CSS directive, không `tailwind.config.js`) và **Base UI** (không phải Radix UI)
- Token storage: **dual strategy** — httpOnly cookie (set qua `"use server"` action) cho middleware + localStorage cho axios client-side
- `{0 && <Component />}` render ra số `0` → luôn dùng `{value > 0 && ...}` hoặc `{!!value && ...}` khi value là number
- `RecipeCard` cần `"use client"` vì có `onClick` — không dùng được trong Server Component
- `recipe.author` có thể null trong Cookpad data → luôn null-check
- Sau login/register gọi `refreshUser()` để SWR invalidate → Navbar cập nhật ngay
- Navbar ẩn auth buttons khi `isLoading === true` để tránh hydration flash

### Comment + Rating
- Rating: UNIQUE(recipe_id, user_id) + CHECK(score 1-5) — upsert
- Comment: soft delete `is_hidden=true`, không hard delete — giữ thread integrity
- Admin xóa được comment người khác; user chỉ edit/delete comment của mình
- Server-side JWT decode (next/headers cookies) để fetch recipe với auth token

### Save/Bookmark
- `SaveButton` dùng `useRef` (không `useState`) cho in-flight lock — sync, không trigger re-render
- `router.refresh()` invalidate Server Component cache route hiện tại — đủ cho `/recipes/[id]`, không đủ cross-route
- Homepage cần `cache: "no-store"` + Bearer token khi logged-in để phản ánh `is_saved` mới nhất
- SWR optimistic removal: `mutate(filterFn, { revalidate: false })`

### Follow + Profile + Feed
- `follow_user` idempotent: đã follow → không lỗi
- `get_user_profile` trả `is_following: null` cho guest, `true/false` cho logged-in
- Feed discover mode khi `following_ids` rỗng → fallback sort by save_count DESC

### AI Foundation (Prompt 11)
- Checkpoint format `best_*`: `{'model_state': ..., 'val_acc': float}` — không có metadata
- Sub-class ordering = `sorted(GROUP_CLASSES[group])` — khớp training (line 531 training script)
- Val transform = `Resize((H, H))` trực tiếp, KHÔNG CenterCrop — khớp training val_tf
- Classifier = `nn.Sequential(Dropout(0.3), Linear(...))` — thay toàn bộ `model.classifier`, không chỉ `[1]`
- `torch.load(..., weights_only=False)` — checkpoint có string/list metadata, `weights_only=True` sẽ fail
- `starlette==0.37.2` pin bắt buộc — FastAPI 0.111.0 không tương thích Starlette ≥0.41
- Predictor state tách vào `ai/state.py` để tránh circular import khi ai router cần get_predictor

### AI Service / OpenAI Fallback
- `openai==1.30.1` + `httpx>=0.28` không tương thích (proxies kwarg removed) → phải dùng `openai>=1.52.0`
- OpenAI prompt phải nói rõ "always provide real dish name, never reply Unknown" — không chỉ bảo "set confidence < 0.3"
- OpenAI Vision cho ảnh non-Vietnamese food: trả tên tiếng Anh (e.g. "Beef Wellington") với confidence ~0.1 — đây là behavior đúng
- Frontend `isUnknown` check cần cover cả string literal "Unknown" (tiếng Anh) ngoài các string tiếng Việt

---

## Blockers / cần clarify
_(Không có)_
