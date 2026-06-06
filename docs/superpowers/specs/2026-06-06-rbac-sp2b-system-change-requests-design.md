# Thiết kế — RBAC SP2b: CTV change-request trên recipe hệ thống (staged → admin duyệt)

**Ngày:** 2026-06-06
**Branch:** `feat/canonical-recipes`
**Bối cảnh:** **Sub-project 2b/6** của RBAC. CTV (cộng tác viên) đề xuất **tạo / sửa / xóa** recipe HỆ THỐNG (2615 canonical). Thay đổi được **staged** (recipe live KHÔNG đổi) → admin duyệt → mới áp dụng; reject → bỏ. Đây là "pull request lên catalog canonical". KHÁC SP2 (user đóng góp recipe MỚI của riêng họ). Reuse `require_collaborator`/`require_admin` (SP1), recipe model, RecipeForm (frontend).

**Hạ tầng có sẵn (tái dùng):** `Recipe` model (content fields + `ingredients`/`steps` cascade), `RecipeCreate`/`RecipeUpdate` schema (title/description/image_url/cooking_time/servings/difficulty/keyword + ingredients[] + steps[]), JSONB pattern (`ai_generated_recipe.recipe_json`), `CLASS_DISPLAY_NAMES` (app/ai/class_names.py — keys = 103 AI class slug), `recipe_service` ghi ingredients/steps, `RecipeForm.tsx`. Migration head = 0012.

---

## Quyết định đã chốt (với user)
- **Staged proposal**: live recipe untouched tới khi admin duyệt; apply khi approve, bỏ khi reject.
- **1 tầng**: CTV đề xuất → admin duyệt (không co-review).
- **Frontend: backend + form CTV tối thiểu** (đề xuất sửa/xóa từ trang recipe + tạo mới + list "Đề xuất của tôi"). **Màn admin duyệt = SP5.**
- **Block xóa canonical backing AI class**: nếu target là canonical duy nhất cho 1 slug AI (∈ `CLASS_DISPLAY_NAMES`) → từ chối apply (409), tránh orphan recognition.

### Non-goals (SP2b)
- KHÔNG màn admin review/approve (SP5 — endpoint đã có ở đây).
- KHÔNG sửa canonical metadata (slug/is_canonical/llm_judge…) qua change-request — chỉ content fields.
- KHÔNG diff field-level — payload = full proposed content state (overwrite).

---

## Components

### 1. Model — `backend/app/models/recipe_change_request.py` (mới) + migration 0013
`RecipeChangeRequest`:
| field | type | |
|---|---|---|
| `id` | UUID pk | |
| `type` | String(10) | `create`/`edit`/`delete` |
| `target_recipe_id` | UUID FK recipes.id (ondelete SET NULL), nullable | null cho create |
| `payload` | JSONB nullable | RecipeCreate-shape (gồm ingredients[]+steps[]); null cho delete |
| `requested_by` | UUID FK users.id | CTV |
| `status` | String(10) default `pending` | `pending`/`approved`/`rejected` |
| `reject_reason` | Text nullable | |
| `reviewed_by` | UUID FK users.id nullable | admin |
| `created_at`/`updated_at` | timestamptz | server_default now / onupdate |
Index: `status`, `requested_by`. Migration 0013 manual (mirror 0012 style) tạo bảng `recipe_change_requests`.

### 2. Schema — `backend/app/schemas/change_request.py` (mới)
- `ChangeRequestCreate`: `type: Literal["create","edit","delete"]`, `target_recipe_id: UUID | None = None`, `payload: RecipeCreate | None = None`.
- `ChangeRequestOut`: id, type, target_recipe_id, `target_title: str | None`, status, reject_reason, `requested_by_name: str | None`, created_at.
- Reuse `RejectBody` (đã có ở schemas/recipe.py).

### 3. Service — `backend/app/services/change_request_service.py` (mới)
- `create_change_request(db, user, data)`: validate — `edit`/`delete` cần target tồn tại (404 nếu không); `create`/`edit` cần `payload` (422 nếu thiếu). Insert `pending`, `requested_by=user.id`. Trả CR.
- `list_my_change_requests(db, user, page, limit)`: CR của `requested_by==user.id`, order created_at desc.
- `list_pending_change_requests(db, page, limit)`: status=`pending`, order created_at asc (FIFO) — cho admin queue (UI ở SP5).
- `approve_change_request(db, cr_id, admin)`: load CR; `_assert_status pending` (409). Apply theo type:
  - **create**: `Recipe(is_canonical=True, status="approved", source="collaborator", author_id=cr.requested_by, + content fields từ payload)` + tạo RecipeIngredient/RecipeStep từ payload (reuse pattern `recipe_service.create_recipe`).
  - **edit**: load target (404); overwrite content fields (title/description/image_url/cooking_time/servings/difficulty/keyword) từ payload; xóa+tạo lại ingredients/steps. KHÔNG đụng is_canonical/canonical_dish_slug/status.
  - **delete**: load target (404); **AI-guard**: nếu `target.is_canonical and target.canonical_dish_slug in CLASS_DISPLAY_NAMES` và `count(canonical cùng slug) <= 1` → raise 409 "Không thể xóa: canonical duy nhất cho lớp AI '<slug>'". Else `db.delete(target)`.
  - set `cr.status="approved"`, `reviewed_by=admin.id`. Commit (1 transaction).
- `reject_change_request(db, cr_id, admin, reason)`: `_assert_status pending`; status=`rejected`, reject_reason=reason, reviewed_by=admin.id.
- Helper `_assert_status(cr, "pending", action)` → 409.

### 4. Routes — `backend/app/api/v1/recipe_change_requests.py` (mới) + đăng ký `main.py`
prefix `/api/v1/recipe-change-requests`, tag "change-requests":
- `POST ""` (`require_collaborator`) → create_change_request.
- `GET /mine` (`require_collaborator`) → list_my_change_requests.
- `GET ""` (`require_admin`) → list_pending_change_requests (admin queue).
- `POST /{id}/approve` (`require_admin`) → approve_change_request.
- `POST /{id}/reject` (`require_admin`, body RejectBody) → reject_change_request.
Đăng ký router trong `main.py` (cạnh các router khác, prefix như trên).

### 5. Frontend (CTV tối thiểu — admin review = SP5)
- **Trang recipe detail** (`/recipes/[id]`): nếu user role ≥ collaborator → hiện **"Đề xuất sửa"** + **"Đề xuất xóa"** (ẩn với user thường). "Đề xuất xóa" → confirm → POST change-request `delete`.
- **"Đề xuất sửa"** → mở form (reuse `RecipeForm`) prefilled content recipe hiện tại; submit → POST change-request `edit` (target = recipe). (1 trang vd `/recipes/[id]/propose-edit`.)
- **"Đề xuất công thức hệ thống mới"** → trang reuse `RecipeForm`, submit → POST change-request `create`. Entry từ `/me/change-requests`.
- **`/me/change-requests`** (page mới): list `GET /recipe-change-requests/mine` + badge status (Chờ duyệt / Đã áp dụng / Bị từ chối + reason). Nav link hiện với role ≥ collaborator. Cần `User.role` TS thêm `collaborator` (SP2 follow-up — làm ở đây để gate UI).
- API client: `lib/api` post change-request.

## Data flow
```
CTV submit (create/edit/delete) → RecipeChangeRequest(pending, payload JSONB)
admin approve → apply: insert canonical | overwrite content+ing/steps | delete(+AI-guard)
  → catalog live cập nhật; reviewed_by=admin
admin reject → status=rejected + reject_reason (live untouched)
```

## Error handling
- create: edit/delete thiếu target → 404; create/edit thiếu payload → 422; type lạ → 422 (Literal).
- approve/reject khi không `pending` → 409.
- delete AI-class canonical duy nhất → 409 (block).
- payload sai shape → 422 (validate `RecipeCreate` tại tạo CR).
- non-collaborator gọi create → 403 (guard); non-admin approve → 403 (guard).

## Verification
- Migration 0013 tạo bảng; app import sạch.
- Smoke (real DB, self-clean): tạo CTV+recipe tạm. (a) create CR→approve→recipe mới is_canonical+approved tồn tại; (b) edit CR→approve→target content đổi đúng payload, ing/steps thay; (c) delete CR (recipe thường) →approve→target bị xóa; (d) delete CR target = canonical có slug ∈ AI duy nhất →approve→409; (e) approve khi đã approved →409; (f) reject→status rejected. Cleanup.
- Frontend `tsc` 0 lỗi mới (3 pre-existing). Manual: CTV thấy nút Đề xuất trên recipe; submit edit/delete; `/me/change-requests` hiện list+status.

## Vị trí
SP2b/6. Sau SP2b: CTV đề xuất sửa catalog hệ thống, admin gác cổng. Tiếp: SP3 claim-lock (review recipe user của SP2), SP4 variant-from-saved, SP5 portal (gồm màn admin duyệt CR + queue review).

## Ghi chú vận hành
- Backend từ `backend/`: `$env:PYTHONUTF8=1; .venv\Scripts\python.exe ...`. Migration `alembic upgrade head`. KHÔNG commit `.claude/settings*`, `backups/`, `cookpad_recipe/*.json`. Footer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
