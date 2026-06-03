"""Crawl ALL monngonmoingay.com recipes via sitemap + JSON-LD (httpx, no Playwright).
Writes cookpad_recipe/mnmn_all.json (resumable). Set MNMN_LIMIT=N to cap (testing).

Run from backend:
    python -m scripts.crawl_mnmn
"""
import json
import os
import re
import sys
import time
from pathlib import Path

import httpx

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "cookpad_recipe"
URLS_CACHE = OUT_DIR / "_mnmn_urls.json"
ALL_FILE = OUT_DIR / "mnmn_all.json"

BASE = "https://monngonmoingay.com"
SITEMAP_INDEX = f"{BASE}/sitemap_index.xml"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
SLEEP = 1.5
LIMIT = int(os.environ.get("MNMN_LIMIT", "0"))  # 0 = all

LOC_RE = re.compile(r"<loc>(.*?)</loc>", re.S)
LDJSON_RE = re.compile(r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>', re.S)
ARTICLE_RE = re.compile(r"^https://monngonmoingay\.com/[a-z0-9][a-z0-9-]*/?$")


def get(client: httpx.Client, url: str) -> str | None:
    try:
        r = client.get(url, timeout=20.0)
        if r.status_code == 200:
            return r.text
    except Exception as e:
        print(f"  fetch fail {url}: {e}")
    return None


def collect_recipe_urls(client: httpx.Client) -> list[str]:
    if URLS_CACHE.exists():
        return json.loads(URLS_CACHE.read_text(encoding="utf-8"))
    idx = get(client, SITEMAP_INDEX) or ""
    # Recipes live in monan-sitemap*.xml ("món ăn") — ~2481 URLs across ~13 files
    # (verified 2026-06-03). NOT cachnau-sitemap (only 12 video posts). The
    # thong-tin-huu-ich-* sitemaps are tip articles, dropped later by the
    # JSON-LD Recipe filter in scrape().
    subs = [u for u in LOC_RE.findall(idx) if "monan-sitemap" in u]
    if not subs:
        # Fallback: pull every sub-sitemap that isn't an obvious non-recipe one.
        skip = ("page-", "banner-", "gioi-thieu", "khao-sat", "khna-cau", "lich-phat-song",
                "lich_mon_an_thang", "ebooklet-", "hoi-dau-bep", "tu-van-")
        subs = [u for u in LOC_RE.findall(idx) if u.endswith(".xml") and not any(k in u for k in skip)]
    urls: list[str] = []
    for s in subs:
        body = get(client, s) or ""
        urls += LOC_RE.findall(body)
        time.sleep(0.5)
    urls = sorted({u for u in urls if ARTICLE_RE.match(u)})
    URLS_CACHE.write_text(json.dumps(urls, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Collected {len(urls)} candidate recipe URLs from {len(subs)} sub-sitemaps")
    return urls


def find_recipe_node(data):
    if isinstance(data, dict) and "@graph" in data:
        nodes = data["@graph"]
    elif isinstance(data, list):
        nodes = data
    else:
        nodes = [data]
    for n in nodes:
        if not isinstance(n, dict):
            continue
        t = n.get("@type")
        if t == "Recipe" or (isinstance(t, list) and "Recipe" in t):
            return n
    return None


def parse_ingredients(node) -> list[str]:
    return [s.strip() for s in (node.get("recipeIngredient") or []) if isinstance(s, str) and s.strip()]


def parse_steps(node) -> list[str]:
    ri = node.get("recipeInstructions")
    out: list[str] = []
    if isinstance(ri, str):
        out = [x.strip() for x in re.split(r"[\r\n]+", ri) if x.strip()]
    elif isinstance(ri, list):
        for it in ri:
            if isinstance(it, str) and it.strip():
                out.append(it.strip())
            elif isinstance(it, dict):
                if it.get("@type") == "HowToSection":
                    for st in it.get("itemListElement") or []:
                        if isinstance(st, dict):
                            txt = (st.get("text") or st.get("name") or "").strip()
                            if txt:
                                out.append(txt)
                else:
                    txt = (it.get("text") or it.get("name") or "").strip()
                    if txt:
                        out.append(txt)
    return out


def parse_image(node):
    img = node.get("image")
    if isinstance(img, str):
        return img
    if isinstance(img, list) and img:
        first = img[0]
        return first if isinstance(first, str) else (first.get("url") if isinstance(first, dict) else None)
    if isinstance(img, dict):
        return img.get("url")
    return None


def scrape(client: httpx.Client, url: str) -> dict | None:
    html = get(client, url)
    if not html:
        return None
    for block in LDJSON_RE.findall(html):
        try:
            data = json.loads(block.strip())
        except Exception:
            continue
        node = find_recipe_node(data)
        if not node:
            continue
        ings = parse_ingredients(node)
        if not ings:
            continue
        name = node.get("name") or ""
        if isinstance(name, list):
            name = name[0] if name else ""
        return {
            "name": (name or "").strip(),
            "url": url,
            "ingredients_display": ings,
            "instructions": parse_steps(node),
            "image_url": parse_image(node),
            "description": (node.get("description") or "")[:2000],
            "src": "monngonmoingay",
        }
    return None


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    saved = json.loads(ALL_FILE.read_text(encoding="utf-8")) if ALL_FILE.exists() else []
    done = {r["url"] for r in saved}
    with httpx.Client(headers={"User-Agent": UA}, follow_redirects=True) as client:
        urls = collect_recipe_urls(client)
        todo = [u for u in urls if u not in done]
        if LIMIT:
            todo = todo[:LIMIT]
        print(f"Scraping {len(todo)} URLs ({len(done)} already done)")
        for i, url in enumerate(todo, 1):
            rec = scrape(client, url)
            if rec and rec["name"]:
                saved.append(rec)
                ALL_FILE.write_text(json.dumps(saved, ensure_ascii=False, indent=2), encoding="utf-8")
                print(f"  [{i}/{len(todo)}] + {rec['name']} ({len(rec['ingredients_display'])} ing)")
            else:
                print(f"  [{i}/{len(todo)}] - skip (no Recipe) {url}")
            time.sleep(SLEEP)
    print(f"\nDONE. total saved = {len(saved)}")


if __name__ == "__main__":
    main()
