# Thiết kế — RBAC SP2: Pipeline đăng recipe 2 tầng (user → CTV → admin)

**Ngày:** 2026-06-05
**Branch:** `feat/canonical-recipes`
**Bối cảnh:** **Sub-project 2/6** của RBAC. SP1 (role foundation) đã có role `collaborator` + `require_collaborator`. SP2 xây **pipeline đóng góp recipe của USER**: user tạo recipe riêng tư → gửi duyệt → cộng tác viên (CTV) duyệt → admin duyệt cuối → đăng lên cộng đồng (hiện trên browse) kèm ghi nguồn. KHÔNG bao gồm: CTV sửa/tạo/xóa recipe hệ thống (= SP2b, change-request staged), portal CTV/admin (= SP5), claim-lock (= SP3).

**Hạ tầng có sẵn (tái dùng, KHÔNG xây lại):** `Recipe.status` (String, default `pending`), `reject_reason`, `author_id`, `original_author_name`, `source`, `is_canonical`, `is_dessert`. `create_recipe` (recipe_service, set `status="pending"`). `update_recipe` (re-pending khi sửa). `_base_approved_query` (lọc `status=='approved'`). Browse/featured lọc `is_canonical=True` (not show_all). Detail visibility: non-approved chỉ author/admin (`recipe_service` ~279-282). Admin `update_recipe_status` (set status + reject_reason). `require_collaborator`/`require_admin` (deps).

---

## Quyết định đã chốt (với user)
- **Create = bản nháp riêng tư**, sau đó **Gửi duyệt (Submit)** thủ công mới vào hàng đợi CTV.
- **Recipe user được duyệt → hiện ở browse chính** (gắn nhãn "Cộng đồng"), giữ `is_canonical=False` (không phá invariant canonical/AI).
- **Strict 2 tầng**: phải có duyệt CTV (pending_collaborator→pending_admin) RỒI duyệt admin (pending_admin→approved). Endpoint mỗi tầng chỉ nhận đúng status nguồn.
- **SP2b tách riêng** (CTV change-request create/edit/delete recipe hệ thống, staged → admin duyệt) — KHÔNG trong SP2.

### Non-goals (SP2)
- KHÔNG portal/màn review CTV-admin (SP5) — SP2 chỉ làm endpoint + UI "Công thức của tôi" cho user.
- KHÔNG claim-lock (SP3); KHÔNG variant-from-saved (SP4); KHÔNG CTV sửa recipe hệ thống (SP2b).
- KHÔNG migration schema (status là String không constraint; reject_reason đã có). Chỉ 1 data-update legacy.

---

## State machine

| status | nghĩa | ai thấy |
|---|---|---|
| `private` | đã tạo, chưa gửi | author (+admin) |
| `pending_collaborator` | đã gửi, chờ CTV | author, CTV, admin |
| `pending_admin` | CTV đã duyệt, chờ admin | author, CTV, admin |
| `approved` | đã đăng (cộng đồng, lên browse) | mọi người |
| `rejected` | bị từ chối (+`reject_reason`) | author (+reviewer) |

**Transition (kèm guard + validate status nguồn → 409 nếu sai tầng):**
- user create → `private`
- `POST /recipes/{id}/submit` (owner): `private`|`rejected` → `pending_collaborator` (clear `reject_reason`)
- `POST /recipes/{id}/withdraw` (owner): `pending_collaborator` → `private`
- `POST /recipes/{id}/review/approve` (`require_collaborator`): `pending_collaborator` → `pending_admin`
- `POST /recipes/{id}/review/reject` (`require_collaborator`): `pending_collaborator` → `rejected` + reason
- `POST /recipes/{id}/publish` (`require_admin`): `pending_admin` → `approved`, set attribution (`source="user"`, đảm bảo `original_author_name` = tên author)
- `POST /recipes/{id}/admin-reject` (`require_admin`): `pending_admin` → `rejected` + reason
- sửa recipe của mình: `private`/`rejected` sửa tự do; sửa recipe `approved` của mình → quay lại `pending_collaborator` (re-review).

---

## Components

### 1. Backend — service `recipe_service.py`
- `create_recipe`: đổi `status="pending"` → `status="private"`.
- Thêm các hàm transition (mỗi hàm: load recipe, check ownership/quyền đã làm ở route, validate `recipe.status` đúng nguồn nếu sai raise `HTTPException(409)`, set status (+reject_reason/attribution), commit, trả recipe):
  `submit_recipe(db, id, user)`, `withdraw_recipe(db, id, user)`, `collaborator_approve(db, id)`, `collaborator_reject(db, id, reason)`, `admin_publish(db, id)`, `admin_reject(db, id, reason)`.
- `update_recipe`: điều chỉnh logic re-status: nếu đang `approved` → set `pending_collaborator`; nếu `private`/`rejected` giữ nguyên status (vẫn private/cho sửa lại); (không tự nhảy `pending`).
- `list_my_recipes(db, user, page, limit, status_filter=None)`: recipe `author_id==user.id`, mọi status, order `updated_at desc`, trả card kèm `status`+`reject_reason`.
- `list_review_queue(db, stage)`: `stage="collaborator"`→`status='pending_collaborator'`; `stage="admin"`→`status='pending_admin'`; order `updated_at asc` (FIFO). Trả card + author info.
- **Visibility browse:** trong nhánh `not show_all` của `list_recipes`/featured, đổi `Recipe.is_canonical.is_(True)` → `or_(Recipe.is_canonical.is_(True), Recipe.source == "user")` (vẫn trong `status=='approved'` của base query). Cookpad pool (`source='cookpad'`, non-canonical) vẫn bị loại.
- **Visibility detail:** guard non-approved: cho phép xem nếu author HOẶC `role_at_least(viewer.role, COLLABORATOR)` (CTV/admin xem được pending để review) — mở rộng điều kiện hiện tại (author/admin) thành author/CTV/admin.

### 2. Backend — routes `recipes.py`
- 6 route transition ở trên (đặt sau `create_recipe`), body cho reject = `{reason: str}`.
- `GET /recipes/mine` (`get_current_active_user`) → `list_my_recipes`.
- **2 route queue riêng** (guard rõ ràng, không guard động): `GET /recipes/review/queue/collaborator` (`require_collaborator` → `list_review_queue(stage="collaborator")`) và `GET /recipes/review/queue/admin` (`require_admin` → `list_review_queue(stage="admin")`).
- Route order: đặt các path tĩnh (`/mine`, `/review/...`, `/{id}/submit`...) TRƯỚC `/{recipe_id}` để không bị nuốt.

### 3. Backend — schema `schemas/recipe.py`
- `RecipeCardOut` đã có `is_canonical`/`source`/`original_author_name`. Thêm schema `MyRecipeCardOut` (kế thừa card + `status`, `reject_reason`) cho `/recipes/mine` & queue. Body `RejectBody{reason: str}`.

### 4. Frontend
- **`/me/recipes`** (page mới) — "Công thức của tôi": fetch `/recipes/mine`, render card + badge status (Riêng tư / Chờ CTV / Chờ Admin / Đã đăng / Bị từ chối + lý do). Action theo status: private→[Gửi duyệt, Sửa, Xóa]; pending_collaborator→[Thu hồi]; pending_admin→read-only; rejected→[Sửa & gửi lại, Xóa]; approved→[Xem, Sửa]. Link trong user menu (Navbar).
- **`lib/api`**: thêm hàm gọi submit/withdraw (user-facing). (review/publish endpoint để SP5 dùng — không gọi ở SP2 UI.)
- **Community badge**: trong `RecipeCard` + recipe detail, nếu `!is_canonical && source==='user'` → badge "Cộng đồng" + "Đóng góp bởi {original_author_name}".
- Create form hiện có: sau tạo → điều hướng `/me/recipes`; message "đã lưu riêng tư".

## Data flow
```
create → private → [user Submit] → pending_collaborator
  → [CTV /review/approve] → pending_admin → [admin /publish] → approved (source=user)
  → browse (is_canonical OR source=user) + badge Cộng đồng + ghi nguồn original_author_name
reject (CTV|admin) → rejected + reject_reason → /me/recipes hiện lý do → user Sửa & gửi lại
```

## Error handling
- Sai tầng (vd publish khi đang pending_collaborator) → 409 "Sai trạng thái duyệt".
- Không phải owner gọi submit/withdraw → 403. Không đủ quyền review/publish → 403 (guard).
- reject thiếu reason → 422 (schema required) hoặc cho phép reason rỗng → set None; chốt: reason bắt buộc (422 nếu thiếu).

## Verification
- Smoke state-machine (script tạm, real DB, tạo user+recipe tạm rồi cleanup): chạy đủ chuỗi private→pending_collaborator→pending_admin→approved; thử sai tầng→409; non-owner submit→403; reject→rejected+reason; resubmit rejected→pending_collaborator.
- Browse: tạo 1 recipe `source='user', status='approved', is_canonical=false` → xuất hiện trong `list_recipes` (not show_all); 1 recipe `source='cookpad'` non-canonical → KHÔNG xuất hiện.
- `/recipes/mine`: trả đúng recipe của author across status.
- Detail: CTV xem được recipe `pending_collaborator` (không phải của họ); user lạ → 403/404.
- Frontend `tsc` 0 lỗi mới (3 pre-existing). Manual: `/me/recipes` hiển thị badge + action; tạo→private; Gửi duyệt→Chờ CTV.

## Vị trí
SP2/6. Sau SP2: user có vòng đời recipe đầy đủ + recipe cộng đồng lên browse; CTV/admin có endpoint duyệt (UI ở SP5). Tiếp: SP2b (CTV change-request hệ thống).

## Ghi chú vận hành
- Backend từ `backend/`: `$env:PYTHONUTF8=1; .venv\Scripts\python.exe ...`. Không migration; 1 data-update legacy `UPDATE recipes SET status='pending_collaborator' WHERE status='pending' AND is_canonical=false` (chạy 1 lần, idempotent).
- KHÔNG commit `.claude/settings*`, `backups/`, `cookpad_recipe/*.json`. Footer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
