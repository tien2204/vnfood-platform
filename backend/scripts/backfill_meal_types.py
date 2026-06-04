"""One-off: backfill meal_types for canonical recipes still NULL (~358), by
reusing classify_meal_types (gpt-4o-mini). Idempotent — only touches NULL rows.

Run from backend:
    python -m scripts.backfill_meal_types
"""
import asyncio
import sys

sys.stdout.reconfigure(encoding="utf-8")

from openai import AsyncOpenAI
from sqlalchemy import select, update
from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.recipe import Recipe
from scripts.canonicalize_mnmn import classify_meal_types


async def main() -> None:
    client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(
            select(Recipe.id, Recipe.title).where(
                Recipe.is_canonical.is_(True), Recipe.meal_types.is_(None)
            )
        )).all()
        print(f"to backfill: {len(rows)}")
        done = 0
        for rid, title in rows:
            try:
                meals = await classify_meal_types(client, title)
                await db.execute(update(Recipe).where(Recipe.id == rid).values(meal_types=meals))
                done += 1
                if done % 50 == 0:
                    await db.commit()
                    print(f"  {done}/{len(rows)}")
            except Exception as e:
                print(f"  [ERR] {rid}: {e}")
        await db.commit()
        print(f"DONE. backfilled {done}")


if __name__ == "__main__":
    asyncio.run(main())
