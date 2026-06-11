# Đồng bộ Nhận diện ↔ Tra cứu qua `resolved_slug`

> Spec — 2026-06-10
> Branch gốc: `feat/monngonmoingay-restyle`

## Vấn đề

Project có 2 phần: nhận diện món bằng AI model (103 class, fallback OpenAI Vision) và
tra cứu công thức. Hai phần đang nối với nhau bằng **3 khóa join khác nhau** cho cùng
một ảnh, nên 3 vùng UI có thể chỉ vào 3 món khác nhau:

| Vùng UI | Tính bằng | Code |
|---|---|---|
| "Công thức chuẩn" + biến thể | `canonical_dish_slug == predicted_class` (slug) | `ai_service.py:243` |
| Carousel "gợi ý" | `title ILIKE %display_name%` → fallback `keyword==` | `ai_service.py:274-292` |
| Headline + nút "Tìm công thức" | `/search?q=display_name` (full-text) | `RecognitionResult.tsx:101` |

### Các edge case desync đã xác nhận

1. **🔴 OpenAI nhận đúng 1 trong 103 món → vẫn không link canonical, lại sinh recipe trùng.**
   Khi `model_used=="openai"`, `predicted_class` = tên free-text (vd "Bánh xèo"), không phải
   slug → `_find_canonical_for_class` match theo slug luôn `None` → section "Công thức chuẩn"
   biến mất → gọi `get_or_generate_ai` tạo `AIGeneratedRecipe` mới cho món vốn đã có canonical.
   (`ai_service.py:84-86, 111-112`)
2. **🔴 Vùng xám confidence 0.5–0.6 nuốt món đúng.** Ngưỡng `CLASS_CONFIDENCE_THRESHOLD=0.6`
   (`inference.py:87`). Món đúng nhưng 0.55 → đẩy sang OpenAI → kéo theo #1.
3. **🔴 canonical KHÔNG lọc `status`.** `_find_canonical_for_class` thiếu `status=='approved'`
   (`ai_service.py:243-247`) → click "Công thức chuẩn" có thể vào trang 404/403.
4. **🟠 keyword fallback quá thô.** Mọi `banh-*` → `"Bánh"` (`class_names.py:140-161`); khi
   title-match < 3 → `keyword=="Bánh"` trả bất kỳ bánh nào → nhận diện *banh-gai* nhưng
   carousel đầy *banh-mi*, *banh-xeo*. (`ai_service.py:284-292`)
5. **🟠 ILIKE không bỏ dấu.** Postgres ILIKE không accent-insensitive mặc định
   (`ai_service.py:277`) → "Pho" (tên tiếng Anh OpenAI trả) không khớp "Phở".
6. **🟠 Không có invariant 103/103 ở runtime.** Không check lúc startup mỗi slug có canonical
   approved → xoá/unpublish 1 canonical thì link gãy âm thầm.
7. **🟡 Slug trùng giữa group → "103" sai.** `banh-canh` ∈ BANH & BUN_PHO; `bo-kho` ∈
   MON_KHO_NUONG & CANH_CHAO; `ca-muoi-xoi` ∈ MON_KHO_NUONG & DAC_BIET → unique thực < 103.
8. **🟡 Model "gần đúng" bị vứt sạch.** `needs_fallback` mà OpenAI fail/no-key → `isUnknown=true`
   → ẩn cả top5 VNFood (`RecognitionResult.tsx:88-95,128`).

## Insight trung tâm

Gốc desync là 3 khóa join khác nhau. Giải pháp: **slug là khóa join duy nhất.**
`recognize_image` tính ra **một `resolved_slug` + một `match_tier`**, mọi nhánh UI key theo nó.

```
ảnh → predict ──► resolved_slug (1 trong 103) ──┬─► canonical + variants  (slug)
                         ▲                       ├─► suggested carousel    (canonical+variants TRƯỚC, rồi keyword top-up)
                         │                       └─► search/link           (slug)
        VNFood top-1  ───┤
        OpenAI name  ───┘ (normalize ngược về slug nếu khớp)
```

### `match_tier`

`match_tier ∈ { confident · tentative · openai_known · unknown }`

| Điều kiện | `resolved_slug` | `match_tier` |
|---|---|---|
| group≥0.5 & class≥0.6 | `predicted_class` | `confident` |
| class ∈ [0.4, 0.6) **và** slug có canonical approved | `top5[0].class` | `tentative` |
| class<0.4 hoặc group<0.5 → OpenAI, name map về slug có canonical | slug đã map | `openai_known` |
| OpenAI name không map được | `None` | `unknown` → AI-generate |

## Components

### C1 — Slug resolver (mới): `backend/app/services/dish_resolver.py`

- **Alias map** build 1 lần lúc startup từ `CLASS_DISPLAY_NAMES`: `normalize(text) → slug`.
  - `normalize` = lowercase + bỏ dấu (unicodedata NFD → strip combining) + gộp khoảng trắng.
  - Index cả `normalize(display_name)` và `normalize(slug-không-dấu-gạch)`.
  - Thêm vài alias tay tiếng Anh: `pho`, `spring roll → goi-cuon`, … (danh sách nhỏ, mở rộng dần).
- `resolve_to_slug(name: str) -> str | None`: chạy `normalize` rồi tra alias map.
- `resolve(vnfood_result, openai_name, has_canonical: Callable[[str], bool]) -> (slug|None, tier)`
  theo bảng `match_tier`. `has_canonical(slug)` hỏi DB (hoặc set slug-có-canonical cache lúc startup).
- **OpenAI constrained**: sửa prompt `_openai_recognize` — kèm danh sách 103 display-name, yêu cầu
  ưu tiên trả đúng tên trong list; output vẫn chạy qua `resolve_to_slug` để chốt slug (hybrid).

### C2 — Canonical lookup hardening (#3)

`_find_canonical_for_class` (`ai_service.py:243`): thêm `Recipe.status == "approved"`.
Toàn bộ downstream nhận `resolved_slug` thay vì `predicted_class` string thô.

### C3 — Unified suggested_recipes (#4)

`_find_suggested_recipes` (`ai_service.py:263`) khi có `resolved_slug`:
1. **Seed** = canonical + variants (cùng slug, đã approved) — carousel chứa đúng món đang link.
2. **Top-up** bằng keyword cho đủ `limit`, dedup theo normalized title (logic dedup hiện có giữ nguyên).
3. Nhánh `unknown`/openai-generate (không slug): giữ title-ilike + keyword, có unaccent (C4).

### C4 — Unaccent (#5)

- Alembic migration bật extension `unaccent` (Postgres 16, có sẵn).
- Title match đổi sang `unaccent(title) ILIKE unaccent(:pattern)` ở nhánh không-slug và keyword.
- **Đây là thay đổi schema/DB duy nhất.**

### C5 — Startup invariant + health (#6, #7)

- Lúc startup (sau `load_dish_recipes`): lấy **set** slug unique từ `GROUP_CLASSES` (tự xử lý #7),
  query canonical approved từng slug, log WARNING các slug thiếu, cache set slug-có-canonical (dùng cho C1).
- Expose ở `/ai/health`: `canonical_coverage: { total, covered, missing: [...] }`.

### UI (#8): `frontend/components/ai/RecognitionResult.tsx`

- `AIRecognitionResult` (`lib/types`) thêm field `match_tier`.
- `tentative` → banner "Có thể là **{tên}**…", confidence hiển thị muted, **vẫn render** canonical +
  giữ top3 (hết cảnh vứt sạch top-1).
- `openai_known` → render canonical bình thường (đã có slug), badge OpenAI.
- `isUnknown` chỉ khi `match_tier == "unknown"`.

## Contract / Schema changes

- Response `recognize_image` thêm `match_tier: str` (và `resolved_slug` để debug, optional).
- `AIRecognitionResult` TS type thêm `match_tier`.
- DB: extension `unaccent` (migration).

## Error handling

- OpenAI fail/no-key ở nhánh fallback: nếu VNFood top-1 thuộc tier `tentative` (có canonical) →
  vẫn dùng nó. Chỉ khi không có gì map được mới `unknown`.
- `resolve_to_slug` trả `None` an toàn cho input rỗng/None.
- Coverage check không chặn startup, chỉ log WARNING.

## Testing

- Unit: `normalize` + alias map (display-name, accentless, English alias) → slug đúng.
- Unit: `resolve()` ra đúng tier cho 4 ca (mock vnfood_result + openai_name + has_canonical).
- Unit: `_find_canonical_for_class` loại recipe non-approved.
- Unit: `_find_suggested_recipes` seed canonical/variants trước keyword top-up.
- Startup: coverage check liệt kê đúng slug thiếu (seed test 1 slug không canonical).
- (Optional) data test: unique-slug count + 103-coverage.

## Thứ tự triển khai

- **Phase A** (low-risk, độc lập): C2 status filter + C5 coverage/health.
- **Phase B** (spine): C1 resolver + two-tier + OpenAI constrained + rewire `recognize_image` + UI tier.
- **Phase C**: C3 seed-from-canonical + C4 unaccent migration.

## Out of scope (YAGNI)

- Không đổi kiến trúc 2-stage model.
- Không retrain / đổi ngưỡng group (giữ 0.5).
- Không gộp `/search` full-text vào slug (nút search vẫn dùng display_name — chấp nhận, vì nó là
  "tìm rộng" có chủ đích, khác với link canonical).
