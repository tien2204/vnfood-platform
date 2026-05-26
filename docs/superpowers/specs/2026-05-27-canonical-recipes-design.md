# Canonical Recipes — Design Spec

**Branch:** `feat/canonical-recipes` (from `main`, không touch `feat/refocus-pdf-scope`)
**Date:** 2026-05-27
**Author:** Vũ Hữu Tiến (MSSV 20225231)
**Status:** Draft — awaiting user review

---

## 1. Bối cảnh

Sau khi review tiếp đề bài PDF ("nhận diện ảnh món ăn và **tư vấn nấu món ăn**"), thấy rõ vấn đề cô GVHD muốn nói:
- Hệ thống hiện có ~22k Cookpad recipes — quá nhiều recipe cho cùng 1 món
- User upload ảnh phở → cần **1 công thức chuẩn chỉnh** để nấu, không phải list 1000 recipe để chọn
- Refocus approach (30 dishes + 5 chef recipes/dish) đã giải một phần nhưng vẫn không phải "1 công thức chuẩn"

## 2. Mục tiêu

Mỗi món riêng biệt (bao gồm biến thể vùng miền) sẽ có **đúng 1 canonical recipe** — chuẩn chỉnh, đã polish bởi LLM, có thể manual override sau.

## 3. Quyết định kỹ thuật

| # | Decision |
|---|---|
| 1 | Branch từ `main` (refocus branch giữ nguyên không bị touch) |
| 2 | LLM 2-stage: GPT-4o-mini judge + refine |
| 3 | Hide chỉ dessert kiểu Tây (bánh kem, kem, cupcake, tiramisu, sinh tố, sữa chua). **Giữ** bánh truyền thống VN (trung thu, pía, bò, da lợn, gai, trôi nước, u, tiêu, lá). |
| 4 | Giữ AI cascade 103-class (không retrain) |
| 5 | Variant detection cho **tất cả** dishes (regional + protein) |
| 6 | **Always refine** + flag `is_manually_reviewed` để override sau |

## 4. Schema changes

**Migration `0005_canonical_recipes.py`:**

```sql
ALTER TABLE recipes ADD COLUMN is_canonical BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE recipes ADD COLUMN canonical_dish_slug VARCHAR(80) NULL;
ALTER TABLE recipes ADD COLUMN variant_label VARCHAR(80) NULL;
ALTER TABLE recipes ADD COLUMN is_dessert BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE recipes ADD COLUMN llm_judge_score FLOAT NULL;
ALTER TABLE recipes ADD COLUMN llm_judge_reason TEXT NULL;
ALTER TABLE recipes ADD COLUMN derived_from_recipe_id UUID NULL REFERENCES recipes(id);
ALTER TABLE recipes ADD COLUMN refinement_notes TEXT NULL;
ALTER TABLE recipes ADD COLUMN is_manually_reviewed BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX ix_recipes_is_canonical ON recipes(is_canonical) WHERE is_canonical = TRUE;
CREATE INDEX ix_recipes_canonical_dish_slug ON recipes(canonical_dish_slug);
CREATE INDEX ix_recipes_is_dessert ON recipes(is_dessert) WHERE is_dessert = TRUE;
```

Source enum extension: thêm `llm-canonical` (cho recipes được LLM tạo từ refine).

## 5. Dessert detection

**File:** `backend/app/core/dessert_blacklist.py`

```python
# Slug prefixes (loại trực tiếp khi keyword match)
DESSERT_SLUG_PATTERNS = [
    r"^kem-",  # kem dừa, kem chuối, kem flan
]

# Title patterns (regex case-insensitive, có/không dấu OK)
DESSERT_TITLE_PATTERNS = [
    r"\bbánh\s+kem\b",
    r"\bbánh\s+gato\b",
    r"\bbánh\s+ngọt\b",
    r"\bkem\s+tươi\b",
    r"\bcupcake\b", r"\btiramisu\b", r"\bcheesecake\b",
    r"\bmacaron\b", r"\bmousse\b", r"\bpudding\b",
    r"\bsữa\s+chua\b", r"\bsinh\s+tố\b",
    r"\bflan\b", r"\bbingsu\b",
]

# Giữ (KHÔNG đánh dấu dessert): banh-trung-thu, banh-pia, banh-bo, banh-da-lon,
# banh-gai, banh-troi-nuoc, banh-u, banh-tieu, banh-la — bánh truyền thống VN
```

Script `mark_desserts.py`: SET `is_dessert=true` cho recipes match. Idempotent.

## 6. Variant detection + bucketing

**Script** `discover_dish_variants.py`:

1. Loại recipes có `is_dessert=true` khỏi quá trình
2. Group recipes by `keyword` (existing column)
3. Trong mỗi keyword group, detect variants qua title regex:

```python
REGIONAL_PATTERNS = {
    "bac": [r"miền\s+bắc", r"\bbắc\b", r"hà\s+nội", r"hà\s+thành"],
    "trung": [r"miền\s+trung", r"\bhuế\b", r"\bquảng", r"đà\s+nẵng"],
    "nam": [r"miền\s+nam", r"\bnam\b", r"sài\s+gòn", r"miệt\s+vườn"],
}

PROTEIN_PATTERNS = {
    "bo": r"\bbò\b",
    "ga": r"\bgà\b",
    "heo": r"\b(heo|lợn)\b",
    "ca": r"\bcá\b",
    "tom": r"\btôm\b",
    "chay": r"\bchay\b",
    "haisan": r"\b(hải\s+sản|seafood)\b",
}
```

4. Generate `canonical_dish_slug` theo pattern: `<keyword>` hoặc `<keyword>-<region>` hoặc `<keyword>-<protein>` hoặc `<keyword>-<region>-<protein>`
5. **Cluster threshold:** mỗi `canonical_dish_slug` cần ≥ 5 recipes; nếu < 5 → gộp lên parent (bỏ phần variant)
6. UPDATE `recipes.canonical_dish_slug` + `variant_label` (human-readable: "miền Bắc, bò")

## 7. LLM judge + refine pipeline

**Script** `select_canonical_recipes.py`:

```
For each canonical_dish_slug:
  candidates = top 5 recipes by:
    - save_count DESC
    - has image_url
    - ingredients_count >= 5
    - steps_count >= 4

  STAGE 1 — JUDGE:
    Send 5 candidates (title + ingredients + steps) to GPT-4o-mini
    Response JSON: {"selected_index": 0-4, "score": 1-10, "reason": "..."}
    Set llm_judge_score, llm_judge_reason on winner

  STAGE 2 — REFINE:
    Send winner recipe to GPT-4o-mini với prompt:
      "Polish recipe này: chuẩn hóa định lượng, sửa typo, chia bước rõ ràng,
       giữ tinh thần gốc, KHÔNG bịa nguyên liệu mới."
    Response JSON: {"title", "description", "ingredients", "steps",
                     "cooking_time_minutes", "servings", "difficulty",
                     "refinement_notes"}
    INSERT new recipe row:
      - source = "llm-canonical"
      - is_canonical = TRUE
      - canonical_dish_slug = <slug>
      - variant_label = <variant>
      - derived_from_recipe_id = <winner.id>
      - refinement_notes = <LLM notes>
      - is_in_scope = TRUE  (compat with existing)
      - status = "approved"
      - author_id = <admin user>
      - is_manually_reviewed = FALSE  (admin có thể tick sau)
```

**Failure handling:**
- LLM trả invalid JSON → retry 1 lần, nếu fail → skip canonical_dish_slug đó, log
- Cost ceiling: dừng nếu quá $5 chi tiêu

**Cost ước tính:** ~100 buckets × ($0.002 judge + $0.01 refine) ≈ $1.20

## 8. Backend changes

| Service / endpoint | Change |
|---|---|
| `recipe_service.list_recipes` | Default `WHERE is_canonical=TRUE AND is_dessert=FALSE`; param `?show_all=true` admin override |
| `recipe_service.search_recipes` | Default canonical only |
| `recipe_service.get_featured_recipes` | Canonical only |
| `recipe_service.get_recipe_detail` | Add `variants` array (other canonical với cùng `keyword` nhưng khác `variant_label`) |
| `ai_service.recognize_image` | Predict → tra `canonical_dish_slug` của predicted keyword → trả 1 canonical + list variants |
| `admin_service` | New endpoint: PATCH `/admin/recipes/{id}/manual-review` để tick `is_manually_reviewed=true` |

**Schemas:**
- `RecipeDetailOut`: thêm `variants: RecipeMiniOut[]`, `refinement_notes: str | None`, `is_canonical: bool`, `is_manually_reviewed: bool`

## 9. Frontend changes

| Page | Change |
|---|---|
| `/` Homepage | Featured = canonical recipes top by save_count |
| `/recipes` Browse | List canonical only, no toggle (admin sees all qua admin route) |
| `/recipes/[id]` Detail | Thêm section "Biến thể vùng miền" (collapsible accordion); badge "Đã review thủ công" nếu `is_manually_reviewed` |
| `/recognize` | AI → 1 canonical recipe hiển thị trực tiếp + accordion variants |
| `/admin/recipes` | Thêm cột "Canonical?" + button "Đã review" |

**Components mới:**
- `CanonicalBadge.tsx` — green badge "Công thức chuẩn"
- `VariantsAccordion.tsx` — collapsible list các biến thể khác

## 10. Execution order

```
Phase 1 — Schema + foundation                              30 min
  ├─ dessert_blacklist.py + variant_config.py
  ├─ Migration 0005_canonical_recipes
  └─ alembic upgrade head

Phase 2 — Dessert + variant detection                      45 min
  ├─ mark_desserts.py (run on 22k recipes)
  ├─ discover_dish_variants.py (run, populate canonical_dish_slug)
  └─ Verify: SQL counts per canonical_dish_slug

Phase 3 — LLM judge + refine pipeline                      2-3h
  ├─ select_canonical_recipes.py (judge + refine)
  ├─ Run on full data (~100 buckets, cost ~$1.20)
  ├─ Spot-check 10 random canonical recipes
  └─ Manual review log

Phase 4 — Backend service updates                          2h
  ├─ Service layer filter is_canonical + is_dessert
  ├─ AI recognize trả canonical + variants
  ├─ Admin manual-review endpoint
  └─ Smoke tests

Phase 5 — Frontend updates                                 2-3h
  ├─ CanonicalBadge + VariantsAccordion components
  ├─ Browse + detail + recognize page rework
  ├─ Admin manual-review UI
  └─ Type-check + browser smoke

Phase 6 — Docs + ADR                                       30 min
  ├─ ADR 0002-canonical-recipes
  ├─ Update session-state.md
  └─ CLAUDE.md milestone
```

Total: **~8-10h**

## 11. Acceptance criteria

- [ ] Migration 0005 chạy success, 9 columns mới có sẵn
- [ ] `is_dessert` đánh dấu chỉ recipes kiểu Tây/kem; bánh trung thu/pía/bò KHÔNG bị mark
- [ ] Mỗi `canonical_dish_slug` có đúng 1 row với `is_canonical=true`
- [ ] Tổng số canonical recipes ≥ 50 (gồm regional + protein variants)
- [ ] Mỗi canonical có `derived_from_recipe_id`, `llm_judge_score`, `refinement_notes` populated
- [ ] Browse page chỉ hiển thị canonical
- [ ] Recipe detail có section "Biến thể vùng miền" hoạt động
- [ ] AI recognize trả 1 canonical + variants
- [ ] Admin có thể tick "Đã review thủ công"
- [ ] ADR + session-state updated

## 12. Defense talking points

| Câu hỏi tiềm năng | Trả lời |
|---|---|
| Tại sao chỉ 1 công thức / món? | Đáp ứng đề bài PDF "tư vấn nấu món ăn" — implies 1 recipe authoritative để user nấu theo |
| LLM refine có hallucinate không? | Prompt cấm bịa nguyên liệu, refinement_notes audit lại được, manual review override |
| Tại sao giữ bánh trung thu/pía mà cắt cupcake? | Phạm vi đề bài: ẩm thực Việt; bánh truyền thống thuộc ẩm thực Việt, dessert phương Tây không |
| Sao không tạo dish_slug riêng cho phở bò/gà nếu giống công thức? | Variant detection có threshold ≥5 recipes — chỉ tách khi đủ data; món hiếm gộp lên parent |
| 22k Cookpad recipes gốc đi đâu? | Vẫn trong DB, chỉ filter khỏi UI thông qua `is_canonical=false`. Có thể bật lại bằng query |

## 13. Non-goals

- ❌ KHÔNG retrain AI model (giữ cascade 103-class hiện có)
- ❌ KHÔNG xóa data gốc Cookpad
- ❌ KHÔNG merge với refocus branch (2 approaches song song, user chọn sau)
- ❌ KHÔNG manual review từng recipe ở phase này (tick flag là đủ, có thể bổ sung sau)

## 14. Risks

1. **LLM hallucination**: prompt strict + refinement_notes audit + manual override flag
2. **Variant over-clustering**: threshold ≥5 recipes per bucket; threshold có thể tune
3. **Dessert false positive**: blacklist có thể miss/over-match → spot-check sau run, fix patterns nếu cần
4. **OpenAI cost overrun**: cost ceiling $5 hardcode; pipeline có thể resume từ checkpoint

---

_End of spec._
