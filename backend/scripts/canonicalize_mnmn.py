"""Promote imported monngonmoingay recipes to canonical AS-IS (verbatim).

MNMN is already curated, so we do NOT LLM-rewrite its content — the original
Nguyên liệu / Sơ chế / Thực hiện / Cách dùng / Mách nhỏ is kept exactly. Per dish
slug:
  - pick the richest MNMN candidate, flip is_canonical=True in place + tag
    meal_types (sang/trua/toi — a label only, does not touch the recipe content).
  - if the slug already has a canonical (one of the 405): demote the old one
    (is_canonical=False, NOT deleted) so the slug keeps exactly one canonical
    (AI<=lookup + 1-canonical-per-slug invariants hold; slug never changes).
Idempotent via a done-slug state file. Set MNMN_LIMIT=N to cap (testing).

Run from backend:
    python -m scripts.canonicalize_mnmn
"""
import asyncio
import json
import os
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

from openai import AsyncOpenAI  # noqa: E402
from sqlalchemy import select, update  # noqa: E402
from sqlalchemy.orm import selectinload  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.core.database import AsyncSessionLocal  # noqa: E402
from app.models.recipe import Recipe  # noqa: E402
import scripts.select_canonical_recipes as pipe  # noqa: E402  (get_admin_user only)

DONE_FILE = Path(__file__).resolve().parents[2] / "cookpad_recipe" / "_mnmn_canon_done.json"
LIMIT = int(os.environ.get("MNMN_LIMIT", "0"))
VALID_MEALS = {"sang", "trua", "toi"}


def load_done() -> set[str]:
    return set(json.loads(DONE_FILE.read_text(encoding="utf-8"))) if DONE_FILE.exists() else set()


def save_done(done: set[str]) -> None:
    DONE_FILE.write_text(json.dumps(sorted(done), ensure_ascii=False, indent=2), encoding="utf-8")


async def classify_meal_types(client: AsyncOpenAI, title: str) -> list[str]:
    """One cheap call to tag which of sang/trua/toi the dish suits (label only)."""
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
    )).scalars().all()
    return list(res)


async def existing_canonical_id(db, slug: str):
    return (await db.execute(
        select(Recipe.id).where(Recipe.is_canonical.is_(True), Recipe.canonical_dish_slug == slug)
    )).scalar_one_or_none()


def _richness(r: Recipe) -> int:
    return len(r.ingredients) + len(r.steps)


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
            try:
                cands = await candidates_for(db, slug)
                if not cands:
                    done.add(slug)
                    continue
                winner = max(cands, key=_richness)  # richest MNMN recipe for this dish
                meals = await classify_meal_types(client, winner.title)

                old_id = await existing_canonical_id(db, slug)
                if old_id is not None and old_id != winner.id:
                    # MNMN wins on overlap: demote the old canonical (keep slug).
                    await db.execute(update(Recipe).where(Recipe.id == old_id).values(is_canonical=False))

                # Promote the MNMN recipe in place — content (ingredients/steps) untouched.
                await db.execute(update(Recipe).where(Recipe.id == winner.id).values(
                    is_canonical=True,
                    meal_types=meals,
                    author_id=admin_id,
                ))
                await db.commit()
                done.add(slug)
                save_done(done)
                if old_id is not None and old_id != winner.id:
                    replaced += 1
                    print(f"  ~ replaced canonical {slug} (meals={meals})")
                else:
                    new_count += 1
                    print(f"  + new canonical {slug} (meals={meals})")
            except Exception as e:
                await db.rollback()
                print(f"  [ERR] {slug}: {e}")
        save_done(done)
        print(f"\nDONE. new={new_count} replaced={replaced} (verbatim promote, no LLM rewrite)")


if __name__ == "__main__":
    asyncio.run(main())
