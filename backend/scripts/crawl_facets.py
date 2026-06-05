"""Crawl monngonmoingay.com taxonomy sitemaps (vungmien/dipnau/loaimon/dinhduong),
derive a raw-term vocab per facet, and tag canonical recipes.

For each facet sitemap -> term pages (e.g. /mon-ngon-mien-nam/) -> recipe URLs.
A recipe URL is matched to its raw MNMN recipe via Recipe.cookpad_url
(source='monngonmoingay'), then to its canonical via canonical_dish_slug, and the
term slug is unioned into the canonical's facet column.

URL structure discovered from live site:
  - Taxonomy sitemaps list single-segment term pages: /mon-ngon-mien-nam/
  - Term pages paginate: /mon-ngon-mien-nam/page/2/ ... /page/N/
  - Taxonomy index pages (/vungmien/, /dipnau/, /loaimon/, /dinhduong/) are skipped.
  - Recipe article links on term pages are also single-segment: /ten-mon-an/

Outputs:
  - cookpad_recipe/facet_vocab.json : {facet: [{"value": slug, "label": text}, ...]}
  - tags recipes.regions / occasions / dish_types / diets for canonicals.

Idempotent: each canonical's facet column is rebuilt as the union of all crawled
terms for that canonical (overwrites, no duplicate accumulation).

Run from backend:
    python -m scripts.crawl_facets
"""
import asyncio
import json
import re
import sys
import time
from collections import defaultdict
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

import httpx  # noqa: E402
from sqlalchemy import select, update  # noqa: E402
from app.core.database import AsyncSessionLocal  # noqa: E402
from app.models.recipe import Recipe  # noqa: E402

BASE = "https://monngonmoingay.com"
SITEMAP_INDEX = f"{BASE}/sitemap_index.xml"
LOC_RE = re.compile(r"<loc>(.*?)</loc>", re.I | re.S)
OUT = Path(__file__).resolve().parents[2] / "cookpad_recipe" / "facet_vocab.json"

# facet -> (sitemap substring, DB column)
FACETS = {
    "region": ("vungmien", "regions"),
    "occasion": ("dipnau", "occasions"),
    "dish_type": ("loaimon", "dish_types"),
    "diet": ("dinhduong", "diets"),
}
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"}

# Taxonomy index page slugs to skip (they are category root pages, not term pages)
TAXONOMY_INDEX_SLUGS = {"vungmien", "dipnau", "loaimon", "dinhduong"}

# A recipe article URL: single-segment path matching known MNMN article pattern
# (same as crawl_mnmn.py ARTICLE_RE — lowercase alphanumeric + hyphens)
ARTICLE_RE = re.compile(r"^https://monngonmoingay\.com/[a-z0-9][a-z0-9-]*/?$")

# Non-recipe slugs to exclude (navigation/static pages that appear as recipe-like links)
# Note: taxonomy index slugs (vungmien/dipnau/loaimon/dinhduong) are already in
# TAXONOMY_INDEX_SLUGS and checked separately — no duplication here.
NON_RECIPE_SLUGS = {
    "chinh-sach-bao-ve-du-lieu-ca-nhan", "dieu-khoan-su-dung", "ke-hoach-nau-an",
    "lay-lai-mat-khau", "gia-vi-ban-can",
    "dang-nhap", "dang-ky", "lien-he", "gioi-thieu", "sitemap",
}

SLEEP = 0.5  # polite crawl delay between requests


def get(client: httpx.Client, url: str) -> str | None:
    try:
        r = client.get(url, timeout=20.0)
        r.raise_for_status()
        return r.text
    except Exception as e:
        print(f"  fetch fail {url}: {e}")
        return None


def slug_to_label(slug: str) -> str:
    return slug.replace("-", " ").strip().title()


def extract_recipe_links_from_html(html: str) -> list[str]:
    """Extract recipe article URLs from a term page (or paginated page) HTML."""
    links: set[str] = set()
    links.update(re.findall(r'href="(https?://monngonmoingay\.com/[^"]+)"', html))
    links.update(re.findall(r"href='(https?://monngonmoingay\.com/[^']+)'", html))
    results = []
    for ln in links:
        clean = ln.split("?")[0].split("#")[0].rstrip("/")
        if not ARTICLE_RE.match(clean):
            continue
        slug = clean.replace("https://monngonmoingay.com/", "")
        if slug in NON_RECIPE_SLUGS or slug in TAXONOMY_INDEX_SLUGS:
            continue
        results.append(clean + "/")
    return results


def get_max_page(html: str) -> int:
    """Find the highest page number linked from a paginated term page."""
    nums = re.findall(r'href="[^"]+/page/(\d+)/?[^"]*"', html)
    if not nums:
        return 1
    return max(int(n) for n in nums)


def collect_term_recipes(client: httpx.Client, term_url: str) -> list[str]:
    """Crawl all pages of a term page and return all recipe article URLs."""
    html = get(client, term_url)
    if not html:
        return []
    recipes = set(extract_recipe_links_from_html(html))
    max_page = get_max_page(html)
    # Paginate: /page/2/ through /page/max_page/
    for p in range(2, max_page + 1):
        page_url = term_url.rstrip("/") + f"/page/{p}/"
        time.sleep(SLEEP)
        ph = get(client, page_url)
        if ph:
            recipes.update(extract_recipe_links_from_html(ph))
    return list(recipes)


def crawl() -> tuple[dict, dict]:
    """Return (vocab, url_terms).
    vocab: {facet: {term_slug: label}}; url_terms: {recipe_url: {facet: set(term_slug)}}.
    """
    vocab: dict[str, dict[str, str]] = {f: {} for f in FACETS}
    url_terms: dict[str, dict[str, set]] = defaultdict(lambda: defaultdict(set))
    with httpx.Client(headers=HEADERS, follow_redirects=True) as client:
        idx = get(client, SITEMAP_INDEX) or ""
        sub_sitemaps = LOC_RE.findall(idx)
        print(f"Total sub-sitemaps in index: {len(sub_sitemaps)}")
        for facet, (needle, _col) in FACETS.items():
            subs = [u for u in sub_sitemaps if needle in u]
            print(f"[{facet}] sub-sitemaps matching '{needle}': {len(subs)}")
            term_pages: list[str] = []
            for sm in subs:
                body = get(client, sm) or ""
                locs = LOC_RE.findall(body)
                # Term pages = single-segment URLs; skip taxonomy index pages
                for loc in locs:
                    loc = loc.rstrip("/")
                    # Must be single-segment (no extra slashes after domain)
                    path = loc.replace("https://monngonmoingay.com", "").strip("/")
                    if "/" in path:
                        continue  # multi-segment, skip
                    if path in TAXONOMY_INDEX_SLUGS:
                        continue  # skip taxonomy root
                    if ARTICLE_RE.match(loc):
                        term_pages.append(loc.rstrip("/") + "/")
                time.sleep(SLEEP)
            term_pages = sorted(set(term_pages))
            print(f"[{facet}] term pages: {len(term_pages)}")
            for tp in term_pages:
                path = tp.replace("https://monngonmoingay.com/", "").rstrip("/")
                slug = path  # single-segment slug IS the term slug
                vocab[facet][slug] = slug_to_label(slug)
                recipe_links = collect_term_recipes(client, tp)
                print(f"    [{facet}] term '{slug}': {len(recipe_links)} recipe links")
                for ln in recipe_links:
                    url_terms[ln][facet].add(slug)
                time.sleep(SLEEP)
    return vocab, url_terms


async def tag_db(url_terms: dict) -> None:
    async with AsyncSessionLocal() as db:
        # url -> canonical_dish_slug (raw MNMN recipes)
        raw = (await db.execute(
            select(Recipe.cookpad_url, Recipe.canonical_dish_slug).where(
                Recipe.source == "monngonmoingay", Recipe.cookpad_url.isnot(None)
            )
        )).all()
        # Normalise stored URLs to trailing-slash form for consistent matching
        url_to_slug = {(u.rstrip("/") + "/"): s for (u, s) in raw if u and s}
        print(f"MNMN raw recipes with cookpad_url+canonical_dish_slug: {len(url_to_slug)}")
        # canonical_dish_slug -> canonical id
        canon = (await db.execute(
            select(Recipe.canonical_dish_slug, Recipe.id).where(Recipe.is_canonical.is_(True))
        )).all()
        slug_to_canon = {s: i for (s, i) in canon}
        print(f"Canonical recipes: {len(slug_to_canon)}")
        # accumulate per-canonical terms
        canon_terms: dict = defaultdict(lambda: {c: set() for _f, (_n, c) in FACETS.items()})
        cols = {f: c for f, (_n, c) in FACETS.items()}
        matched = 0
        unmatched_sample: list[str] = []
        for url, facets in url_terms.items():
            slug = url_to_slug.get(url)
            cid = slug_to_canon.get(slug) if slug else None
            if cid is None:
                if len(unmatched_sample) < 5:
                    unmatched_sample.append(f"{url!r} -> slug={slug!r}")
                continue
            matched += 1
            for f, terms in facets.items():
                canon_terms[cid][cols[f]] |= terms
        if unmatched_sample:
            print(f"  unmatched sample (first {len(unmatched_sample)}): {unmatched_sample}")
        for cid, colmap in canon_terms.items():
            values = {col: sorted(s) for col, s in colmap.items() if s}
            if values:
                await db.execute(update(Recipe).where(Recipe.id == cid).values(**values))
        await db.commit()
        print(f"matched recipe urls: {matched}; canonicals tagged: {len(canon_terms)}")


def main() -> None:
    vocab, url_terms = crawl()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(
        {f: [{"value": s, "label": lbl} for s, lbl in sorted(terms.items())]
         for f, terms in vocab.items()},
        ensure_ascii=False, indent=2), encoding="utf-8")
    for f, terms in vocab.items():
        print(f"vocab[{f}]: {len(terms)} terms")
    print(f"wrote {OUT}")
    asyncio.run(tag_db(url_terms))


if __name__ == "__main__":
    main()
