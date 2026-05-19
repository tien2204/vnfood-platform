"""Replace watermarked Cookpad og-image URLs with clean img-global URLs.

Problem: ~10% of imported Cookpad recipes have image_url pointing to
  https://og-image.cookpad.com/global/vn/recipe/<id>?t=<ts>
which is a social-card image with Cookpad watermark + author name baked
into the photo. The clean original photo lives at
  https://img-global.cpcdn.com/recipes/<hash>/1200x630cq80/photo.jpg

og-image hash is generated server-side from recipe id, NOT derivable from
URL — must fetch each recipe page and parse the real image URL.

Strategy: scrape JSON-LD <script type="application/ld+json"> for the
Recipe.image field (always clean). Fallback to <picture>/<img> in DOM.

Resumable via WHERE image_url LIKE 'https://og-image.cookpad.com/%'.
Commits in batches of 50.

Usage:
    python -m scripts.fix_cookpad_images [--limit N] [--sleep N] [--no-headless]
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

OG_IMAGE_PREFIX = "https://og-image.cookpad.com/"
CLEAN_HOST = "img-global.cpcdn.com"


def _extract_clean_url(value) -> Optional[str]:
    """Recursively pull the first URL containing img-global.cpcdn.com out of
    a JSON-LD value (which may be a string, list, or ImageObject dict)."""
    if isinstance(value, str):
        return value if CLEAN_HOST in value else None
    if isinstance(value, list):
        for item in value:
            found = _extract_clean_url(item)
            if found:
                return found
        return None
    if isinstance(value, dict):
        # ImageObject: {"@type": "ImageObject", "url": "..."}
        url = value.get("url") or value.get("contentUrl")
        if url:
            return _extract_clean_url(url)
    return None


async def parse_clean_image(page) -> Optional[str]:
    """Try JSON-LD first, then DOM fallbacks."""
    # Strategy 1: JSON-LD
    try:
        ld_elements = await page.query_selector_all('script[type="application/ld+json"]')
        for el in ld_elements:
            raw = await el.inner_text()
            try:
                data = json.loads(raw)
            except Exception:
                continue
            candidates = data if isinstance(data, list) else [data]
            for candidate in candidates:
                if not isinstance(candidate, dict):
                    continue
                if "image" in candidate:
                    found = _extract_clean_url(candidate["image"])
                    if found:
                        return found
    except Exception as e:
        logger.debug(f"JSON-LD parse failed: {e}")

    # Strategy 2: <picture> or <img> in DOM with img-global host
    try:
        # Cookpad uses <picture><img src="..."> for hero
        imgs = await page.query_selector_all('img')
        for img in imgs:
            src = await img.get_attribute("src")
            if src and CLEAN_HOST in src:
                return src
    except Exception:
        pass

    # Strategy 3: meta og:image:secure_url (sometimes different from og:image)
    try:
        meta = await page.query_selector('meta[property="og:image:secure_url"]')
        if meta:
            content = await meta.get_attribute("content")
            if content and CLEAN_HOST in content:
                return content
    except Exception:
        pass

    return None


async def scrape_image(page, url: str) -> tuple[str, Optional[str]]:
    """Return (status, clean_url).

    status:
      "ok"     — clean URL parsed
      "empty"  — page loaded but no img-global URL found → keep watermarked
      "skip"   — recipe deleted (404) → keep watermarked
      "error"  — timeout / network → retry later
    """
    try:
        response = await page.goto(url, wait_until="domcontentloaded", timeout=PAGE_TIMEOUT)
        await page.wait_for_timeout(1500)
        if response and response.status == 404:
            return "skip", None
        clean = await parse_clean_image(page)
        if clean:
            return "ok", clean
        return "empty", None
    except PWTimeout:
        return "error", None
    except Exception as e:
        logger.warning(f"Unexpected error on {url}: {e}")
        return "error", None


async def fetch_batch(db: AsyncSession, batch_size: int) -> list[tuple]:
    result = await db.execute(
        select(Recipe.id, Recipe.cookpad_url)
        .where(Recipe.source == "cookpad")
        .where(Recipe.image_url.like(f"{OG_IMAGE_PREFIX}%"))
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
                    logger.info("No more rows with og-image URLs. Done.")
                    break

                pending_updates = 0
                for idx, (recipe_id, cookpad_url) in enumerate(batch, start=1):
                    status, clean_url = await scrape_image(page, cookpad_url)
                    counts[status] += 1
                    total_processed += 1

                    if status == "ok" and clean_url:
                        await db.execute(
                            update(Recipe)
                            .where(Recipe.id == recipe_id)
                            .values(image_url=clean_url)
                        )
                        pending_updates += 1
                        logger.info(f"[{total_processed}] ok    {recipe_id} -> {clean_url}")
                    elif status == "skip":
                        logger.info(f"[{total_processed}] skip  {recipe_id} (404, keeping og-image URL)")
                    elif status == "empty":
                        logger.info(f"[{total_processed}] empty {recipe_id} (no img-global found, keeping og-image)")
                    else:
                        logger.warning(f"[{total_processed}] error {recipe_id} (will retry next run)")

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
