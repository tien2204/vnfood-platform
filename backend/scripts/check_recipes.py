"""
Verify imported recipes in DB.

Run from backend/ directory:
  python scripts/check_recipes.py
"""
import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import func, select, text

from app.core.database import AsyncSessionLocal
from app.models.recipe import Recipe, RecipeIngredient, RecipeStep


async def check() -> None:
    async with AsyncSessionLocal() as db:
        # --- totals ---
        total_recipes = (await db.execute(select(func.count()).select_from(Recipe))).scalar()
        total_ingredients = (await db.execute(select(func.count()).select_from(RecipeIngredient))).scalar()
        total_steps = (await db.execute(select(func.count()).select_from(RecipeStep))).scalar()

        # --- by source ---
        by_source = (
            await db.execute(
                select(Recipe.source, func.count().label("n"))
                .group_by(Recipe.source)
                .order_by(text("n DESC"))
            )
        ).fetchall()

        # --- by keyword ---
        by_keyword = (
            await db.execute(
                select(Recipe.keyword, func.count().label("n"))
                .group_by(Recipe.keyword)
                .order_by(text("n DESC"))
            )
        ).fetchall()

        # --- by status ---
        by_status = (
            await db.execute(
                select(Recipe.status, func.count().label("n"))
                .group_by(Recipe.status)
                .order_by(text("n DESC"))
            )
        ).fetchall()

    # --- print ---
    print("=" * 44)
    print(f"  Total recipes     : {total_recipes:>8,}")
    print(f"  Total ingredients : {total_ingredients:>8,}")
    print(f"  Total steps       : {total_steps:>8,}")

    print("\n--- By source ---")
    _print_table(["source", "count"], by_source)

    print("\n--- By status ---")
    _print_table(["status", "count"], by_status)

    print("\n--- By keyword ---")
    _print_table(["keyword", "count"], by_keyword)
    print("=" * 44)


def _print_table(headers: list[str], rows: list) -> None:
    col_w = [max(len(str(h)), max((len(str(r[i])) for r in rows), default=0)) for i, h in enumerate(headers)]
    fmt = "  " + "  ".join(f"{{:<{w}}}" for w in col_w)
    sep = "  " + "  ".join("-" * w for w in col_w)
    print(fmt.format(*headers))
    print(sep)
    for row in rows:
        print(fmt.format(*[str(v) if v is not None else "NULL" for v in row]))


if __name__ == "__main__":
    asyncio.run(check())
