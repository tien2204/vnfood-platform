# Session state — VNFood Platform
_Cập nhật file này trước khi kết thúc mỗi session._

---

## Trạng thái hiện tại
**Cập nhật lần cuối:** 2026-05-19 (Bug fixes + scripts đều xong)
**Branch:** `main`
**Task đang làm:** (toàn bộ feature + data pipeline ổn định — sẵn sàng demo/báo cáo)

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

- [x] **Prompt 14 — Meal Plan + Grocery List (UC-31 → UC-39, bỏ UC-38 AI suggest)**
- [x] `backend/app/schemas/meal_plan.py` — MealPlanCreate, MealPlanItemCreate, MealPlanItemUpdate, GroceryItemUpdate, GroceryItemCreate
- [x] `backend/app/services/meal_plan_service.py` — create/get/list/delete meal plan, add/update/delete item, generate/get/update grocery list, manual add/delete grocery item
- [x] `backend/app/api/v1/meal_plans.py` — 12 endpoints (meal plan CRUD + items CRUD + grocery CRUD); `grocery_router` cho PATCH/DELETE `/grocery-items/{id}`
- [x] `backend/app/api/v1/users.py` — thêm GET /users/me/meal-plans
- [x] `backend/app/main.py` — mount meal_plans_router + grocery_router
- [x] `frontend/lib/types.ts` — MealType, MealPlanRecipeSnippet, MealPlanSlotItem, MealPlanDays, MealPlanDetail, MealPlanSummary, GroceryFromRecipe, GroceryItem, GroceryList
- [x] `frontend/components/meal-plan/MealSlot.tsx` — empty/filled state, servings expand panel, delete
- [x] `frontend/components/meal-plan/WeeklyCalendar.tsx` — desktop 7×4 grid + mobile accordion, inline API calls
- [x] `frontend/components/meal-plan/AddRecipeModal.tsx` — multi-select flow: search luôn hiển thị, click chọn nhiều recipe (checkmark), mỗi recipe có ± servings riêng, checkbox "Thêm nguyên liệu vào grocery list" (gọi regenerate → cộng dồn ingredients trùng tên), add tất cả bằng Promise.all
- [x] `frontend/components/meal-plan/GroceryList.tsx` — checklist optimistic, expand from_recipes, manual add, delete, regenerate
- [x] `frontend/app/meal-plan/page.tsx` — list plans + create modal (Monday picker)
- [x] `frontend/app/meal-plan/[id]/page.tsx` — WeeklyCalendar + link to grocery
- [x] `frontend/app/meal-plan/[id]/grocery/page.tsx` — GroceryList component
- [x] `frontend/middleware.ts` — thêm /meal-plan + /meal-plan/:path* vào matcher
- [x] `frontend/components/layout/Navbar.tsx` — thêm "Meal Plan" → /meal-plan trong dropdown

- [x] **Prompt 16 — Admin Dashboard (UC-42..46)**
- [x] `backend/app/services/admin_service.py` — stats, charts, user management (ban/unban, role), comment moderation, ingredient merge/rename
- [x] `backend/app/api/v1/admin.py` — 12 new endpoints: stats, charts, users CRUD, comments, ingredients
- [x] `frontend/components/admin/AdminLayout.tsx` + `app/admin/layout.tsx` — sidebar navigation, mobile hamburger
- [x] `frontend/components/layout/ConditionalLayout.tsx` — ẩn Navbar/Footer cho /admin/* routes
- [x] `frontend/app/admin/page.tsx` — recharts: 2 line + 1 pie + 1 bar
- [x] `frontend/app/admin/users/page.tsx` + `/[id]/page.tsx` — user table + detail + ban/role actions
- [x] `frontend/app/admin/comments/page.tsx` — filter + hide/delete
- [x] `frontend/app/admin/ingredients/page.tsx` — merge modal + rename modal
- [x] **Bugfix — /admin/users 422**: `cacheKey` dùng template string → `is_active=` (empty string) gửi lên → FastAPI không parse được `Optional[bool]` → đổi sang `URLSearchParams`, chỉ set param khi có giá trị

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
- [x] Meal plan + Grocery list (Prompt 14)

### ✅ Week 4 — Polish (Hoàn thành)
- [x] Cooking mode + Scale recipe (Prompt 15)
- [x] Fix: Search page 404 + input text color (dark mode override)
- [x] Admin dashboard (Prompt 16)
- [x] UI Polish (Prompt 17): Mobile drawer, skeleton, EmptyState, 404/error pages, SEO, a11y, lazy load

---

- [x] **Feature branch `feat/recognize-recipe-author` — 2 features, 14 tasks, 14 commits, merged → main**

### Recognize page recipe section (Tasks 1-10)
- [x] Migration `0003_ai_generated_recipes.py` — bảng cache OpenAI fallback (id, dish_name_normalized UNIQUE, display_name, recipe_json JSONB, created_at, created_by_user_id)
- [x] Migration `0004_recipe_original_author.py` — thêm `recipes.original_author_name VARCHAR(200) NULL`
- [x] `backend/app/models/ai_generated_recipe.py` — ORM model AIGeneratedRecipe
- [x] `backend/scripts/generate_dish_recipes.py` — sinh `dish_recipes.json` qua OpenAI GPT-4o-mini, resumable, 103 món Vietnamese curated
- [x] `backend/app/ai/dish_recipes.json` — 103 entries (title, description, ingredients, steps, cooking_time_minutes, servings, difficulty)
- [x] `backend/app/services/dish_recipe_service.py` — load_dish_recipes() (startup), get_curated(slug), get_or_generate_ai(db, dish_name, user_id) với UNIQUE cache lookup
- [x] `backend/app/main.py` — lifespan call load_dish_recipes(), log "Loaded 103 curated dish recipes"
- [x] `backend/app/schemas/recipe.py` — thêm `DishRecipeOut`, thêm `original_author_name` vào `RecipeCardOut` + `RecipeDetailOut`
- [x] `backend/app/services/ai_service.py` — `recognize_image()` attach `dish_recipe` (curated nếu vnfood path, AI cache nếu openai path, null nếu unknown)
- [x] `backend/app/services/recipe_service.py` — `_build_recipe_card()` + RecipeDetailOut builder pass `original_author_name`
- [x] `frontend/lib/types.ts` — thêm `DishRecipe`, extend `AIRecognitionResult.dish_recipe: DishRecipe | null`, `RecipeCard.author: Author | null`, `RecipeCard.original_author_name`, `RecipeDetail.author: AuthorDetail | null`
- [x] `frontend/components/ai/DishRecipeCard.tsx` — NEW: two-column layout (ingredients sidebar `bg-[#F7F0E8]` + steps numbered circles `bg-[#E85D26]/10` Playfair), AI warning badge amber `#C97B16` chỉ khi `source === "ai-generated"`, meta chips (Clock/Users/ChefHat icons Lucide, no emoji)
- [x] `frontend/components/ai/RecognitionResult.tsx` — dish name wrap `<Link>` đến `/search?q=<name>` với hover orange, CTA button orange "Tìm công thức" + Search icon (dùng `buttonVariants` + Link vì Base UI Button không có `asChild`), render `<DishRecipeCard>` khi `!isUnknown && dish_recipe`

### RecipeCard + recipe detail page author display (Tasks 11-12)
- [x] `frontend/components/recipes/RecipeCard.tsx` — author line dưới title: shadcn Avatar 18px + tên, displayName = `author?.full_name ?? original_author_name ?? "Unknown"`, avatar fallback bg `#2D6A4F` green, **clickable bằng `<span role="link">` + `useRouter().push()` thay vì `<Link>`** (tránh nested anchor invalid HTML), `e.preventDefault() + e.stopPropagation()` chặn parent card Link
- [x] `frontend/app/recipes/[id]/page.tsx` — author card 3 nhánh: User (orange avatar + follower + "Xem hồ sơ"), Cookpad-scraped (green avatar `#2D6A4F` + name + "Tác giả Cookpad" + "Xem trên Cookpad"), Cookpad-no-author (**green `?` avatar + "Unknown" + "Tác giả Cookpad"** — placeholder visible trước khi enrichment chạy)

### Cookpad author enrichment (Task 13)
- [x] `backend/scripts/enrich_cookpad_authors.py` — Playwright Chromium headless, SLEEP_SEC=2, PAGE_TIMEOUT=10000, BATCH_COMMIT=50, Chrome 124 UA (không AI-bot UA), warm-up cookpad.com/vn cookies, 3 parse strategies (JSON-LD → `a[href*="/vn/users/"]` → `meta[itemprop=author]`), 4 status (ok/empty/skip/error), atomic UPDATE per row (error giữ NULL retry, ok/empty/skip UPDATE), resumable qua filter `IS NULL`
- [x] **Đã chạy full**: 21,791 / 22,273 Cookpad recipes có tên author (97.8%), 214 unavailable, 268 vẫn pending (sẽ retry sau)

### Bugfix sau test browser
- [x] Nested `<a>` hydration error: RecipeCard inner Link → span+router.push
- [x] Recipe detail Branch 3 "Cookpad / Công thức tổng hợp" → "Unknown / Tác giả Cookpad" với green `?` avatar

### Polish session 2026-05-19
- [x] **Font fix — Vietnamese rendering bug** (mề\`m, ô´c hiển thị backtick lạ)
  - Root: `globals.css` khai báo `--font-heading: "Playfair Display", ...` nhưng KHÔNG load font → fallback xuống Georgia/Times → thiếu glyph Vietnamese precomposed (`ề ố ằ ự ỡ`) → Chrome decompose + render combining mark thành SPACING char
  - Fix `frontend/app/layout.tsx`: load `Playfair_Display` + `Be_Vietnam_Pro` qua `next/font/google` với subset `["latin", "latin-ext", "vietnamese"]`, apply via `<html className>`
  - Đổi Karla → Be Vietnam Pro vì next typing không cho Karla có vietnamese subset
- [x] **Image fallback khi URL lỗi** — `frontend/components/common/RecipeImage.tsx` NEW: wrapper next/image với `useState(errored)` + `onError` handler, render `fallback` prop nếu `src==null || errored`. Áp dụng 4 chỗ: RecipeCard, recipe detail hero, MenuListItem (homepage), SuggestedRecipeCard (RecipeCarousel). Bỏ emoji 🍽️ ở 2 chỗ, dùng SVG utensil đồng nhất.
- [x] **Bug 404 link `/keyword/<slug>`** — route không tồn tại. Fix: redirect sang `/recipes?keyword=<vietnamese>` (browse page filter đã có sẵn). Update [page.tsx:32](frontend/app/page.tsx) KEYWORD_GROUPS + [Footer.tsx:5-14](frontend/components/layout/Footer.tsx) KEYWORD_LINKS.
- [x] **Watermark Cookpad og-image fix** (`backend/scripts/fix_cookpad_images.py`)
  - Phát hiện: 2,274/22,273 recipes (10%) có URL ảnh `og-image.cookpad.com/global/vn/recipe/<id>` — đây là social card có watermark + tên author overlay
  - Clean URL nằm ở `img-global.cpcdn.com/recipes/<hash>/...` — hash không tính được từ recipe id → phải scrape
  - Script Playwright giống enrich pattern, parse JSON-LD `Recipe.image` field (clean URL), fallback DOM `<img>` với host `img-global.cpcdn.com`
  - **Pending chạy full** (~76 phút cho 2,274 rows): `python -m scripts.fix_cookpad_images`
- [x] **`backend/scripts/seed_cookpad_users.py`** — biến scraped author thành User account
  - Distinct `original_author_name` (cookpad + author_id IS NULL) → tạo User row
  - Username: CamelCase no-dấu (`HoangThiToHa`), email `<username>@cookpad.com`, collision suffix `_2, _3...`
  - Password chung `cookpad123` (bcrypt hash, login được cho demo)
  - `full_name` giữ tên có dấu gốc, `bio = "Tác giả Cookpad — tài khoản tự sinh"`, role=user, is_active=true
  - UPDATE `recipes.author_id` cho tất cả recipes match name (atomic)
  - Idempotent qua filter `author_id IS NULL`
  - **Pending chạy** sau khi enrichment xong: `python -m scripts.seed_cookpad_users`
- [x] **Per-class Precision/Recall/F1 metrics** — UI option (collapsed by default)
  - `backend/scripts/evaluate_model.py` — load test set `test/<slug>/*.jpg`, predict end-to-end cascade (group + sub), `sklearn.precision_recall_fscore_support` per class, output `backend/app/ai/model_metrics.json`
  - Eval xong trên 7,384 ảnh / 103 class: **Accuracy 81.9%, Macro F1 0.851 (P=0.958, R=0.776), Weighted F1 0.877, fallback rate 14.1%**
  - `backend/app/services/metrics_service.py` — load JSON lúc startup, `get_class_metrics(slug)` lookup O(1)
  - `backend/app/services/ai_service.py` — attach `class_metrics` vào response chỉ khi `model_used == "vnfood"` (OpenAI fallback / unknown → null)
  - `backend/app/schemas/recipe.py` thêm `ClassMetricsOut(precision, recall, f1, support)`
  - `frontend/components/ai/ModelMetrics.tsx` — collapsible block: chevron toggle "Xem hiệu năng mô hình", expand ra 3 card với (?) tooltip giải thích từng metric, 1 dòng disclaimer phân biệt "test-set evaluation" vs "per-image confidence"
  - Đổi label `RecognitionResult` ConfidenceBar: "Độ chính xác" → "**Độ tin cậy cho ảnh này**" để rõ confidence khác với accuracy/P/R/F1

## Làm tiếp (session kế bắt đầu từ đây)
**Pending scripts (chạy khi rảnh, song song được):**
1. `python -m scripts.fix_cookpad_images` — clean 2,274 watermark URLs (~76 phút @ sleep=2s)
2. `python -m scripts.seed_cookpad_users` — biến 21,791 scraped name thành User accounts (~5 phút, không network)
3. Restart uvicorn để load `model_metrics.json` (log "Loaded model metrics for 103 classes")

**Polish optional cho UI liên mạch hơn (đề xuất cô giáo):**
- Top3 predictions clickable → search
- DishRecipeCard thêm subtitle nhắc "đây là công thức tham khảo, xem biến tấu cộng đồng bên dưới"
- Recipe detail thêm section "Công thức tương tự" (gợi ý theo keyword)

### Bug fixes session 2026-05-19 (sau khi enrichment + seed + image-fix scripts xong)
**Status data pipeline cuối:**
- Cookpad authors: 21,791 / 22,273 (97.8%) đã scrape được tên
- Synthetic users: **4,192 User accounts** từ distinct Cookpad authors
- Linked recipes: **22,058 / 22,058** Cookpad recipes đã có `author_id` (still_unlinked = 0)
- Image URLs: **0 watermarked** og-image / 22,021 clean img-global / 19 null (recipes Cookpad không có ảnh món, hiện placeholder)

**Bug fixes:**
- [x] **`fix_cookpad_images.py` resumability** — bug: status `skip`/`empty` không update DB → filter `LIKE 'og-image%'` re-fetch infinite loop, script "dừng" sau Ctrl+C re-run. Fix: cả `skip` và `empty` đều SET `image_url = NULL` → filter loại trừ row → truly idempotent. UI fallback placeholder qua RecipeImage component.
- [x] **`fix_cookpad_images.py` path filter** — bug: script grab nhầm avatar tác giả (`img-global.cpcdn.com/users/<id>/avatar.jpg`) khi recipe gốc không có ảnh món, vì cả 2 endpoint cùng host. Fix: `_is_recipe_image_url()` yêu cầu cả `CLEAN_HOST` + `/recipes/` path. SQL cleanup 19 rows đã set nhầm bằng `UPDATE image_url=NULL WHERE image_url LIKE '%/users/%' OR LIKE '%/avatars/%'`.
- [x] **Recipe detail Branch 1 thêm "Xem trên Cookpad"** — sau khi seed link `author_id`, Cookpad recipe rơi vào Branch 1 (User card) → mất nút Cookpad gốc. Fix: thêm nút secondary outline `#7C6A56` "Xem trên Cookpad" cạnh "Xem hồ sơ" khi `source === "cookpad" && cookpad_url`. Profile (orange filled, primary) + Cookpad (brown outline, secondary).
- [x] **Pagination "Sau" reset về page 1** — bug nghiêm trọng: click "Sau" → URL `?page=2` lóe lên → ngay reset về `?page=1`. Backend log xác nhận 2 requests liên tiếp page=2 → page=1 cùng filters. Root cause: `SearchBar.tsx` `useEffect(..., [debounced, autoNavigate, router, onSearch])` có `onSearch` trong deps. Parent re-render → inline arrow `onSearch={(q) => updateParam("search", q)}` ref mới → effect fire lại → `onSearch("")` → `updateParam("search", "")` → `if (key !== "page") params.set("page", "1")` reset page.
  - Fix `SearchBar.tsx`: `onSearchRef = useRef(onSearch)` để gọi latest qua ref, bỏ khỏi deps. `lastFiredRef = useRef<string>(initialValue)` track value, chỉ fire khi value đổi không phải reference. Initial run = no-op.
- [x] **Pagination scroll-to-top** — user yêu cầu scroll lên đầu khi chuyển trang. Bỏ `scroll: false` khỏi `router.push` → Next.js default.

**Sau cùng:** viết báo cáo thesis · deploy

---

## Files đang chỉnh sửa
_(Không có)_

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

### Recognize recipe + author (branch `feat/recognize-recipe-author`)
- 103 món curated lưu `dish_recipes.json` static, load 1 lần lúc startup (memory dict) — không qua DB; key = slug khớp `CLASS_DISPLAY_NAMES` (`banh-beo`, `pho`, etc.)
- AI fallback recipes cache trong bảng `ai_generated_recipes` (UNIQUE `dish_name_normalized` = `.lower().strip()`) — risk minor: 2 request đồng thời cùng 1 OOD dish → IntegrityError; chấp nhận cho thesis demo single-user
- RecipeCard inner clickable **không được dùng `<Link>`** vì parent đã wrap toàn card trong `<Link>` → nested `<a>` invalid HTML hydration error → phải dùng `<span role="link" tabIndex={0}>` + `useRouter().push()` + `e.preventDefault() + e.stopPropagation()`
- `recipe.author` (User) cho user-uploaded, `recipe.original_author_name` (string) cho Cookpad scraped — frontend prioritize User → scraped → "Unknown" fallback
- Cookpad robots.txt cho phép `User-agent: *` truy cập recipe pages (Disallow chỉ apply `/reactions`, `/print`, `/similar_recipes`, …). Cấm AI bot UA (GPTBot, Claude-Web) — dùng Chrome 124 UA là OK
- httpx async raw → Cookpad chặn 403; bắt buộc Playwright Chromium headless với vi-VN locale + warm-up homepage cookies
- Cookpad JSON extracted (`cookpad_recipe/*.json`) **KHÔNG có** field author — phải re-scrape từng URL để lấy
- Enrichment script resumable qua filter `WHERE original_author_name IS NULL`: stop bằng Ctrl+C → 0 rows mất; mất tối đa BATCH_COMMIT-1 rows uncommitted vẫn NULL → retry sau bình thường
- 3 status update DB: ok (tên thật), empty/skip ('' empty string ≠ NULL để không retry), error (giữ NULL retry sau)
- Real-world rate: ~3.7-4.8 req/s với sleep=2s. 22k recipes ~6h thực tế (không phải 37h ước lượng — log + page load nhanh hơn dự kiến)

### Font + Image fallback (2026-05-19)
- Next.js 16 `next/font/google` **KHÔNG hỗ trợ vietnamese subset cho Karla** (typing chỉ `'latin' | 'latin-ext'`). Dùng **Be Vietnam Pro** (typed `vietnamese` subset, thiết kế riêng cho Vietnamese)
- Playfair Display **CÓ** vietnamese subset trong next/font typing — OK dùng
- Bug "ký tự backtick lạc" (`mề\`m`, `ô´c`): root cause là CHỮ KHÔNG LOAD FONT THẬT, fallback Georgia/Times thiếu glyph precomposed Vietnamese (U+1EBx range) → Chrome render combining mark thành SPACING char. Fix bằng cách thật sự load font với subset vietnamese.
- `next/image` không có `onError` fallback tự động → phải wrap component có state `errored`. `<RecipeImage>` component giải quyết 2 trường hợp: src null + URL broken
- Cookpad có 2 endpoint ảnh: `og-image.cookpad.com/global/vn/recipe/<id>` (social card có watermark) vs `img-global.cpcdn.com/recipes/<hash>/...` (clean). Crawler cũ dùng `meta[property="og:image"]` → grab social card → 2,274 recipes bị watermark.

### Model evaluation (2026-05-19)
- `evaluate_model.py` chạy END-TO-END cascade (group → sub) trên test set, không tách 2 model riêng. Mỗi lỗi của bất kỳ tầng nào đều đếm vào P/R/F1 cuối.
- `needs_fallback=True` (confidence < threshold) → đếm như predicted = `__unknown__` → FN cho true class, không gán FP cho class nào. Penalize honestly không skip.
- 2 model: EfficientNet-B0 (group, 224×224) + EfficientNet-B2 (sub, 260×260). Resize trực tiếp không CenterCrop.
- Per-class P/R/F1 là **đặc tính của model trên test set, không phải của ảnh user upload** → chỉ tính 1 lần offline, lookup O(1) lúc inference. Lưu `backend/app/ai/model_metrics.json`, commit vào git.
- UI hiện confidence (per-image, dynamic) và class_metrics (per-class, static) là 2 chỉ số khác nhau — phải tách label rõ tránh user nhầm.
- ModelMetrics block default collapsed (cô user bảo metric không hữu ích cho casual user). User click chevron mới expand.
- `class_metrics = null` khi `model_used == "openai"` (fallback) hoặc `predicted_class == "unknown"` — không có test-set evaluation cho 2 trường hợp này.

### Synthetic Cookpad users
- 22k Cookpad recipes (no author originally) → enrichment script lấy tên → seed_cookpad_users biến distinct names thành User accounts.
- Password chung `cookpad123` cho mọi synthetic account (chấp nhận cho thesis demo, KHÔNG production-safe). Bypass register endpoint min-length validation bằng cách INSERT trực tiếp với `hash_password()`.
- Username pattern: `unicodedata.normalize('NFKD')` để strip diacritics, manual replace `đ/Đ → d/D` (NFKD không decompose 2 ký tự này), `re.findall(r'[A-Za-z0-9]+')`, capitalize từng chunk, concat. Email = lowercase username + `@cookpad.com`. Collision suffix `_2, _3...`.
- Recipes với cùng `original_author_name` → cùng 1 User mới (single dedup, không phân biệt được homonyms — limitation chấp nhận được)
- Sau seed: `recipes.author_id` được set, frontend tự động chuyển từ Branch 2 (scraped name only) sang Branch 1 (User link) trên detail page. Branch 2 thành dead code trong practice nhưng giữ làm safety fallback.
- Branch 1 phải giữ thêm nút "Xem trên Cookpad" khi `source === "cookpad"` vì sau seed link author_id, recipe Cookpad cũng vào Branch 1 → nếu chỉ có "Xem hồ sơ" thì mất đường link nguồn gốc.

### Image scraping Cookpad — 2 host phân biệt qua path
- Cookpad có 2 endpoint ảnh CÙNG host `img-global.cpcdn.com` nhưng khác path:
  - Recipe photo: `img-global.cpcdn.com/recipes/<hash>/<size>/photo.jpg`
  - User avatar: `img-global.cpcdn.com/users/<id>/<size>/avatar.jpg`
- Filter chỉ check host → bug: grab avatar khi recipe gốc không có ảnh món (chỉ có avatar tác giả trên page)
- Phải check cả `CLEAN_HOST in url` AND `/recipes/ in url`
- Khi parse fail (page có nhưng không tìm thấy `/recipes/` URL) → script SET `image_url = NULL` để (a) tránh re-fetch loop ở rerun (b) UI fallback placeholder

### React useEffect deps + inline callback bug
- Pattern bug: `<Child onCallback={(q) => updateParam(...)}>` — arrow function inline → reference mới mỗi parent render
- Trong `Child.useEffect(..., [value, onCallback])` — `onCallback` trong deps → parent re-render → effect re-fire dù `value` không đổi → side effect không mong muốn (vd: gọi `onCallback("")` reset URL)
- Fix pattern: capture callback trong `useRef`, gọi qua `ref.current?.()`, bỏ khỏi deps
- Optional: `useRef<typeof value>(initialValue)` track last-fired value, skip nếu value chưa đổi (tránh fire spurious on mount/re-render)
- Đặc biệt nguy hiểm khi callback đụng tới shared state (router/URL) — có thể tạo race conditions hoặc reset state đang đổi

---

## Blockers / cần clarify
_(Không có)_
