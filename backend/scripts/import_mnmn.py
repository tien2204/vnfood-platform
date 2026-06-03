"""Import cookpad_recipe/mnmn_all.json into DB as raw recipes
(source='monngonmoingay', status='approved', is_canonical=False), tagged with
canonical_dish_slug = slugify(title). Idempotent by cookpad_url (the MNMN URL).

Run from backend:
    python -m scripts.import_mnmn
"""
import asyncio
import json
import re
import sys
import unicodedata
import uuid
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

from sqlalchemy import select  # noqa: E402
from app.core.database import AsyncSessionLocal  # noqa: E402
from app.models.recipe import Recipe, RecipeIngredient, RecipeStep  # noqa: E402

ALL_FILE = Path(__file__).resolve().parents[2] / "cookpad_recipe" / "mnmn_all.json"


def slugify(t: str) -> str:
    t = unicodedata.normalize("NFKD", t or "")
    t = "".join(c for c in t if not unicodedata.combining(c))
    t = t.lower().replace("đ", "d").replace("Đ", "d")
    t = re.sub(r"[^a-z0-9]+", "-", t).strip("-")
    return t[:80].rstrip("-")


async def main() -> None:
    records = json.loads(ALL_FILE.read_text(encoding="utf-8")) if ALL_FILE.exists() else []
    print(f"Records in mnmn_all.json: {len(records)}")
    inserted = 0
    skipped = 0
    async with AsyncSessionLocal() as db:
        existing_urls = {u for (u,) in (await db.execute(
            select(Recipe.cookpad_url).where(Recipe.cookpad_url.is_not(None))
        )).all()}

        for rec in records:
            url = rec.get("url")
            name = (rec.get("name") or "").strip()
            slug = slugify(name)
            if not url or not name or not slug or url in existing_urls:
                skipped += 1
                continue
            rid = uuid.uuid4()
            db.add(Recipe(
                id=rid,
                title=name[:500],
                description=(rec.get("description") or "")[:2000],
                source="monngonmoingay",
                status="approved",
                cookpad_url=url,
                canonical_dish_slug=slug,
                image_url=rec.get("image_url") or None,
                video_url=rec.get("video_url"),
                cooking_time=rec.get("cooking_time"),
                servings=rec.get("servings"),
                difficulty=rec.get("difficulty"),
                is_canonical=False,
                is_dessert=False,
            ))
            for i, ing in enumerate(rec.get("ingredients_display") or []):
                if not str(ing).strip():
                    continue
                db.add(RecipeIngredient(id=uuid.uuid4(), recipe_id=rid, display_text=str(ing)[:1000], order_index=i))
            for i, step in enumerate(rec.get("instructions") or [], start=1):
                if not str(step).strip():
                    continue
                db.add(RecipeStep(id=uuid.uuid4(), recipe_id=rid, step_number=i, content=str(step)[:4000]))
            existing_urls.add(url)
            inserted += 1
            if inserted % 200 == 0:
                await db.commit()
                print(f"  cumulative inserted={inserted}")
        await db.commit()
    print(f"\nDONE. inserted={inserted} skipped={skipped}")


if __name__ == "__main__":
    asyncio.run(main())
