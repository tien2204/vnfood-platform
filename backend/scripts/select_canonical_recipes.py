"""LLM judge + refine pipeline.

For each canonical_dish_slug whose parent keyword is in CLASS_DISPLAY_NAMES whitelist:
  1. Pick top 5 candidates by save_count + has_image
  2. GPT-4o-mini JUDGES which is best
  3. GPT-4o-mini REFINES (polish ingredients, steps, etc.)
  4. INSERT new recipe row with source='llm-canonical', is_canonical=true,
     derived_from_recipe_id=<winner.id>; also insert children rows for
     RecipeIngredient + RecipeStep.

Idempotent: skips canonical_dish_slug that already has is_canonical=true row.
Cost ceiling: $5.
"""
import asyncio
import json
import logging
import uuid
from openai import AsyncOpenAI
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from app.core.database import AsyncSessionLocal
from app.core.config import settings
from app.ai.class_names import CLASS_DISPLAY_NAMES
from app.models.recipe import Recipe, RecipeIngredient, RecipeStep
from app.models.user import User

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
log = logging.getLogger("canonical")

client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
MODEL = "gpt-4o-mini"
COST_CEILING_USD = 12.0
estimated_cost = 0.0


JUDGE_PROMPT = """Bạn là chef Việt Nam có kinh nghiệm. Dưới đây là {n} công thức cho món "{dish}".
Chọn công thức CHUẨN CHỈNH nhất (ingredients đầy đủ và phù hợp, steps rõ ràng,
đúng phong vị truyền thống Việt Nam).

{candidates}

Output JSON (chỉ JSON, không markdown):
{{"selected_index": <0 đến {max_idx}>, "score": <1-10>, "reason": "<lý do ngắn gọn>"}}
"""

REFINE_PROMPT = """Bạn là chef Việt Nam. Polish công thức sau cho chuẩn chỉnh:
- Chuẩn hóa định lượng (vd "1 nhúm muối" -> "1/4 thìa cà phê muối")
- Sửa typo, viết hoa, dấu câu
- Chia bước rõ ràng nếu quá dài; gộp nếu quá vụn
- KHÔNG bịa nguyên liệu mới (chỉ chỉnh sửa lượng/cách diễn đạt)
- Giữ tinh thần và phong vị gốc

Công thức gốc:
Title: {title}
Ingredients:
{ingredients}
Steps:
{steps}
Cooking time (minutes): {cooking_time}
Servings: {servings}

Output JSON (chỉ JSON, không markdown):
{{
  "title": "<title đã polish>",
  "description": "<mô tả ngắn 1-2 câu>",
  "ingredients": [{{"display_text": "...", "ingredient_name": "...", "quantity": "..."}}, ...],
  "steps": [{{"step_number": 1, "content": "..."}}, ...],
  "cooking_time": <int minutes or null>,
  "servings": <int or null>,
  "difficulty": "easy|medium|hard",
  "refinement_notes": "<ghi chú ngắn về những thay đổi đã làm>"
}}
"""


def _format_candidate(idx: int, r: Recipe) -> str:
    ing_list = r.ingredients or []
    steps_list = r.steps or []
    ing = "\n".join(
        f"  - {i.display_text}" for i in ing_list[:15]
    )
    steps = "\n".join(
        f"  {s.step_number}. {s.content}" for s in steps_list[:15]
    )
    return f"[Recipe {idx}]\nTitle: {r.title}\nIngredients:\n{ing}\nSteps:\n{steps}\n"


async def judge_candidates(dish: str, candidates: list):
    cand_str = "\n".join(_format_candidate(i, r) for i, r in enumerate(candidates))
    prompt = JUDGE_PROMPT.format(
        n=len(candidates),
        dish=dish,
        candidates=cand_str,
        max_idx=len(candidates) - 1,
    )
    try:
        resp = await client.chat.completions.create(
            model=MODEL,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.3,
        )
        data = json.loads(resp.choices[0].message.content)
        global estimated_cost
        estimated_cost += 0.005
        idx = int(data["selected_index"])
        if idx < 0 or idx >= len(candidates):
            log.warning(f"  judge returned invalid index {idx}")
            return None
        return idx, float(data["score"]), str(data["reason"])[:500]
    except Exception as e:
        log.warning(f"  judge fail: {e}")
        return None


async def refine_recipe(winner: Recipe):
    ing_list = winner.ingredients or []
    steps_list = winner.steps or []
    ing = "\n".join(f"- {i.display_text}" for i in ing_list)
    steps = "\n".join(f"{s.step_number}. {s.content}" for s in steps_list)
    prompt = REFINE_PROMPT.format(
        title=winner.title,
        ingredients=ing,
        steps=steps,
        cooking_time=winner.cooking_time or "n/a",
        servings=winner.servings or "n/a",
    )
    try:
        resp = await client.chat.completions.create(
            model=MODEL,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.4,
        )
        data = json.loads(resp.choices[0].message.content)
        global estimated_cost
        estimated_cost += 0.02
        return data
    except Exception as e:
        log.warning(f"  refine fail: {e}")
        return None


async def get_admin_user(db) -> uuid.UUID:
    result = await db.execute(select(User).where(User.role == "admin").limit(1))
    admin = result.scalar_one_or_none()
    if not admin:
        raise RuntimeError("No admin user found - run seed_admin.py first")
    return admin.id


async def process_dish(db, slug: str, dish_display_name: str, admin_id: uuid.UUID) -> bool:
    existing = await db.execute(
        select(Recipe.id).where(
            Recipe.canonical_dish_slug == slug,
            Recipe.is_canonical.is_(True),
        )
    )
    if existing.scalar_one_or_none():
        log.info(f"skip {slug} (already canonical)")
        return False

    # Pick top 5 candidates with image, eager-load children
    result = await db.execute(
        select(Recipe)
        .options(selectinload(Recipe.ingredients), selectinload(Recipe.steps))
        .where(
            Recipe.canonical_dish_slug == slug,
            Recipe.is_dessert.is_(False),
            Recipe.image_url.is_not(None),
        )
        .order_by(Recipe.save_count.desc().nullslast())
        .limit(5)
    )
    candidates = list(result.scalars().all())

    # Quality: prefer >=5 ingredients
    filtered = [r for r in candidates if r.ingredients and len(r.ingredients) >= 5]
    if filtered:
        candidates = filtered

    if len(candidates) < 1:
        # Fallback: no image filter
        result = await db.execute(
            select(Recipe)
            .options(selectinload(Recipe.ingredients), selectinload(Recipe.steps))
            .where(
                Recipe.canonical_dish_slug == slug,
                Recipe.is_dessert.is_(False),
            )
            .order_by(Recipe.save_count.desc().nullslast())
            .limit(5)
        )
        candidates = list(result.scalars().all())

    if len(candidates) < 1:
        log.info(f"skip {slug} (no candidates)")
        return False

    variant_label = candidates[0].variant_label
    keyword = candidates[0].keyword
    image_url = candidates[0].image_url

    judge_result = await judge_candidates(dish_display_name, candidates)
    if not judge_result:
        return False
    sel_idx, score, reason = judge_result
    winner = candidates[sel_idx]
    log.info(f"  judge {slug}: idx={sel_idx} score={score:.1f}")

    refined = await refine_recipe(winner)
    if not refined:
        return False

    new_id = uuid.uuid4()
    new_recipe = Recipe(
        id=new_id,
        title=(refined.get("title") or winner.title)[:500],
        description=(refined.get("description") or "")[:1000],
        cooking_time=refined.get("cooking_time") or winner.cooking_time,
        servings=refined.get("servings") or winner.servings,
        difficulty=refined.get("difficulty") or "medium",
        image_url=winner.image_url or image_url,
        keyword=winner.keyword or keyword,
        source="llm-canonical",
        status="approved",
        author_id=admin_id,
        is_canonical=True,
        canonical_dish_slug=slug,
        variant_label=variant_label,
        is_dessert=False,
        llm_judge_score=score,
        llm_judge_reason=reason,
        derived_from_recipe_id=winner.id,
        refinement_notes=refined.get("refinement_notes"),
        is_manually_reviewed=False,
    )
    db.add(new_recipe)
    await db.flush()

    # Insert ingredients
    refined_ings = refined.get("ingredients") or []
    if refined_ings:
        for i, item in enumerate(refined_ings):
            if isinstance(item, str):
                display = item
                name = None
                qty = None
            else:
                display = (
                    item.get("display_text")
                    or " ".join(
                        x for x in [item.get("quantity"), item.get("ingredient_name") or item.get("name")] if x
                    )
                    or ""
                )
                name = item.get("ingredient_name") or item.get("name")
                qty = item.get("quantity") or item.get("amount")
            if not display:
                continue
            db.add(
                RecipeIngredient(
                    id=uuid.uuid4(),
                    recipe_id=new_id,
                    display_text=display[:1000],
                    ingredient_name=(name[:500] if name else None),
                    quantity=(qty[:200] if qty else None),
                    order_index=i,
                )
            )
    else:
        # Fall back to winner's
        for i, ing in enumerate(winner.ingredients or []):
            db.add(
                RecipeIngredient(
                    id=uuid.uuid4(),
                    recipe_id=new_id,
                    display_text=ing.display_text,
                    ingredient_name=ing.ingredient_name,
                    quantity=ing.quantity,
                    order_index=i,
                )
            )

    # Insert steps
    refined_steps = refined.get("steps") or []
    if refined_steps:
        for i, item in enumerate(refined_steps, start=1):
            if isinstance(item, str):
                content = item
                num = i
            else:
                content = item.get("content") or item.get("instruction") or item.get("description") or ""
                num = item.get("step_number") or item.get("order") or i
            if not content:
                continue
            db.add(
                RecipeStep(
                    id=uuid.uuid4(),
                    recipe_id=new_id,
                    step_number=int(num),
                    content=content,
                )
            )
    else:
        for s in (winner.steps or []):
            db.add(
                RecipeStep(
                    id=uuid.uuid4(),
                    recipe_id=new_id,
                    step_number=s.step_number,
                    content=s.content,
                )
            )

    await db.commit()
    log.info(f"  + canonical {slug}: {new_recipe.title[:60]}")
    return True


async def main(limit: int | None = None) -> None:
    async with AsyncSessionLocal() as db:
        admin_id = await get_admin_user(db)

        # Phase 3 (expanded): no whitelist filter — process every clean
        # canonical_dish_slug bucket with enough data. Keep dessert filter.
        whitelist = set(CLASS_DISPLAY_NAMES.keys())
        log.info(f"Display-name whitelist: {len(whitelist)} slugs (used only for display lookup)")

        result = await db.execute(
            select(Recipe.canonical_dish_slug, func.count(Recipe.id).label("cnt"))
            .where(
                Recipe.canonical_dish_slug.is_not(None),
                Recipe.is_dessert.is_(False),
            )
            .group_by(Recipe.canonical_dish_slug)
            .having(func.count(Recipe.id) >= 3)  # min cluster size
            .order_by(func.count(Recipe.id).desc())
        )
        rows = result.all()

        slugs_to_process = []
        for row in rows:
            slug = row[0]
            parts = slug.split("-")
            parent_kw = parts[0]
            for end in range(len(parts), 0, -1):
                test_kw = "-".join(parts[:end])
                if test_kw in whitelist:
                    parent_kw = test_kw
                    break
            # Fall back to humanized slug if no display name in whitelist
            display = CLASS_DISPLAY_NAMES.get(parent_kw) or slug.replace("-", " ").title()
            slugs_to_process.append((slug, display))

        log.info(f"Total {len(slugs_to_process)} buckets after threshold (>=3 recipes)")
        if limit:
            slugs_to_process = slugs_to_process[:limit]
            log.info(f"LIMIT={limit} (dry-run)")

        created = 0
        for slug, display in slugs_to_process:
            if estimated_cost > COST_CEILING_USD:
                log.warning(f"COST CEILING reached (${estimated_cost:.2f}), stopping")
                break
            if await process_dish(db, slug, display, admin_id):
                created += 1

        log.info(f"DONE. Created {created} canonical recipes. Est. cost ${estimated_cost:.2f}")


if __name__ == "__main__":
    import sys

    limit = int(sys.argv[1]) if len(sys.argv) > 1 else None
    asyncio.run(main(limit))
