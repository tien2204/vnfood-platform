"""Recipe suggestions from a user's taste history.

STABLE INTERFACE: suggest_recipes_for_user(...). A later "Personalization engine"
sub-project may replace the internals; keep this signature so meal plan / other
callers do not change.
"""
import uuid
from collections import Counter
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.recipe import Recipe
from app.models.social import Rating, SavedRecipe
from app.models.ai_log import AILog
from app.models.user import User
from app.services import recipe_service


async def _preferred_slugs(db: AsyncSession, user_id: uuid.UUID) -> list[str]:
    """Top canonical_dish_slug / keyword the user signalled interest in."""
    counter: Counter = Counter()

    rated = (await db.execute(
        select(Recipe.canonical_dish_slug, Recipe.keyword)
        .join(Rating, Rating.recipe_id == Recipe.id)
        .where(Rating.user_id == user_id, Rating.score >= 4)
    )).all()
    saved = (await db.execute(
        select(Recipe.canonical_dish_slug, Recipe.keyword)
        .join(SavedRecipe, SavedRecipe.recipe_id == Recipe.id)
        .where(SavedRecipe.user_id == user_id)
    )).all()
    for slug, kw in [*rated, *saved]:
        if slug:
            counter[slug] += 2
        if kw:
            counter[kw] += 1

    ai = (await db.execute(
        select(AILog.predicted_class).where(
            AILog.user_id == user_id, AILog.predicted_class.is_not(None)
        )
    )).all()
    for (pc,) in ai:
        if pc and pc != "unknown":
            counter[pc] += 1

    return [k for k, _ in counter.most_common(20)]


async def suggest_recipes_for_user(
    db: AsyncSession,
    user_id: uuid.UUID,
    n: int = 6,
    exclude_recipe_ids: Optional[set] = None,
) -> list[dict]:
    """Return up to n canonical recipe cards tailored to the user's taste.

    Falls back to popular canonical recipes when history is thin.
    """
    exclude_recipe_ids = exclude_recipe_ids or set()
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    prefs = await _preferred_slugs(db, user_id)

    base = recipe_service._base_approved_query().where(
        recipe_service.catalog_canonical_clause(), Recipe.is_dessert.is_(False)
    )

    picked: list = []
    seen: set = set(str(x) for x in exclude_recipe_ids)

    if prefs:
        pref_q = base.where(
            (Recipe.canonical_dish_slug.in_(prefs)) | (Recipe.keyword.in_(prefs))
        ).order_by(Recipe.llm_judge_score.desc().nullslast(), Recipe.avg_rating.desc()).limit(n * 3)
        for r, author in (await db.execute(pref_q)).all():
            if str(r.id) in seen:
                continue
            picked.append((r, author))
            seen.add(str(r.id))
            if len(picked) >= n:
                break

    if len(picked) < n:
        fill_q = base.order_by(
            Recipe.save_count.desc(), Recipe.avg_rating.desc()
        ).limit(n * 4)
        for r, author in (await db.execute(fill_q)).all():
            if str(r.id) in seen:
                continue
            picked.append((r, author))
            seen.add(str(r.id))
            if len(picked) >= n:
                break

    recipe_ids = [r.id for r, _ in picked]
    saved_ids = await recipe_service._get_saved_ids(db, recipe_ids, user)
    cards = [recipe_service._build_recipe_card(r, author, saved_ids, user) for r, author in picked]
    return [c.model_dump() for c in cards]
