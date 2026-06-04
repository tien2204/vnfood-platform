# Thiết kế — Lọc theo bữa ăn (sáng/trưa/tối) + backfill meal_types (sub-project 2/3)

**Ngày:** 2026-06-03
**Branch:** `feat/canonical-recipes`
**Bối cảnh:** Cột `recipes.meal_types ARRAY(String)` đã có (migration 0009), values `'sang'/'trua'/'toi'`. 2257 canonical MNMN đã tag; **358 canonical còn NULL** (348 llm-canonical + 10 curated). Thêm filter "Bữa ăn" ở trang `/recipes` — lấp gap so monngonmoingay.

---

## Quyết định đã chốt (với user)
- **Backfill:** LLM-classify (reuse `classify_meal_types` gpt-4o-mini như MNMN) cho 358 canonical NULL. ~$0.07. **Chỉ canonical** (raw Cookpad để NULL — không hiện ở browse mặc định).
- **Filter:** **single-select** 1 bữa (Sáng | Trưa | Tối); bấm lại = bỏ. Kết hợp **AND** với keyword/difficulty sẵn có.
- Không migration (cột đã có). Backfill là script chạy 1 lần.

### Non-goals
- Không multi-select bữa. Không tag raw Cookpad (~25k). Không đụng meal filter cho show_all/community pool.

## Components

### 1. Backfill — `backend/scripts/backfill_meal_types.py`
- Select canonical `is_canonical=True AND meal_types IS NULL` (358 món, kèm title).
- Reuse `from scripts.canonicalize_mnmn import classify_meal_types` (gpt-4o-mini, trả subset `['sang','trua','toi']`, fallback `['trua','toi']`).
- `UPDATE recipes SET meal_types=:meals WHERE id=:id` per món; commit theo batch. Idempotent (chỉ chạm NULL → rerun an toàn). Log tiến độ + đếm.

### 2. API filter — `recipe_service.list_recipes`
- Thêm param `meal: Optional[str] = None`.
- Nếu `meal in {"sang","trua","toi"}`:
  `stmt = stmt.where(text(":meal = ANY(recipes.meal_types)").bindparams(meal=meal))`.
  (Postgres `ANY` trên ARRAY; món `meal_types` NULL → không match → tự loại. An toàn injection vì bindparam.)
- Giá trị `meal` lạ → bỏ qua filter (không lỗi).

### 3. Endpoint — `backend/app/api/v1/recipes.py` (GET list)
- Thêm query param `meal: Optional[str] = None` vào handler list → truyền `meal=meal` vào `list_recipes`. (Các param keyword/source/difficulty/sort/search/page/limit giữ nguyên.)

### 4. Frontend — trang browse `/recipes`
- Thêm hàng chip **"Bữa ăn": Sáng / Trưa / Tối** (single-select). State đọc/ghi **URL param `meal`** (`sang|trua|toi`), giống cách keyword chip hiện dùng searchParams.
- Bấm chip đang chọn → bỏ chọn (xóa param). Đổi `meal` → reset `page=1` + refetch (theo pattern filter hiện có).
- Truyền `meal` vào API call list recipes. Lọc AND với keyword.
- Nhãn hiển thị: `sang→Sáng, trua→Trưa, toi→Tối`.

## Data flow
```
backfill_meal_types.py  → 358 canonical NULL được tag (1 lần)
/recipes UI chip "Sáng" → URL ?meal=sang → GET /recipes?meal=sang
  → list_recipes(meal='sang') → where 'sang' = ANY(meal_types) → cards
```

## Error handling
- Backfill: LLM lỗi 1 món → fallback `['trua','toi']` (như classify_meal_types); rerun chỉ chạm NULL.
- API: `meal` không hợp lệ → bỏ qua (trả như không lọc).
- UI: không chọn bữa → không gửi param.

## Verification
- Backfill: chạy → `count(is_canonical AND meal_types IS NULL)` = 0; spot-check (phở→có 'sang', cơm tấm→'trua'/'toi').
- API: `GET /api/v1/recipes?meal=sang` → mọi card có 'sang' trong meal_types; `?meal=sang&keyword=<x>` lọc AND.
- Frontend: `npx tsc --noEmit` 0 lỗi mới; manual: bấm chip Sáng → lưới đổi, URL có `?meal=sang`, bấm lại bỏ; kết hợp keyword chip OK.

## Vị trí
Sub-project 2/3. Sau: 3/3 facet filter (vùng miền/dịp/loại/chế độ ăn — cần crawl taxonomy MNMN + tag + UI).
