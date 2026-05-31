"""Regression harness for canonical subset invariants. Exit 0 = all pass."""
import asyncio
import sys
import unicodedata
from collections import Counter

sys.stdout.reconfigure(encoding="utf-8")

from sqlalchemy import select  # noqa: E402
from sqlalchemy.orm import selectinload  # noqa: E402
from app.core.database import AsyncSessionLocal  # noqa: E402
from app.models.recipe import Recipe  # noqa: E402
from app.ai.class_names import CLASS_DISPLAY_NAMES  # noqa: E402


def norm_title(t: str) -> str:
    t = unicodedata.normalize("NFKD", t or "")
    t = "".join(c for c in t if not unicodedata.combining(c))
    t = t.lower().replace("đ", "d").replace("Đ", "d")
    return " ".join(t.split())


async def main() -> int:
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(
            select(Recipe)
            .where(Recipe.is_canonical.is_(True))
            .options(selectinload(Recipe.ingredients), selectinload(Recipe.steps))
        )).scalars().all()

    total = len(rows)
    slug_counter = Counter(r.canonical_dish_slug for r in rows)
    source_counter = Counter(r.source for r in rows)
    ai = list(CLASS_DISPLAY_NAMES.keys())

    missing = [s for s in ai if slug_counter.get(s, 0) == 0]
    dup_slug = {s: c for s, c in slug_counter.items() if s in CLASS_DISPLAY_NAMES and c > 1}

    title_counter = Counter(norm_title(r.title) for r in rows)
    dup_titles = {t: c for t, c in title_counter.items() if c > 1}

    no_children = [r.title for r in rows if not r.ingredients or not r.steps]

    print(f"Total canonical: {total}")
    print(f"Source breakdown: {dict(source_counter)}")
    print(f"AI classes covered: {len(ai) - len(missing)}/{len(ai)}")
    print(f"AI classes MISSING ({len(missing)}): {missing}")
    print(f"AI slugs with >1 canonical ({len(dup_slug)}): {dup_slug}")
    print(f"Duplicate-title clusters ({len(dup_titles)}): {dup_titles}")
    print(f"Canonical missing ingredients/steps ({len(no_children)}): {no_children[:10]}")

    ok = (not missing) and (not dup_slug) and (not dup_titles) and (not no_children)
    print("\nRESULT:", "PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
