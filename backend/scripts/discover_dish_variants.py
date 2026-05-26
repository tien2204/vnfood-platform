"""Discover dish variants (regional + protein) and assign canonical_dish_slug.

Algorithm:
1. Skip is_dessert recipes
2. For each (non-dessert) recipe, detect (region, protein) from title
3. Tentative canonical_dish_slug = keyword[-region][-protein]
4. Threshold: cluster needs >= MIN_VARIANT_CLUSTER (5) recipes;
   else fall back to bare keyword (no variant)
5. UPDATE recipes.canonical_dish_slug + variant_label
"""
import asyncio
import logging
from collections import defaultdict
from sqlalchemy import select, update
from app.core.database import AsyncSessionLocal
from app.core.variant_config import (
    detect_variants, build_canonical_slug, build_variant_label, MIN_VARIANT_CLUSTER
)
from app.models.recipe import Recipe

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
log = logging.getLogger("variants")


async def discover() -> None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Recipe.id, Recipe.keyword, Recipe.title)
            .where(Recipe.is_dessert.is_(False), Recipe.keyword.is_not(None))
        )
        rows = result.all()
        log.info(f"Processing {len(rows)} non-dessert recipes with keyword")

        # Pass 1: tentative slug per recipe
        tentative: dict = {}  # recipe_id -> (slug, region, protein, keyword)
        cluster_counts: dict = defaultdict(int)

        for row in rows:
            region, protein = detect_variants(row.title or "")
            slug = build_canonical_slug(row.keyword, region, protein)
            tentative[row.id] = (slug, region, protein, row.keyword)
            cluster_counts[slug] += 1

        # Pass 2: collapse small clusters
        final: dict = {}  # recipe_id -> (final_slug, variant_label)
        collapsed_count = 0
        for rid, (slug, region, protein, kw) in tentative.items():
            if cluster_counts[slug] >= MIN_VARIANT_CLUSTER:
                final[rid] = (slug, build_variant_label(region, protein))
            else:
                final[rid] = (kw, None)
                collapsed_count += 1

        log.info(f"Collapsed {collapsed_count} recipes from sub-threshold variants to parent keyword")

        # Distribution
        final_clusters: dict = defaultdict(int)
        for slug, _ in final.values():
            final_clusters[slug] += 1

        log.info(f"Final clusters: {len(final_clusters)} distinct canonical_dish_slug")
        log.info("Top 30:")
        for slug, cnt in sorted(final_clusters.items(), key=lambda x: -x[1])[:30]:
            log.info(f"  {slug:<45} {cnt}")

        # Batch update
        log.info(f"Updating {len(final)} recipes")
        BATCH = 200
        items = list(final.items())
        for i in range(0, len(items), BATCH):
            batch = items[i:i+BATCH]
            for rid, (slug, label) in batch:
                await db.execute(
                    update(Recipe).where(Recipe.id == rid).values(
                        canonical_dish_slug=slug, variant_label=label
                    )
                )
            await db.commit()
            if (i // BATCH) % 10 == 0:
                log.info(f"  ... {i + len(batch)}/{len(items)}")

        log.info("Done")


if __name__ == "__main__":
    asyncio.run(discover())
