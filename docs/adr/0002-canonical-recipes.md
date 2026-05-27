# ADR 0002: Canonical Recipes — LLM-curated 1-per-dish

**Status:** Accepted (implemented)
**Date:** 2026-05-27
**Branch:** `feat/canonical-recipes` (from `main`, songsong với `feat/refocus-pdf-scope`)

## Context

Đề bài PDF ĐATN yêu cầu "**tư vấn nấu món ăn**" — implies 1 công thức chuẩn cho mỗi món để user nấu theo. Hệ thống hiện có 22,304 Cookpad recipes scraped → nhiều công thức cho cùng món, không phù hợp với spec.

GVHD (cô Nguyễn Thị Hoàng Lan) phản hồi: cần 1 công thức chuẩn chỉnh cho mỗi món (bao gồm biến thể vùng miền như Phở Bắc vs Phở Nam tách riêng) thay vì list cả nghìn.

## Decision

Tạo branch riêng `feat/canonical-recipes` từ `main`. Pipeline 3 phase:

### Phase A — Dữ liệu sạch
- `is_dessert` flag để hide dessert kiểu Tây (kem, cupcake, tiramisu, mousse, flan, sữa chua, sinh tố)
- **GIỮ** bánh truyền thống VN (trung thu, pía, bò, da lợn, gai, trôi nước, u, tiêu, lá) — chúng thuộc ẩm thực Việt
- 583 recipes marked as dessert

### Phase B — Xác định dish riêng biệt
- `keyword` column trong DB bẩn: pha trộn slug sạch (`banh-mi`, `pho`) với category Vietnamese catch-all (`Bánh` chứa 6262 recipes, `Canh` 2917, ...)
- LLM (GPT-4o-mini) extract canonical dish slug từ title cho ~16k recipes catch-all (batch 50 titles/call)
- Heuristic regex detect variant: regional (`bac`/`trung`/`nam`) + protein (`bo`/`ga`/`heo`/`ca`/`tom`/`chay`/`haisan`)
- Threshold cluster ≥5 recipes để tránh noise

### Phase C — LLM judge + refine
- Cho mỗi `canonical_dish_slug` có ≥5 recipes:
  1. Top 5 candidates by `save_count + has_image + ingredients_count >= 5`
  2. GPT-4o-mini JUDGES → chọn best, output `score (1-10) + reason`
  3. GPT-4o-mini REFINES recipe winner → polish ingredients, steps, định lượng
- INSERT row mới với `source='llm-canonical', is_canonical=true, derived_from_recipe_id=<winner>`
- Audit trail: `llm_judge_score, llm_judge_reason, refinement_notes`
- `is_manually_reviewed` flag để admin override

### Phase D — UX
- Backend: `list_recipes` default `WHERE is_canonical=true AND is_dessert=false`, param `?show_all=true` cho admin
- AI recognize trả `canonical_recipe` (single) + `variants[]` (regional/protein khác)
- Frontend: CanonicalBadge, VariantsAccordion, ManualReviewBadge
- Recipe detail hiển thị `refinement_notes` (collapsible)

## Consequences

### Positive
- Đáp ứng đúng PDF: 1 công thức chuẩn cho user nấu (thay vì list 1000 recipes hỗn loạn)
- Audit trail đầy đủ: `derived_from_recipe_id` + `refinement_notes` cho phép defense khi cô hỏi "AI sửa gì so với gốc"
- Manual review override flag cho admin
- Quality cao: avg LLM judge score ~8.4/10 trên sample đầu

### Negative
- Cost OpenAI: ~$0.30 extract + ~$8-12 judge/refine (well within $15 ceiling đã raise)
- Pipeline chậm: select script ~20s/bucket × ~350 buckets = ~2h runtime
- LLM có rủi ro hallucination (mitigate: prompt strict + audit + manual override)
- DB carries refocus's columns (is_in_scope, dish_slug, is_curated, source_url) làm baggage — harmless vì code không dùng

### Neutral
- 22k recipes Cookpad gốc vẫn trong DB (chỉ filter khỏi UI thông qua `is_canonical=false`)
- AI cascade 103-class giữ nguyên (không retrain) — accuracy 81.9%, fallback OpenAI Vision cho ảnh ngoài

## Alternatives Considered

- **Refocus approach** (30 dishes + 5 chef recipes/dish): tiếp cận song song trên branch `feat/refocus-pdf-scope`, không xóa
- **Heuristic top-1 (no LLM)**: cost 0 nhưng chất lượng không đồng nhất, không polish được nguyên liệu/bước
- **Branch từ main, reset DB**: clean nhưng tốn 30 phút re-import 22k recipes — chọn renumber migration thay thế
- **LLM compose (tổng hợp N → 1)**: cost cao hơn, rủi ro hallucinate cao hơn judge+refine

## Migration history

- `0005_in_scope_and_chef_sources.py` (cherry-picked từ refocus, là baseline cho 0006)
- `0006_canonical_recipes.py`: 9 cột mới (`is_canonical, canonical_dish_slug, variant_label, is_dessert, llm_judge_score, llm_judge_reason, derived_from_recipe_id, refinement_notes, is_manually_reviewed`)

## References

- Spec: `docs/superpowers/specs/2026-05-27-canonical-recipes-design.md`
- Plan: `docs/superpowers/plans/2026-05-27-canonical-recipes.md`
- Branch song song: `feat/refocus-pdf-scope` + ADR 0001
- PDF ĐATN: `VuHuuTien_20225231_PGNV_20252.pdf`
