"""One-off: backfill recipes.ai_class_slug = parent 103-class slug (or NULL).

Run from backend/:  .venv/Scripts/python scripts/tag_ai_class_slug.py
Idempotent — re-running only updates rows whose computed tag changed.
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from sqlalchemy import select  # noqa: E402

from app.ai.class_names import resolve_ai_class  # noqa: E402
from app.core.database import AsyncSessionLocal  # noqa: E402
from app.models.recipe import Recipe  # noqa: E402


async def main() -> None:
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(select(Recipe))).scalars().all()
        changed = 0
        tagged = 0
        for r in rows:
            slug = resolve_ai_class(r.title, r.canonical_dish_slug)
            if slug is not None:
                tagged += 1
            if r.ai_class_slug != slug:
                r.ai_class_slug = slug
                changed += 1
        await db.commit()
        print(f"updated {changed} rows; {tagged}/{len(rows)} now have ai_class_slug")


if __name__ == "__main__":
    asyncio.run(main())
