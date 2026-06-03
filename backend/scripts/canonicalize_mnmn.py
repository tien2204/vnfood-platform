"""Auto-discover canonical dishes from imported monngonmoingay recipes.

Per MNMN dish slug:
  - judge+refine the MNMN candidate(s) -> a new canonical (source='llm-canonical')
    with meal_types (LLM-classified sang/trua/toi).
  - If the slug already has a canonical (one of the 405): demote the old one
    (is_canonical=False, NOT deleted) and promote the MNMN one (same slug) so
    AI<=lookup and 1-canonical-per-slug invariants hold.
Idempotent via a done-slug state file. Set MNMN_LIMIT=N to cap (testing).

Run from backend:
    python -m scripts.canonicalize_mnmn
"""
import asyncio
import json
import os
import sys
import uuid
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

from openai import AsyncOpenAI  # noqa: E402
from sqlalchemy import select, update  # noqa: E402
from sqlalchemy.orm import selectinload  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.core.database import AsyncSessionLocal  # noqa: E402
from app.models.recipe import Recipe, RecipeIngredient, RecipeStep  # noqa: E402
import scripts.select_canonical_recipes as pipe  # noqa: E402

DONE_FILE = Path(__file__).resolve().parents[2] / "cookpad_recipe" / "_mnmn_canon_done.json"
LIMIT = int(os.environ.get("MNMN_LIMIT", "0"))
VALID_MEALS = {"sang", "trua", "toi"}


def load_done() -> set[str]:
    return set(json.loads(DONE_FILE.read_text(encoding="utf-8"))) if DONE_FILE.exists() else set()


def save_done(done: set[str]) -> None:
    DONE_FILE.write_text(json.dumps(sorted(done), ensure_ascii=False, indent=2), encoding="utf-8")


async def classify_meal_types(client: AsyncOpenAI, title: str) -> list[str]:
    """One cheap call: which of sang/trua/toi this Vietnamese dish suits."""
    try:
        resp = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{
                "role": "user",
                "content": (
                    "Món ăn Việt Nam: \"" + title + "\". "
                    "Món này hợp bữa nào? Trả về JSON object {\"meals\": [...]} với các giá trị con "
                    "trong [\"sang\",\"trua\",\"toi\"] (sáng/trưa/tối). Có thể nhiều bữa. Chỉ JSON."
                ),
            }],
            response_format={"type": "json_object"},
            temperature=0,
        )
        data = json.loads(resp.choices[0].message.content)
        meals = [m for m in (data.get("meals") or []) if m in VALID_MEALS]
        return meals or ["trua", "toi"]
    except Exception:
        return ["trua", "toi"]  # safe default for a main dish


async def mnmn_slugs(db) -> list[str]:
    rows = (await db.execute(
        select(Recipe.canonical_dish_slug)
        .where(Recipe.source == "monngonmoingay", Recipe.is_canonical.is_(False))
        .distinct()
    )).all()
    return [s for (s,) in rows if s]


async def candidates_for(db, slug: str) -> list[Recipe]:
    res = (await db.execute(
        select(Recipe)
        .options(selectinload(Recipe.ingredients), selectinload(Recipe.steps))
        .where(
            Recipe.source == "monngonmoingay",
            Recipe.is_canonical.is_(False),
            Recipe.canonical_dish_slug == slug,
        )
        .limit(5)
    )).scalars().all()
    return list(res)


async def existing_canonical_id(db, slug: str):
    return (await db.execute(
        select(Recipe.id).where(Recipe.is_canonical.is_(True), Recipe.canonical_dish_slug == slug)
    )).scalar_one_or_none()


async def main() -> None:
    done = load_done()
    client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    async with AsyncSessionLocal() as db:
        admin_id = await pipe.get_admin_user(db)
        slugs = [s for s in await mnmn_slugs(db) if s not in done]
        if LIMIT:
            slugs = slugs[:LIMIT]
        print(f"Slugs to canonicalize: {len(slugs)}")
        new_count = replaced = 0
        for slug in slugs:
            if pipe.estimated_cost > pipe.COST_CEILING_USD:
                print(f"COST CEILING ${pipe.estimated_cost:.2f} reached, stopping")
                break
            try:
                cands = await candidates_for(db, slug)
                if not cands:
                    done.add(slug)
                    continue
                display = cands[0].title
                judged = await pipe.judge_candidates(display, cands)
                if not judged:
                    done.add(slug)
                    continue
                sel_idx, score, reason = judged
                winner = cands[sel_idx]
                refined = await pipe.refine_recipe(winner)
                if not refined:
                    done.add(slug)
                    continue
                meals = await classify_meal_types(client, refined.get("title") or display)

                old_id = await existing_canonical_id(db, slug)
                if old_id is not None:
                    await db.execute(update(Recipe).where(Recipe.id == old_id).values(is_canonical=False))

                nid = uuid.uuid4()
                db.add(Recipe(
                    id=nid,
                    title=(refined.get("title") or winner.title)[:500],
                    description=(refined.get("description") or "")[:1000],
                    cooking_time=refined.get("cooking_time") or winner.cooking_time,
                    servings=refined.get("servings") or winner.servings,
                    difficulty=refined.get("difficulty") or winner.difficulty or "medium",
                    image_url=winner.image_url,
                    video_url=winner.video_url,
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
                    meal_types=meals,
                ))
                await db.flush()
                for i, item in enumerate(refined.get("ingredients") or []):
                    txt = item if isinstance(item, str) else (
                        item.get("display_text")
                        or " ".join(x for x in [item.get("quantity"), item.get("ingredient_name")] if x)
                    )
                    if txt:
                        db.add(RecipeIngredient(id=uuid.uuid4(), recipe_id=nid, display_text=txt[:1000], order_index=i))
                for i, item in enumerate(refined.get("steps") or [], start=1):
                    content = item if isinstance(item, str) else (item.get("content") or item.get("instruction") or "")
                    if content:
                        num = i if isinstance(item, str) else int(item.get("step_number") or i)
                        db.add(RecipeStep(id=uuid.uuid4(), recipe_id=nid, step_number=num, content=content[:4000]))
                await db.commit()
                done.add(slug)
                save_done(done)
                if old_id is not None:
                    replaced += 1
                    print(f"  ~ replaced canonical {slug} (score={score:.1f}, meals={meals})")
                else:
                    new_count += 1
                    print(f"  + new canonical {slug} (score={score:.1f}, meals={meals})")
            except Exception as e:
                await db.rollback()
                print(f"  [ERR] {slug}: {e}")
        save_done(done)
        print(f"\nDONE. new={new_count} replaced={replaced} est.cost ${pipe.estimated_cost:.2f}")


if __name__ == "__main__":
    asyncio.run(main())
