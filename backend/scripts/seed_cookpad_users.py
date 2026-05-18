"""Seed User accounts for scraped Cookpad authors and link their recipes.

For each distinct `recipes.original_author_name` (where recipe.source='cookpad'
and recipe.author_id IS NULL), create a User row with:
  - email    = <CamelCaseNoDiacritics>@cookpad.com  (collision-suffixed)
  - username = same prefix as email (used only for full_name display fallback)
  - password = "cookpad123" (bcrypt hashed, login-able for thesis demo)
  - full_name = original_author_name (with diacritics intact)
  - role     = "user", is_active = True
  - bio      = "Tác giả Cookpad — tài khoản tự sinh"

Then UPDATE all matching recipes to point author_id → new user's id.

Resumable: filter on `author_id IS NULL` so reruns only process new authors.
If a User with the target email already exists (e.g. real signup with same
slug), suffix _2/_3/... until a unique email is found.

Usage:
    python -m scripts.seed_cookpad_users [--limit N] [--dry-run]
"""
import argparse
import asyncio
import logging
import re
import unicodedata
import uuid
from typing import Optional

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.core.security import hash_password
from app.models.recipe import Recipe
from app.models.user import User

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

PASSWORD = "cookpad123"
BIO = "Tác giả Cookpad — tài khoản tự sinh"
EMAIL_DOMAIN = "cookpad.com"


def to_username(name: str) -> str:
    """Convert 'Hoàng Thị Tố Hà' -> 'HoangThiToHa'.

    Strips diacritics, removes non-alphanumeric, CamelCases each whitespace-separated chunk.
    Returns 'user' if input has no usable characters.
    """
    normalized = unicodedata.normalize("NFKD", name)
    ascii_only = "".join(c for c in normalized if not unicodedata.combining(c))
    # Replace đ/Đ separately (NFKD doesn't decompose them)
    ascii_only = ascii_only.replace("đ", "d").replace("Đ", "D")
    chunks = re.findall(r"[A-Za-z0-9]+", ascii_only)
    if not chunks:
        return "user"
    return "".join(chunk.capitalize() for chunk in chunks)


async def find_unique_email(db: AsyncSession, base_username: str) -> str:
    """Return an email <base>@cookpad.com that doesn't exist yet, suffixing if needed."""
    base_lower = base_username.lower()
    candidate = f"{base_lower}@{EMAIL_DOMAIN}"
    suffix = 2
    while True:
        exists = (await db.execute(
            select(User.id).where(User.email == candidate)
        )).scalar_one_or_none()
        if exists is None:
            return candidate
        candidate = f"{base_lower}{suffix}@{EMAIL_DOMAIN}"
        suffix += 1


async def fetch_distinct_authors(db: AsyncSession, limit: Optional[int]) -> list[tuple[str, int]]:
    """Return [(original_author_name, recipe_count), ...] for unlinked Cookpad recipes."""
    stmt = (
        select(
            Recipe.original_author_name,
            func.count(Recipe.id).label("recipe_count"),
        )
        .where(Recipe.source == "cookpad")
        .where(Recipe.original_author_name.is_not(None))
        .where(Recipe.original_author_name != "")
        .where(Recipe.author_id.is_(None))
        .group_by(Recipe.original_author_name)
        .order_by(func.count(Recipe.id).desc(), Recipe.original_author_name)
    )
    if limit:
        stmt = stmt.limit(limit)
    return list((await db.execute(stmt)).all())


async def seed_one_author(
    db: AsyncSession,
    author_name: str,
    dry_run: bool,
) -> tuple[uuid.UUID, str, int]:
    """Create User for author_name and link their recipes. Returns (user_id, email, recipes_linked)."""
    base_username = to_username(author_name)
    email = await find_unique_email(db, base_username)

    user_id = uuid.uuid4()
    if not dry_run:
        user = User(
            id=user_id,
            email=email,
            hashed_password=hash_password(PASSWORD),
            full_name=author_name,
            avatar_url=None,
            bio=BIO,
            role="user",
            is_active=True,
        )
        db.add(user)
        await db.flush()  # Get user_id into DB before recipes UPDATE

        result = await db.execute(
            update(Recipe)
            .where(Recipe.source == "cookpad")
            .where(Recipe.original_author_name == author_name)
            .where(Recipe.author_id.is_(None))
            .values(author_id=user_id)
        )
        linked = result.rowcount
    else:
        linked = (await db.execute(
            select(func.count(Recipe.id))
            .where(Recipe.source == "cookpad")
            .where(Recipe.original_author_name == author_name)
            .where(Recipe.author_id.is_(None))
        )).scalar_one()

    return user_id, email, linked


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=None, help="Process only first N distinct authors (testing)")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be done without DB writes")
    args = parser.parse_args()

    async with AsyncSessionLocal() as db:
        authors = await fetch_distinct_authors(db, args.limit)
        if not authors:
            logger.info("No unlinked Cookpad authors found. Nothing to do.")
            return

        logger.info(
            f"Found {len(authors)} distinct authors to process"
            + (f" (limit {args.limit})" if args.limit else "")
            + (" [DRY RUN]" if args.dry_run else "")
        )

        total_users = 0
        total_recipes_linked = 0
        for idx, (author_name, recipe_count) in enumerate(authors, start=1):
            try:
                user_id, email, linked = await seed_one_author(db, author_name, args.dry_run)
            except Exception as e:
                logger.exception(f"[{idx}/{len(authors)}] FAIL {author_name!r}: {e}")
                await db.rollback()
                continue

            total_users += 1
            total_recipes_linked += linked
            logger.info(
                f"[{idx}/{len(authors)}] {'WOULD ' if args.dry_run else ''}create "
                f"{email} -> {author_name!r} ({linked} recipes linked)"
            )

            # Commit every 50 to bound transaction size
            if not args.dry_run and idx % 50 == 0:
                await db.commit()
                logger.info(f"[COMMIT] {idx} authors so far")

        if not args.dry_run:
            await db.commit()

        logger.info(
            f"DONE. authors_created={total_users} recipes_linked={total_recipes_linked}"
            + (" [DRY RUN — no DB writes]" if args.dry_run else "")
        )


if __name__ == "__main__":
    asyncio.run(main())
