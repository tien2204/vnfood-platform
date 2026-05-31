"""Phase 2b: import cookpad_recipe/missing_*.json into DB as community recipes
(source='cookpad', status='approved') tagged with canonical_dish_slug = AI slug.
Idempotent by cookpad_url (skips already-imported).

Run from backend:
    python -m scripts.import_missing_crawled
"""
import asyncio
import json
import sys
import uuid
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

from sqlalchemy import select  # noqa: E402
from app.core.database import AsyncSessionLocal  # noqa: E402
from app.models.recipe import Recipe, RecipeIngredient, RecipeStep  # noqa: E402

DATA_DIR = Path(__file__).resolve().parents[2] / "cookpad_recipe"


async def main() -> None:
    files = sorted(DATA_DIR.glob("missing_*.json"))
    print(f"Found {len(files)} crawl files")
    inserted = 0
    skipped = 0
    async with AsyncSessionLocal() as db:
        existing_urls = {u for (u,) in (await db.execute(
            select(Recipe.cookpad_url).where(Recipe.cookpad_url.is_not(None))
        )).all()}

        for fp in files:
            records = json.loads(fp.read_text(encoding="utf-8"))
            for rec in records:
                url = rec.get("cookpad_url")
                if not url or url in existing_urls:
                    skipped += 1
                    continue
                rid = uuid.uuid4()
                db.add(Recipe(
                    id=rid,
                    title=rec["name"][:500],
                    description=(rec.get("description") or "")[:2000],
                    source="cookpad",
                    status="approved",
                    cookpad_url=url,
                    keyword=rec.get("keyword"),
                    canonical_dish_slug=rec["slug"],
                    image_url=rec.get("image_url") or None,
                    is_canonical=False,
                    is_dessert=False,
                ))
                for i, ing in enumerate(rec.get("ingredients_display") or []):
                    if not ing.strip():
                        continue
                    db.add(RecipeIngredient(
                        id=uuid.uuid4(), recipe_id=rid,
                        display_text=ing[:1000], order_index=i,
                    ))
                for i, step in enumerate(rec.get("instructions") or [], start=1):
                    if not step.strip():
                        continue
                    db.add(RecipeStep(
                        id=uuid.uuid4(), recipe_id=rid,
                        step_number=i, content=step[:4000],
                    ))
                existing_urls.add(url)
                inserted += 1
            await db.commit()
            print(f"  {fp.name}: cumulative inserted={inserted}")
    print(f"\nDONE. inserted={inserted} skipped={skipped}")


if __name__ == "__main__":
    asyncio.run(main())
