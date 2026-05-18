"""Enrich recipes.original_author_name by scraping Cookpad recipe pages.

Uses Playwright Chromium (same approach as crawl_general_recipes.py) to
bypass 403 Forbidden. Resumable: only fetches rows where
original_author_name IS NULL. Commits in batches of 50.

Robots.txt compliance: Cookpad robots.txt allows User-agent: * on /
(recipe pages NOT in disallow list). We use a realistic Chrome 124 UA,
not an AI-bot UA (GPTBot/Claude-Web are explicitly blocked but a vanilla
Chrome UA is not). Sleep 2s between requests.

Usage:
    python -m scripts.enrich_cookpad_authors [--limit N] [--sleep N] [--no-headless]
"""
import argparse
import asyncio
import json
import logging
from typing import Optional

from playwright.async_api import async_playwright, TimeoutError as PWTimeout
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.models.recipe import Recipe

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

SLEEP_SEC = 2
PAGE_TIMEOUT = 10000  # ms
BATCH_COMMIT = 50

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)


async def parse_author_from_page(page) -> Optional[str]:
    """Try multiple selectors to extract author name. Returns None if all fail."""
    # Strategy 1: JSON-LD
    try:
        ld_elements = await page.query_selector_all('script[type="application/ld+json"]')
        for el in ld_elements:
            raw = await el.inner_text()
            try:
                data = json.loads(raw)
            except Exception:
                continue
            # Could be a list or single object
            candidates = data if isinstance(data, list) else [data]
            for candidate in candidates:
                author = candidate.get("author")
                if not author:
                    continue
                if isinstance(author, dict) and author.get("name"):
                    return author["name"].strip()
                if isinstance(author, list) and author and isinstance(author[0], dict):
                    name = author[0].get("name")
                    if name:
                        return name.strip()
    except Exception as e:
        logger.debug(f"JSON-LD parse failed: {e}")

    # Strategy 2: link to /vn/users/...
    try:
        user_link = await page.query_selector('a[href*="/vn/users/"]')
        if user_link:
            text = (await user_link.inner_text()).strip()
            if text:
                return text
    except Exception:
        pass

    # Strategy 3: meta itemprop=author
    try:
        meta = await page.query_selector('meta[itemprop="author"]')
        if meta:
            content = await meta.get_attribute("content")
            if content and content.strip():
                return content.strip()
    except Exception:
        pass

    return None


async def scrape_author(page, url: str) -> tuple[str, Optional[str]]:
    """Return (status, author_name).

    status:
      "ok"        — parse succeeded, author_name is the parsed string
      "empty"     — page loaded but no author found → empty string ('')
      "skip"      — recipe deleted (Cookpad 404 page) → empty string ('')
      "error"     — timeout / network → None, retry later
    """
    try:
        response = await page.goto(url, wait_until="domcontentloaded", timeout=PAGE_TIMEOUT)
        await page.wait_for_timeout(1500)
        if response and response.status == 404:
            return "skip", ""
        name = await parse_author_from_page(page)
        if name:
            return "ok", name
        return "empty", ""
    except PWTimeout:
        return "error", None
    except Exception as e:
        logger.warning(f"Unexpected error on {url}: {e}")
        return "error", None


async def fetch_batch(db: AsyncSession, batch_size: int) -> list[tuple]:
    result = await db.execute(
        select(Recipe.id, Recipe.cookpad_url)
        .where(Recipe.source == "cookpad")
        .where(Recipe.original_author_name.is_(None))
        .where(Recipe.cookpad_url.is_not(None))
        .order_by(Recipe.save_count.desc().nulls_last(), Recipe.id)
        .limit(batch_size)
    )
    return list(result.all())


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=None, help="Stop after N rows (testing)")
    parser.add_argument("--sleep", type=float, default=SLEEP_SEC, help="Seconds between requests")
    parser.add_argument("--no-headless", action="store_true", help="Show browser window")
    args = parser.parse_args()

    total_processed = 0
    counts = {"ok": 0, "empty": 0, "skip": 0, "error": 0}

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            headless=not args.no_headless,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        context = await browser.new_context(
            user_agent=USER_AGENT,
            locale="vi-VN",
            viewport={"width": 1280, "height": 800},
            extra_http_headers={
                "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
            },
        )
        page = await context.new_page()

        logger.info("Warming up cookies via homepage...")
        try:
            await page.goto("https://cookpad.com/vn", wait_until="domcontentloaded", timeout=PAGE_TIMEOUT)
            await page.wait_for_timeout(2000)
        except Exception as e:
            logger.warning(f"Warm-up failed (continuing): {e}")

        async with AsyncSessionLocal() as db:
            while True:
                remaining = (args.limit - total_processed) if args.limit else BATCH_COMMIT
                batch = await fetch_batch(db, min(BATCH_COMMIT, remaining))
                if not batch:
                    logger.info("No more rows with NULL original_author_name. Done.")
                    break

                pending_updates = 0
                for idx, (recipe_id, cookpad_url) in enumerate(batch, start=1):
                    status, author_name = await scrape_author(page, cookpad_url)
                    counts[status] += 1
                    total_processed += 1

                    if status in ("ok", "empty", "skip"):
                        # All three update the DB (empty string skip-marker)
                        await db.execute(
                            update(Recipe)
                            .where(Recipe.id == recipe_id)
                            .values(original_author_name=author_name)
                        )
                        pending_updates += 1
                        logger.info(
                            f"[{total_processed}] {status:5s} {recipe_id} → "
                            f"{author_name!r}"
                        )
                    else:
                        logger.warning(f"[{total_processed}] error {recipe_id} (NULL preserved, will retry)")

                    if args.limit and total_processed >= args.limit:
                        break

                    await asyncio.sleep(args.sleep)

                if pending_updates:
                    await db.commit()
                    logger.info(
                        f"[COMMIT] {pending_updates} rows | totals "
                        f"ok={counts['ok']} empty={counts['empty']} skip={counts['skip']} error={counts['error']}"
                    )

                if args.limit and total_processed >= args.limit:
                    break

        await browser.close()

    logger.info(
        f"DONE. processed={total_processed} | "
        f"ok={counts['ok']} empty={counts['empty']} skip={counts['skip']} error={counts['error']}"
    )


if __name__ == "__main__":
    asyncio.run(main())
