"""Startup invariant: verify every known class slug has a canonical approved recipe.

Stores the last computed coverage for /ai/health and caches the set of slugs that
DO have a canonical recipe (used by dish_resolver to gate tentative/openai tiers)."""
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.class_names import GROUP_CLASSES
from app.models.recipe import Recipe
from app.services import dish_resolver

logger = logging.getLogger(__name__)

# Last computed coverage, surfaced by /ai/health.
LAST_COVERAGE: dict = {"total": 0, "covered": 0, "missing": []}


def unique_class_slugs() -> set[str]:
    """Distinct slugs across all groups (slugs like banh-canh appear in 2 groups)."""
    return {slug for slugs in GROUP_CLASSES.values() for slug in slugs}


async def compute_canonical_coverage(db: AsyncSession) -> dict:
    global LAST_COVERAGE
    slugs = unique_class_slugs()
    rows = (await db.execute(
        select(Recipe.canonical_dish_slug).where(
            Recipe.is_canonical.is_(True),
            Recipe.status == "approved",
            Recipe.canonical_dish_slug.in_(slugs),
        )
    )).scalars().all()
    covered = {s for s in rows if s}
    missing = sorted(slugs - covered)

    dish_resolver.set_canonical_slugs(covered)
    LAST_COVERAGE = {"total": len(slugs), "covered": len(covered), "missing": missing}

    if missing:
        logger.warning(
            "Canonical coverage gap: %d/%d slugs missing a canonical approved recipe: %s",
            len(missing), len(slugs), missing,
        )
    else:
        logger.info("Canonical coverage OK: %d/%d slugs", len(covered), len(slugs))
    return LAST_COVERAGE
