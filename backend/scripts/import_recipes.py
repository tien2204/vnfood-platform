"""
Import Cookpad recipes from *_extracted.json files into DB.

Run from backend/ directory:
  python scripts/import_recipes.py --dry-run
  python scripts/import_recipes.py
  python scripts/import_recipes.py --files banh_recipe_extracted.json
"""
import argparse
import asyncio
import json
import logging
import os
import sys
import uuid
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.models.recipe import Recipe, RecipeIngredient, RecipeStep

logging.basicConfig(level=logging.WARNING, format="%(levelname)s: %(message)s")
log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Builders
# ---------------------------------------------------------------------------

def _build_recipe(raw: dict) -> Recipe:
    return Recipe(
        id=uuid.uuid4(),  # must be explicit — SQLAlchemy default runs at flush, not construction
        title=raw["name"],
        keyword=raw.get("keyword"),
        description=raw.get("description"),
        image_url=raw.get("image_url"),
        cookpad_url=raw.get("cookpad_url") or None,
        source="cookpad",
        status="approved",
        author_id=None,
        servings=2,
    )


def _build_ingredients(recipe_id, raw: dict) -> list[RecipeIngredient]:
    display_list = raw.get("ingredients_display") or []
    extract_list = raw.get("ingredients_extract") or []
    return [
        RecipeIngredient(
            recipe_id=recipe_id,
            display_text=d,
            ingredient_name=extract_list[i] if i < len(extract_list) else None,
            order_index=i,
        )
        for i, d in enumerate(display_list)
        if d and d.strip()
    ]


def _build_steps(recipe_id, raw: dict) -> list[RecipeStep]:
    instructions = raw.get("instructions") or []
    return [
        RecipeStep(
            recipe_id=recipe_id,
            step_number=i + 1,
            content=c,
            timer_seconds=0,
        )
        for i, c in enumerate(instructions)
        if c and c.strip()
    ]


# ---------------------------------------------------------------------------
# Batch flush
# ---------------------------------------------------------------------------

async def _flush_batch(db, batch: list[tuple[Recipe, dict]], counters: dict) -> None:
    """Commit one batch of recipes + their children."""
    all_objs: list = []
    for recipe, raw in batch:
        all_objs.append(recipe)
        all_objs.extend(_build_ingredients(recipe.id, raw))
        all_objs.extend(_build_steps(recipe.id, raw))

    try:
        db.add_all(all_objs)
        await db.commit()
        counters["imported"] += len(batch)
        print(
            f"  → committed {len(batch):>3} recipes "
            f"(imported so far: {counters['imported']:>6})"
        )
    except Exception as e:
        await db.rollback()
        counters["errors"] += len(batch)
        log.error("Batch commit failed (%d recipes lost): %s", len(batch), e)


# ---------------------------------------------------------------------------
# Per-file import
# ---------------------------------------------------------------------------

async def _import_file(
    db,
    fpath: Path,
    seen_urls: set[str],
    batch_size: int,
    dry_run: bool,
    counters: dict,
) -> None:
    try:
        with open(fpath, encoding="utf-8") as f:
            records = json.load(f)
    except Exception as e:
        print(f"  ERROR reading {fpath.name}: {e}")
        counters["errors"] += 1
        return

    if not isinstance(records, list):
        print(f"  ERROR: {fpath.name} is not a JSON array")
        counters["errors"] += 1
        return

    batch: list[tuple[Recipe, dict]] = []

    for raw in records:
        counters["total"] += 1
        try:
            url: str = raw.get("cookpad_url") or ""
            if url and url in seen_urls:
                counters["skipped"] += 1
                continue

            if not raw.get("name"):
                log.warning("Missing 'name' in record %s — skipped", raw.get("id", "?"))
                counters["errors"] += 1
                continue

            if url:
                seen_urls.add(url)

            rec_id = raw.get("id", raw.get("name", "")[:40])
            print(f"[{counters['total']:>6}] {rec_id}")

            if dry_run:
                counters["imported"] += 1
                continue

            recipe = _build_recipe(raw)
            batch.append((recipe, raw))

            if len(batch) >= batch_size:
                await _flush_batch(db, batch, counters)
                batch.clear()

        except Exception as e:
            log.warning("Error on record %s: %s", raw.get("id", "?"), e)
            counters["errors"] += 1

    if not dry_run and batch:
        await _flush_batch(db, batch, counters)
        batch.clear()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

async def run(folder: Path, file_filter: list[str] | None, batch_size: int, dry_run: bool) -> None:
    if file_filter:
        files = [folder / f.strip() for f in file_filter]
        files = [f for f in files if f.exists()]
    else:
        files = sorted(folder.glob("*_extracted.json"))

    if not files:
        print(f"ERROR: no *_extracted.json files found in {folder}")
        sys.exit(1)

    print(f"Files ({len(files)}): {[f.name for f in files]}")
    if dry_run:
        print("DRY RUN — nothing will be written to DB.\n")

    counters = {"total": 0, "imported": 0, "skipped": 0, "errors": 0}

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Recipe.cookpad_url).where(Recipe.cookpad_url.isnot(None))
        )
        seen_urls: set[str] = {row[0] for row in result.fetchall()}
        print(f"Already in DB: {len(seen_urls)} recipes\n")

        for fpath in files:
            print(f"\n=== {fpath.name} ===")
            await _import_file(db, fpath, seen_urls, batch_size, dry_run, counters)

    print("\n" + "=" * 44)
    print(f"  Total scanned : {counters['total']:>7}")
    print(f"  Imported      : {counters['imported']:>7}")
    print(f"  Skipped (dup) : {counters['skipped']:>7}")
    print(f"  Errors        : {counters['errors']:>7}")
    print("=" * 44)


def main() -> None:
    parser = argparse.ArgumentParser(description="Import Cookpad recipes into DB")
    parser.add_argument("--folder", default="../cookpad_recipe", help="Folder with *_extracted.json (default: ../cookpad_recipe)")
    parser.add_argument("--batch-size", type=int, default=200, help="Commit every N recipes (default: 200)")
    parser.add_argument("--dry-run", action="store_true", help="Count only, no DB writes")
    parser.add_argument("--files", help="Comma-separated filenames, e.g. banh_recipe_extracted.json,com_recipe_extracted.json")
    args = parser.parse_args()

    folder = Path(args.folder).resolve()
    file_filter = args.files.split(",") if args.files else None
    asyncio.run(run(folder, file_filter, args.batch_size, args.dry_run))


if __name__ == "__main__":
    main()
