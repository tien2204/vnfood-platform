"""Phase 2a: crawl Cookpad for AI-recognizable dishes that lack canonical recipes
and have < MIN_EXISTING real candidates in the DB. One JSON file per dish.

Run from repo root:
    cd ..   (repo root, where crawl_general_recipes.py lives)
    backend/.venv/Scripts/python.exe backend/scripts/crawl_missing_dishes.py
"""
import asyncio
import json
import os
import sys
import time
import unicodedata
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[2]  # repo root
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "backend"))

from playwright.sync_api import sync_playwright  # noqa: E402
from crawl_general_recipes import (  # noqa: E402
    make_browser_context, search_all_recipes, scrape_recipe,
)
from sqlalchemy import select, func  # noqa: E402
from app.core.database import AsyncSessionLocal  # noqa: E402
from app.models.recipe import Recipe  # noqa: E402
from app.ai.class_names import CLASS_DISPLAY_NAMES  # noqa: E402

OUTPUT_FOLDER = ROOT / "cookpad_recipe"
MIN_EXISTING = 5          # dishes with >= this many existing candidates skip crawl
MAX_PER_DISH = 15         # scrape at most this many recipes per dish
SLEEP_SEC = 4


def norm(t: str) -> str:
    t = unicodedata.normalize("NFKD", t or "")
    t = "".join(c for c in t if not unicodedata.combining(c))
    return t.lower().replace("đ", "d").replace("Đ", "d")


async def dishes_to_crawl() -> list[tuple[str, str]]:
    """Return (slug, display_name) for AI classes lacking canonical and < MIN_EXISTING candidates."""
    async with AsyncSessionLocal() as db:
        canon = {s for (s,) in (await db.execute(
            select(Recipe.canonical_dish_slug).where(Recipe.is_canonical.is_(True))
        )).all() if s}
        out = []
        for slug, display in CLASS_DISPLAY_NAMES.items():
            if slug in canon:
                continue
            cnt = (await db.execute(
                select(func.count(Recipe.id)).where(
                    Recipe.is_canonical.is_(False),
                    Recipe.title.ilike(f"%{display}%"),
                )
            )).scalar_one()
            if cnt < MIN_EXISTING:
                out.append((slug, display))
        return out


def title_matches(title: str, display: str) -> bool:
    return norm(display) in norm(title)


def main() -> None:
    os.makedirs(OUTPUT_FOLDER, exist_ok=True)
    targets = asyncio.run(dishes_to_crawl())
    print(f"Dishes to crawl: {len(targets)}")
    for slug, display in targets:
        print(f"  - {slug} ({display})")

    with sync_playwright() as pw:
        browser, context = make_browser_context(pw)
        page = context.new_page()
        try:
            page.goto("https://cookpad.com/vn", wait_until="domcontentloaded", timeout=20000)
            page.wait_for_timeout(2000)
        except Exception as e:
            print(f"warm-up warning: {e}")

        for slug, display in targets:
            out_file = OUTPUT_FOLDER / f"missing_{slug}.json"
            if out_file.exists():
                saved = json.loads(out_file.read_text(encoding="utf-8"))
                done = {r["cookpad_url"] for r in saved}
                print(f"[{slug}] resume: {len(saved)} already")
            else:
                saved, done = [], set()

            print(f"\n[{slug}] search '{display}'")
            found = search_all_recipes(page, display, max_scrolls=40, no_new_limit=4)
            filtered = [r for r in found if title_matches(r["title"], display)]
            print(f"  matched titles: {len(filtered)}")

            for item in filtered[:MAX_PER_DISH]:
                if item["url"] in done:
                    continue
                rec = scrape_recipe(page, item["url"])
                if not rec or not rec["ingredients"]:
                    time.sleep(2)
                    continue
                saved.append({
                    "slug": slug,
                    "keyword": display,
                    "name": item["title"],
                    "cookpad_url": item["url"],
                    "ingredients_display": rec["ingredients"],
                    "description": rec["description"],
                    "instructions": rec["instructions"],
                    "image_url": rec["image_url"],
                })
                done.add(item["url"])
                out_file.write_text(json.dumps(saved, ensure_ascii=False, indent=2), encoding="utf-8")
                print(f"    + {item['title']} ({len(rec['ingredients'])} ing)")
                time.sleep(SLEEP_SEC)
            print(f"  -> {len(saved)} saved to {out_file.name}")

        browser.close()
    print("\nDONE crawling.")


if __name__ == "__main__":
    main()
