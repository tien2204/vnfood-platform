"""Phase 2c/2d: ensure every AI class has exactly one canonical recipe.

Per missing AI slug, in order:
  1. Already canonical under this slug -> skip (idempotent).
  2. A canonical exists with the same normalized title (under a different slug)
     -> re-slug it to the AI slug (avoids creating a duplicate title).
  3. >= 1 non-canonical candidate by title -> LLM judge+refine, INSERT canonical
     (source='llm-canonical').
  4. 0 candidates -> promote curated dish_recipes.json[slug]
     (source='curated-canonical').

Run from backend:
    python -m scripts.fill_missing_canonical
"""
import asyncio
import sys
import unicodedata
import uuid

sys.stdout.reconfigure(encoding="utf-8")

from sqlalchemy import or_, select  # noqa: E402
from sqlalchemy.orm import selectinload  # noqa: E402
from app.core.database import AsyncSessionLocal  # noqa: E402
from app.models.recipe import Recipe, RecipeIngredient, RecipeStep  # noqa: E402
from app.ai.class_names import CLASS_DISPLAY_NAMES  # noqa: E402
from app.services import dish_recipe_service  # noqa: E402
import scripts.select_canonical_recipes as pipe  # noqa: E402


def norm(t: str) -> str:
    t = unicodedata.normalize("NFKD", t or "")
    t = "".join(c for c in t if not unicodedata.combining(c))
    t = t.lower().replace("đ", "d").replace("Đ", "d")
    return " ".join(t.split())


async def already_canonical(db, slug) -> bool:
    return bool((await db.execute(
        select(Recipe.id).where(Recipe.is_canonical.is_(True), Recipe.canonical_dish_slug == slug)
    )).scalar_one_or_none())


async def reslug_same_title(db, slug, display) -> bool:
    """If a canonical already has the same normalized title, re-slug it. Returns True if handled."""
    cands = (await db.execute(
        select(Recipe).where(
            Recipe.is_canonical.is_(True),
            Recipe.title.ilike(f"%{display}%"),
        )
    )).scalars().all()
    target = norm(display)
    for r in cands:
        if norm(r.title) == target:
            r.canonical_dish_slug = slug
            await db.commit()
            print(f"  reslug existing canonical -> {slug}: {r.title[:50]}")
            return True
    return False


async def gather_candidates(db, slug, display):
    # Match by the AI slug tag (crawled recipes are tagged) OR title PREFIX.
    # Prefix (not substring) avoids grabbing compound dishes where the dish name
    # is a substring, e.g. "Bò né" must not match "Bánh Mì Chảo - Bò Né".
    res = (await db.execute(
        select(Recipe)
        .options(selectinload(Recipe.ingredients), selectinload(Recipe.steps))
        .where(
            Recipe.is_canonical.is_(False),
            Recipe.is_dessert.is_(False),
            or_(
                Recipe.canonical_dish_slug == slug,
                Recipe.title.ilike(f"{display}%"),
            ),
        )
        .order_by(Recipe.save_count.desc().nullslast())
        .limit(5)
    )).scalars().all()
    return list(res)


async def insert_refined(db, slug, display, admin_id) -> bool:
    candidates = await gather_candidates(db, slug, display)
    if not candidates:
        return False
    judged = await pipe.judge_candidates(display, candidates)
    if not judged:
        return False
    sel_idx, score, reason = judged
    winner = candidates[sel_idx]
    refined = await pipe.refine_recipe(winner)
    if not refined:
        return False
    nid = uuid.uuid4()
    db.add(Recipe(
        id=nid,
        title=(refined.get("title") or winner.title)[:500],
        description=(refined.get("description") or "")[:1000],
        cooking_time=refined.get("cooking_time") or winner.cooking_time,
        servings=refined.get("servings") or winner.servings,
        difficulty=refined.get("difficulty") or "medium",
        image_url=winner.image_url,
        keyword=winner.keyword,
        source="llm-canonical",
        status="approved",
        author_id=admin_id,
        is_canonical=True,
        canonical_dish_slug=slug,
        variant_label=None,
        is_dessert=False,
        llm_judge_score=score,
        llm_judge_reason=reason,
        derived_from_recipe_id=winner.id,
        refinement_notes=refined.get("refinement_notes"),
    ))
    await db.flush()
    for i, item in enumerate(refined.get("ingredients") or []):
        display_text = item if isinstance(item, str) else (
            item.get("display_text")
            or " ".join(x for x in [item.get("quantity"), item.get("ingredient_name")] if x)
        )
        if not display_text:
            continue
        db.add(RecipeIngredient(id=uuid.uuid4(), recipe_id=nid, display_text=display_text[:1000], order_index=i))
    for i, item in enumerate(refined.get("steps") or [], start=1):
        content = item if isinstance(item, str) else (item.get("content") or item.get("instruction") or "")
        if not content:
            continue
        num = i if isinstance(item, str) else int(item.get("step_number") or i)
        db.add(RecipeStep(id=uuid.uuid4(), recipe_id=nid, step_number=num, content=content[:4000]))
    await db.commit()
    print(f"  + llm-canonical {slug}: score={score:.1f}")
    return True


async def insert_curated(db, slug, admin_id) -> bool:
    data = dish_recipe_service.DISH_RECIPES.get(slug)
    if not data:
        print(f"  [WARN] no curated entry for {slug}")
        return False
    nid = uuid.uuid4()
    db.add(Recipe(
        id=nid,
        title=(data.get("title") or slug)[:500],
        description=(data.get("description") or "")[:1000],
        cooking_time=data.get("cooking_time_minutes"),
        servings=data.get("servings"),
        difficulty=data.get("difficulty") or "medium",
        source="curated-canonical",
        status="approved",
        author_id=admin_id,
        is_canonical=True,
        canonical_dish_slug=slug,
        variant_label=None,
        is_dessert=False,
    ))
    await db.flush()
    for i, ing in enumerate(data.get("ingredients") or []):
        if not str(ing).strip():
            continue
        db.add(RecipeIngredient(id=uuid.uuid4(), recipe_id=nid, display_text=str(ing)[:1000], order_index=i))
    for i, step in enumerate(data.get("steps") or [], start=1):
        if not str(step).strip():
            continue
        db.add(RecipeStep(id=uuid.uuid4(), recipe_id=nid, step_number=i, content=str(step)[:4000]))
    await db.commit()
    print(f"  + curated-canonical {slug}")
    return True


async def main() -> None:
    dish_recipe_service.load_dish_recipes()
    async with AsyncSessionLocal() as db:
        admin_id = await pipe.get_admin_user(db)
        for slug, display in CLASS_DISPLAY_NAMES.items():
            if await already_canonical(db, slug):
                continue
            if pipe.estimated_cost > pipe.COST_CEILING_USD:
                print(f"COST CEILING ${pipe.estimated_cost:.2f} reached, stopping")
                break
            print(f"[{slug}] {display}")
            if await reslug_same_title(db, slug, display):
                continue
            if await insert_refined(db, slug, display, admin_id):
                continue
            await insert_curated(db, slug, admin_id)
        print(f"\nDONE. est. cost ${pipe.estimated_cost:.2f}")


if __name__ == "__main__":
    asyncio.run(main())
