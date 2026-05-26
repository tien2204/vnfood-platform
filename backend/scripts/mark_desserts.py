"""Mark recipes as desserts based on patterns (kem, cupcake, etc).

Idempotent: skips recipes already marked.
"""
import asyncio
import logging
from sqlalchemy import select, update
from app.core.database import AsyncSessionLocal
from app.core.dessert_blacklist import is_dessert
from app.models.recipe import Recipe

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
log = logging.getLogger("desserts")


async def mark() -> None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Recipe.id, Recipe.keyword, Recipe.title)
            .where(Recipe.is_dessert.is_(False))
        )
        rows = result.all()
        log.info(f"Scanning {len(rows)} recipes")

        marked_ids: list = []
        for row in rows:
            if is_dessert(row.keyword, row.title):
                marked_ids.append(row.id)

        log.info(f"Marking {len(marked_ids)} as dessert")
        if marked_ids:
            BATCH = 500
            for i in range(0, len(marked_ids), BATCH):
                batch = marked_ids[i:i+BATCH]
                await db.execute(
                    update(Recipe).where(Recipe.id.in_(batch)).values(is_dessert=True)
                )
            await db.commit()

        log.info("Done")


if __name__ == "__main__":
    asyncio.run(mark())
