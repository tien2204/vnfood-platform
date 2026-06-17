# Taste-focused Recipe Descriptions (P3) — Design

**Ngày:** 2026-06-17
**Phạm vi:** Mô tả hiển trên trang chi tiết recipe (`/recipes/[id]`) + thẻ `DishRecipeCard` ("CÔNG THỨC GỢI Ý") trên `/recognize`. P3 — phần cuối nhóm 3 cải tiến.

## Vấn đề

`description` của recipe (hiển ở trang chi tiết + DishRecipeCard) nhiều khi **không nói về vị/cách thưởng thức** — user không biết món ăn ra sao, có nên nấu không. Ví dụ gốc: *"Bánh bèo — Là món ăn dân dã, đơn giản đặc trưng của miền Trung, hiện nay trong các bữa cơm cung đình hay tiệc chiêu đãi đều không thể thiếu."* (sáo rỗng, không tả vị).

## Dữ liệu thực tế (đã đo, pool 529 in-scope)

Chất lượng description **pha trộn**, KHÔNG đồng loạt dở:
- 1/529 null; 318 dài >120 ký tự.
- **Tốt** (đã tả vị/cách ăn) — vd "Bánh bột lọc Huế… vỏ trong suốt, nhân tôm thịt, ăn cùng nước mắm chua ngọt"; "Bánh Tiêu… vỏ giòn rụm, nhân mềm, ăn kèm sữa đậu nành/xôi". → **giữ nguyên**.
- **Dở** (chatty/quảng cáo, không tả vị) — vd "Cách làm món Bánh bao hoa hồng ngon tuyệt của nhà mình ;) Nhân dịp 20/10…"; "Làm bánh mì que ngon hơn cả ngoài hàng vì Mẹ có bí kíp từ Món Ngon Mỗi Ngày…". → **nên thay**.

→ **Không ghi đè đồng loạt** (phá cái tốt). Chỉ thay cái chưa chuẩn.

## Quyết định (đã chốt với user)

- **Phạm vi:** 529 recipe in-scope (`is_canonical AND ai_class_slug IS NOT NULL`, từ P2).
- **Lưu:** cột mới `flavor_text` (nullable) — giữ nguyên `description` gốc; display ưu tiên `flavor_text`, fallback `description`.
- **Chọn recipe nào sinh:** mỗi recipe gọi LLM **1 lần** judge-and-rewrite — nếu description gốc đã tả vị tốt → trả rỗng (giữ gốc, `flavor_text` để NULL); nếu chưa → viết mô tả vị giác mới → lưu `flavor_text`.

## Kiến trúc

### 1. Cột `flavor_text`
Thêm `recipes.flavor_text TEXT NULL`. Migration Alembic `0018` (revises `0017`).

### 2. Model
`backend/app/models/recipe.py`: thêm `flavor_text: Mapped[str | None] = mapped_column(Text)` (cạnh `description`).

### 3. Seed script `backend/scripts/seed_flavor_text.py` (1 lần)
- Lấy recipe in-scope (`is_canonical AND ai_class_slug IS NOT NULL`, status approved).
- Với mỗi recipe, prompt LLM (gpt-4o-mini, JSON mode) gồm: `title`, `description` gốc, vài `key ingredients`. Yêu cầu:
  - Đánh giá description gốc đã mô tả VỊ + CÁCH THƯỞNG THỨC (ăn ra sao, vị thế nào, ăn kèm gì) chưa.
  - Nếu RỒI → trả `{"keep": true}` (không sinh mới).
  - Nếu CHƯA → trả `{"keep": false, "flavor_text": "2-3 câu tả vị + cách thưởng thức, tránh sáo rỗng/chatty"}`.
- `keep=false` → ghi `flavor_text`; `keep=true` → để NULL.
- Resume-safe: chỉ xử lý recipe chưa có `flavor_text` (trừ `--force`); commit theo batch (vd mỗi 25 recipe) để gián đoạn không mất tiến độ.
- `sys.stdout.reconfigure(encoding="utf-8")` (Windows cp1252).

### 4. Hiển thị — backend serve "effective description" (KHÔNG đổi schema/frontend)
Hai nơi build description đổi sang `flavor_text or description`:
- `backend/app/services/recipe_service.py` `get_recipe_detail` (~line 381): `description=recipe.flavor_text or recipe.description,`
- `backend/app/services/ai_service.py` `_build_dish_recipe_from_canonical` (line 253): `"description": row.flavor_text or row.description,`

→ Recipe ngoài 529 (flavor_text NULL) tự fallback description gốc. Frontend + Pydantic schema **không đổi** (field `description` vẫn vậy, chỉ được nạp giá trị tốt hơn).

## Out of scope (YAGNI)
- Không thêm `flavor_text` vào schema/response (chỉ coalesce ở backend).
- Không đổi frontend.
- Không đụng recipe ngoài 529, không đụng user recipes.
- Không gọi LLM lúc runtime (chỉ seed 1 lần).

## Testing
- Migration `0018` upgrade head OK; cột tồn tại.
- Seed script: prompt-builder testable (pytest, không gọi LLM); chạy thật trên 529.
- Sau seed: đếm `flavor_text IS NOT NULL` (số recipe được thay) hợp lý (vd 100–300); spot-check vài cái dở (Bánh bao hoa hồng…) đã có flavor_text tả vị, vài cái tốt (Bánh bột lọc Huế) vẫn NULL.
- Display: trang chi tiết + DishRecipeCard hiển flavor_text khi có, description gốc khi không. `tsc`/lint không cần (không đổi frontend); backend `pytest tests/ -q` pass.
