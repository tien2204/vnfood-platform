# Tổng quan Backend — VNFood Platform (FastAPI)

> Mục tiêu file: đọc xong nắm được **kiến trúc phân tầng**, **từng file có hàm gì / tham số gì / làm gì**, và **luồng dữ liệu chạy qua các file ra sao** cho mỗi chức năng. Đọc theo thứ tự: (0) Kiến trúc → (1) Vòng đời request → (2) Từng tầng & file → (3) Luồng chức năng end-to-end.

---

## 0. Kiến trúc phân tầng (rất quan trọng — hiểu cái này là hiểu 80%)

Backend theo mô hình **3 tầng tách bạch**, dữ liệu chảy một chiều:

```
HTTP request
   │
   ▼
┌───────────────────────────────────────────────┐
│  API layer   app/api/v1/*.py                    │  ← nhận request, kiểm quyền, gọi service
│  (router, validate body bằng schema)            │
└───────────────────────────────────────────────┘
   │ gọi hàm service (truyền db, user, dữ liệu đã validate)
   ▼
┌───────────────────────────────────────────────┐
│  Service layer  app/services/*.py               │  ← toàn bộ NGHIỆP VỤ ở đây
│  (query DB, quy tắc, tính toán, gọi AI)         │
└───────────────────────────────────────────────┘
   │ dùng ORM model
   ▼
┌───────────────────────────────────────────────┐
│  Model layer  app/models/*.py  (SQLAlchemy)     │  ← ánh xạ bảng PostgreSQL
└───────────────────────────────────────────────┘

Ngang hàng hỗ trợ:
  app/core/*   → hạ tầng (DB session, security, deps, config, roles)
  app/ai/*     → mô hình AI (inference, danh sách lớp, metrics)
  app/schemas/* → Pydantic: hình dạng request/response (validate + serialize)
```

**Nguyên tắc vàng:** API *không* chứa nghiệp vụ, chỉ điều phối. Service *không* biết HTTP (không đọc Request, không set status trực tiếp trừ ném `HTTPException`). Model *không* chứa logic. Nhờ vậy nghiệp vụ test được độc lập và tái dùng (vd `recommend_service` được cả meal plan lẫn trang gợi ý gọi).

---

## 1. Vòng đời một request (ví dụ: xem chi tiết công thức)

`GET /api/v1/recipes/{id}` chạy qua các trạm sau:

1. **`app/main.py`** — app FastAPI đã `include_router` recipes ở prefix `/api/v1/recipes`. CORS + mount `/static/uploads` đã cấu hình sẵn.
2. **`app/api/v1/recipes.py::get_recipe_detail`** — hàm route. FastAPI tự inject:
   - `db` qua `Depends(get_db)` → mở một `AsyncSession` (đóng tự động cuối request).
   - `user` qua `Depends(get_optional_current_user)` → giải mã JWT nếu có (không bắt buộc đăng nhập).
3. Route gọi **`recipe_service.get_recipe_detail(db, id, user)`** — nghiệp vụ: query recipe + ingredients + steps + rating của user, tăng view_count...
4. Service trả object/dict → route bọc vào **schema** (`app/schemas/recipe.py`) → FastAPI serialize JSON.
5. Session `db` đóng, response trả về client.

Ba `Depends` cốt lõi ở **`app/core/deps.py`**:
| Hàm | Dùng khi | Hành vi |
|---|---|---|
| `get_current_user` | endpoint bắt buộc đăng nhập | JWT sai/hết hạn → 401 |
| `get_current_active_user` | như trên + chặn tài khoản khóa | `is_active=False` → 403 |
| `require_admin` | endpoint chỉ admin | role < admin → 403 |
| `get_optional_current_user` | endpoint công khai nhưng cá nhân hóa nếu đã login | không token → trả `None`, không lỗi |

---

## 2. Từng tầng & file — hàm chính, tham số, chức năng

### 2.1. `app/core/` — hạ tầng dùng chung

| File | Thành phần | Chức năng |
|---|---|---|
| `config.py` | `Settings(BaseSettings)` | Đọc biến môi trường (.env). Chứa `SECRET_KEY`, `ALGORITHM="HS256"`, `ACCESS_TOKEN_EXPIRE_MINUTES=60`, `REFRESH_TOKEN_EXPIRE_DAYS=7`, `MODEL_WEIGHTS_DIR`, `UPLOAD_DIR`, DB URL. |
| `database.py` | `Base` (DeclarativeBase), `get_db()` | `Base` là lớp cha mọi model. `get_db()` là dependency yield một `AsyncSession`, đóng cuối request. `AsyncSessionLocal` dùng ở nơi ngoài request (startup). |
| `security.py` | `hash_password`, `verify_password`, `create_access_token(user_id, role)`, `create_refresh_token(user_id)`, `decode_token(token)`, `generate_temp_password(len)` | Băm mật khẩu (bcrypt/passlib) & ký/giải mã JWT (python-jose, HS256). Access token có `role`+`type='access'`; refresh chỉ `type='refresh'`. |
| `deps.py` | 4 dependency ở bảng mục 1 + `oauth2_scheme` | Trích JWT từ header `Authorization: Bearer`, nạp `User` từ DB. |
| `roles.py` | `USER`, `ADMIN`, `ROLE_RANK`, `role_at_least(role, min)` | Mô hình phân quyền theo cấp bậc (rank). `role_at_least` so cấp. |
| `variant_config.py` | `detect_variants(title)`, `build_canonical_slug(keyword, region, protein)`, `build_variant_label(...)`, `is_multi_variant(slug)`, `MIN_VARIANT_CLUSTER=5` | Sinh slug định danh món & nhãn biến thể khi tuyển canonical (vd phở bò/gà). `is_multi_variant` cho biết một lớp có nhiều biến thể để hiển thị "dish overview". |
| `dessert_blacklist.py` | `is_dessert(keyword, title)` | Cờ món tráng miệng — loại khỏi gợi ý bữa chính. |

### 2.2. `app/models/` — bảng CSDL (SQLAlchemy ORM)

Xem quan hệ chi tiết ở **mục 4 — Sơ đồ quan hệ**. Tóm tắt file:

| File | Bảng | Vai trò |
|---|---|---|
| `user.py` | `users` | Tài khoản: email(unique), hashed_password, full_name, avatar, bio, `role`, `is_active`. Quan hệ 1–n tới recipes, comments, ratings, saved_recipes, meal_plans, ai_logs. |
| `recipe.py` | `recipes`, `recipe_ingredients`, `recipe_steps` | Recipe là thực thể trung tâm. Cột nghiệp vụ: `source` (user/admin/monngonmoingay), `status` (pending/approved/...), `is_canonical`, `canonical_dish_slug` (khóa nối AI↔công thức), `variant_label`, `llm_judge_score`, số liệu `avg_rating/rating_count/view_count/save_count`, các mảng phân loại (`regions`, `dish_types`, `diets`...). Ingredient/Step là con, xóa theo cascade. |
| `social.py` | `comments`, `ratings`, `saved_recipes` | Tương tác người dùng–công thức. Rating có `score`; SavedRecipe là bookmark. (Không còn Follow/Feed — đã gỡ.) |
| `meal_plan.py` | `meal_plans`, `meal_plan_items`, `grocery_items` | Kế hoạch bữa ăn theo tuần. Item gắn `recipe_id` + `meal_type` + `date`. GroceryItem có `is_manual`, `is_checked`. |
| `recipe_change_request.py` | `recipe_change_requests` | Đề xuất thay đổi công thức: `type` (create/edit/delete), `payload` (JSONB), `status`, `requested_by`, `reviewed_by`, `reject_reason`. |
| `ai_log.py` | `ai_logs` | Nhật ký mỗi lần nhận diện: `predicted_class`, `confidence`, `model_used`, `user_id`, `image_url`. |
| `ai_generated_recipe.py` | `ai_generated_recipes` | Cache công thức sinh tự động theo tên món (JSONB) — di sản, ít dùng sau khi bỏ fallback. |
| `newsletter.py` | `newsletter_subscribers` | Đăng ký nhận bản tin: email, `unsubscribe_token`, `is_active`. |

### 2.3. `app/ai/` — khối trí tuệ nhân tạo

| File | Thành phần | Chức năng |
|---|---|---|
| `class_names.py` | `GROUP_CLASSES` (8 nhóm → list slug), `GROUP_TO_WEIGHT`, `GROUP_MODEL_FILE`, `CLASS_DISPLAY_NAMES`, `get_keyword_from_class()` | **Nguồn chân lý** cho tập lớp AI. Ánh xạ slug↔tên hiển thị tiếng Việt, nhóm↔file trọng số. |
| `inference.py` | `TastyVietnamPredictor` (`__init__(weights_dir)`, `predict(pil_image)`), `_build_group_model`, `_build_sub_model`, `_load_model_state` | Nạp model 2 tầng và suy luận. `predict` trả dict: `needs_fallback`, `group`, `group_confidence`, `predicted_class`, `class_confidence`, `top5`. Ngưỡng: nhóm 0.5, món 0.6. |
| `state.py` | `set_predictor(p)`, `get_predictor()`, `get_predictor_optional()` | Giữ instance predictor toàn cục (nạp 1 lần lúc startup). `get_predictor()` → 503 nếu chưa sẵn sàng. |

### 2.4. `app/services/` — nghiệp vụ (trái tim backend)

**Nhóm AI & nhận diện**
| Hàm (file) | Tham số | Chức năng |
|---|---|---|
| `ai_service.recognize_image` | `db, predictor, image_bytes, user_id?, image_url?` | Điều phối toàn luồng nhận diện: validate ảnh → `predict` → `dish_resolver` → tra canonical + suggested → ghi `AILog` → trả payload đầy đủ. |
| `ai_service._find_canonical_for_class` | `db, predicted_class` | Trả (canonical chính, list variants) cùng slug, xếp theo `llm_judge_score`. |
| `ai_service._find_suggested_recipes` | `db, slug, display_name, keyword, canonical, variants, limit=6` | Gom ≤6 gợi ý theo 3 tầng dự phòng, khử trùng theo tên. |
| `dish_resolver.resolve_vnfood` | `vnfood_result, has_canonical` | Quyết tier: confident (≥0.6) / tentative (0.4–0.6 & có canonical) / None. |
| `dish_resolver.resolve_to_slug` | `name` | Map tên tự do → slug qua `ALIAS_MAP`. |
| `dish_resolver.has_canonical` / `set_canonical_slugs` | `slug` / `slugs` | Tra/cập nhật cache slug có canonical (O(1), không I/O). |
| `canonical_coverage.compute_canonical_coverage` | `db` | Lúc startup: tính slug nào có canonical, nạp vào cache resolver, lưu `LAST_COVERAGE` cho `/ai/health`. |
| `metrics_service.get_class_metrics` / `get_overall_metrics` | `slug` | Đọc `model_metrics.json` (độ chính xác từng lớp) để hiển thị. |
| `dish_recipe_service.get_curated` / `dish_overview_service.get_overview` | `slug` | Trả công thức/curated & mô tả tổng quan món nạp từ JSON tĩnh. |
| `recommend_service.suggest_recipes_for_user` | `db, user_id, n=6, exclude?` | Gợi ý cá nhân hóa từ lịch sử (rating≥4, saved, ai_logs); cold-start → món phổ biến. |

**Nhóm công thức & catalog**
| Hàm (recipe_service.py) | Chức năng |
|---|---|
| `catalog_canonical_clause()` / `catalog_visible_clause()` / `browse_visible_clause()` | Điều kiện SQL định nghĩa "pool" công thức được phép hiện (canonical monngonmoingay hoặc do user đăng). |
| `list_recipes(...)` | Danh sách + lọc (keyword, region, difficulty...) + phân trang. |
| `get_recipe_detail(db, id, user)` | Chi tiết đầy đủ (ingredients/steps/rating của user), tăng view. |
| `search_recipes` / `get_featured_recipes` / `get_related_recipes` / `get_recipes_by_keyword` | Tìm kiếm full-text, món nổi bật, món liên quan, theo keyword. |
| `create_recipe / update_recipe / delete_recipe` | CRUD công thức. |
| `submit_recipe / withdraw_recipe / admin_publish / admin_reject / approve_recipe` | Máy trạng thái duyệt bài của user (pending→approved/rejected). |
| `get_user_recipes / get_my_recipes / get_pending_recipes / list_review_queue` | Các truy vấn theo tác nhân. |

**Nhóm tương tác & người dùng**
| Hàm | File | Chức năng |
|---|---|---|
| `list_comments / create_comment / update_comment / delete_comment` | social_service | Bình luận (kiểm quyền sở hữu). |
| `upsert_rating / get_my_rating / delete_rating / _recompute_rating` | social_service | Đánh giá sao; `_recompute_rating` tính lại `avg_rating/rating_count` của recipe. |
| `save_recipe / unsave_recipe / list_saved_recipes` | social_service | Bookmark. |
| `get_user_profile / update_profile` | user_service | Hồ sơ công khai + cập nhật hồ sơ. |
| `register_user / login / refresh_access_token / change_password / change_email` | auth_service | Xác thực (chi tiết ở mục 3). |

**Nhóm kế hoạch bữa ăn**
| Hàm (meal_plan_service.py) | Chức năng |
|---|---|
| `create_meal_plan / get_meal_plan_full / list_user_meal_plans / delete_meal_plan` | CRUD kế hoạch (7 ngày từ `week_start`). |
| `add_meal_plan_item / update_meal_plan_item / delete_meal_plan_item` | Thêm/sửa/xóa món trong ô (kiểm ngày trong tuần, không sửa ngày đã qua). |
| `generate_grocery_list / get_grocery_list` | Sinh danh sách đi chợ "live" từ kế hoạch (gộp nguyên liệu, giữ item thủ công & trạng thái tick). |
| `add_grocery_item_manual / update_grocery_item / delete_grocery_item` | Thao tác từng dòng đi chợ. |
| `grocery_categories.categorize(name)` | Phân nhóm nguyên liệu (thịt-cá/rau-củ/gia-vị...). |

**Nhóm quản trị & phụ trợ**
| Hàm | File | Chức năng |
|---|---|---|
| `get_admin_stats / get_chart_data` | admin_service | Số liệu tổng quan + dữ liệu biểu đồ dashboard. |
| `list_admin_users / get_admin_user_detail / update_user_status / update_user_role / create_admin_user / reset_admin_user_password / delete_admin_user` | admin_service | Quản lý người dùng. |
| `list_admin_comments / toggle_comment_hidden / delete_comment` | admin_service | Kiểm duyệt bình luận. |
| `list_admin_ingredients / merge_ingredients / rename_ingredient` | admin_service | Dọn dữ liệu nguyên liệu. |
| `create_change_request / approve_change_request / reject_change_request / list_pending_change_requests` | change_request_service | Quy trình đề xuất–duyệt công thức (chi tiết mục 3). |
| `save_uploaded_file(file, category)` | upload_service | Lưu ảnh vào `uploads/` (kiểm MIME & đuôi file). |
| `synthesize_vi(text)` | tts_service | Chuyển văn bản bước nấu → giọng nói (cache theo hash). |
| `subscribe / unsubscribe_by_token / send_weekly_newsletter` | newsletter_service | Bản tin. |

### 2.5. `app/api/v1/` — router (điểm vào HTTP)

Mỗi file = một nhóm endpoint, `include_router` ở `main.py` với prefix:

| Router | Prefix | Endpoint tiêu biểu → service gọi |
|---|---|---|
| `auth.py` | `/api/v1/auth` | register, login, staff-login, refresh, change-password/email → `auth_service` |
| `recipes.py` | `/api/v1/recipes` | list, detail, search, featured, related, create/update/delete, submit/withdraw/publish/reject → `recipe_service` |
| `ai.py` | `/api/v1/ai` | `POST /recognize` (upload), `/recognize-url`, `/history`, `/health` → `ai_service` |
| `meal_plans.py` | `/api/v1/meal-plans` + `grocery_router` | CRUD plan/item, suggestions, grocery → `meal_plan_service`, `recommend_service` |
| `recipe_change_requests.py` | `/api/v1/recipe-change-requests` | create/my/pending/approve/reject → `change_request_service` |
| `comments.py` / `ratings.py` / `saved.py` | `/api/v1` | tương tác → `social_service` |
| `users.py` | `/api/v1/users` | hồ sơ, my-recipes, my-meal-plans → `user_service`, `recipe_service` |
| `admin.py` | `/api/v1/admin` | thống kê, quản lý user/comment/ingredient (đều `Depends(require_admin)`) → `admin_service` |
| `upload.py` / `tts.py` / `newsletter.py` | `/api/v1/...` | upload ảnh, TTS, bản tin |

### 2.6. `app/schemas/` — Pydantic (hợp đồng dữ liệu)
Định nghĩa hình dạng request body & response (vd `RecipeCreate`, `RecipeCardOut`, `ChangeRequestCreate`). FastAPI dùng để **validate đầu vào** (sai kiểu → 422 tự động) và **serialize đầu ra**. Đây là ranh giới đảm bảo API không nhận/emit dữ liệu sai cấu trúc.

---

## 3. Ba luồng chức năng end-to-end (đọc để thấy các file "nói chuyện" với nhau)

### Luồng 1 — Nhận diện ảnh món ăn (chức năng lõi)
```
Client
  └─ POST /api/v1/ai/recognize (multipart ảnh)
       api/v1/ai.py::recognize_endpoint
         ├─ get_predictor()              [ai/state.py]  → instance đã nạp lúc startup
         └─ ai_service.recognize_image(db, predictor, bytes, user_id, image_url)
              1. PIL mở & validate (≥100px)                      [ai_service]
              2. predictor.predict(img)                          [ai/inference.py]
                    tầng1 B0 → nhóm (ngưỡng .5)
                    tầng2 B2 → top5 món (ngưỡng .6)
              3. dish_resolver.resolve_vnfood(result, has_canonical)  [dish_resolver]
                    → (slug, tier)  hoặc  (None → "không nhận diện được")
              4. _find_canonical_for_class(db, slug)             [ai_service → recipes bảng]
                 _find_suggested_recipes(...)                    [ai_service]
              5. db.add(AILog(...)); commit                      [models/ai_log.py]
              6. metrics_service.get_class_metrics(slug)         [metrics_service]
         └─ trả JSON: predicted_class, display_name, confidence, match_tier,
                       canonical_recipe, variants, suggested_recipes, top_predictions...
```

### Luồng 2 — Người dùng đề xuất công thức & admin duyệt
```
User: POST /recipe-change-requests {type:create, payload:{...}}
        change_request_service.create_change_request → lưu RecipeChangeRequest(status=pending)
Admin: GET  /recipe-change-requests/pending
        change_request_service.list_pending_change_requests
Admin: POST /recipe-change-requests/{id}/approve
        change_request_service.approve_change_request:
          - create → tạo Recipe(source=admin, status=approved, is_canonical=True) + ingredients/steps
          - edit   → replace-all ingredients/steps của target, xóa flavor_text
          - delete → CHẶN nếu là canonical duy nhất của một lớp AI (409)
          - đặt cr.status=approved, reviewed_by=admin.id
        (reject → status=rejected + reject_reason)
```

### Luồng 3 — Lập kế hoạch bữa ăn → danh sách đi chợ
```
POST /meal-plans                → create_meal_plan (7 ngày từ week_start)
POST /meal-plans/{id}/items     → add_meal_plan_item (kiểm ngày hợp lệ, gắn recipe_id)
GET  /meal-plans/{id}/suggestions → recommend_service.suggest_recipes_for_user (cá nhân hóa)
GET  /grocery/...               → meal_plan_service.get_grocery_list
        → _aggregate_from_items: gom nguyên liệu các recipe phân biệt trong plan
          (1 query join, khử trùng tên không dấu, NỐI định lượng chứ không cộng)
        → giữ item thủ công (is_manual) + trạng thái tick (is_checked)
        → grocery_categories.categorize để phân nhóm
```

---

## 4. Sơ đồ quan hệ CSDL (ai trỏ tới ai)

```
users ──1:n──> recipes            (author_id, ON DELETE SET NULL)
users ──1:n──> comments / ratings / saved_recipes / meal_plans / ai_logs
recipes ──1:n──> recipe_ingredients / recipe_steps   (ON DELETE CASCADE)
recipes ──1:n──> comments / ratings / saved_recipes
recipes ──1:n──> meal_plan_items  (recipe_id, ON DELETE SET NULL)
recipes ──self──> recipes         (derived_from_recipe_id — công thức tinh chỉnh từ bản gốc)
meal_plans ──1:n──> meal_plan_items / grocery_items   (ON DELETE CASCADE)
recipe_change_requests ──> recipes (target_recipe_id) + users (requested_by, reviewed_by)

Nối AI ↔ dữ liệu (KHÔNG phải FK, là khóa logic):
  recipes.canonical_dish_slug  ===  slug trong ai/class_names.py::GROUP_CLASSES
  → dish_resolver + canonical_coverage dùng cột này để đảm bảo mỗi nhãn AI có công thức thật.
```

**Chọn `ON DELETE` có chủ đích:**
- `CASCADE` cho con thuộc về cha (ingredients/steps của recipe, items của plan) — xóa cha thì con vô nghĩa.
- `SET NULL` cho tham chiếu "tác giả/nguồn" (author_id, recipe_id trong meal_plan_item) — xóa user/recipe không được làm mất lịch sử/kế hoạch, chỉ gỡ liên kết.

---

## 5. Mẹo đọc code nhanh khi cần sửa
1. Bắt đầu từ **router** (`api/v1/<x>.py`) để biết endpoint gọi service nào.
2. Nhảy vào **service** tương ứng — nghiệp vụ nằm hết ở đó.
3. Xem **model** để biết cột/quan hệ; xem **schema** để biết hình dạng vào/ra.
4. Với AI: đường đi luôn là `ai.py → ai_service → (inference + dish_resolver + recipe bảng)`.
5. Chức năng nào cũng theo mẫu **router → service → model**; nắm 1 luồng là suy ra được phần còn lại.
```
```
