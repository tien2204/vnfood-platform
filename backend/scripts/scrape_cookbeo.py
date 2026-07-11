"""Scrape ALL cookbeo.com/recipes/* via sitemap + JSON-LD Recipe (httpx, no bs4).

Writes cookpad_recipe/cookbeo_all.json (resumable). Does NOT touch the DB —
output is a scratch JSON for review only. Set COOKBEO_LIMIT=N to cap (testing).

Run from backend:  .venv/Scripts/python scripts/scrape_cookbeo.py
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
URLS_CACHE = OUT_DIR / "_cookbeo_urls.json"
ALL_FILE = OUT_DIR / "cookbeo_all.json"

BASE = "https://cookbeo.com"
SITEMAP = f"{BASE}/sitemap.xml"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
SLEEP = 1.0
LIMIT = int(os.environ.get("COOKBEO_LIMIT", "0"))  # 0 = all

LOC_RE = re.compile(r"<loc>(.*?)</loc>", re.S)
LDJSON_RE = re.compile(r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>', re.S)
RECIPE_URL_RE = re.compile(r"^https://cookbeo\.com/recipes/[^/]+/?$")
# YouTube embed/watch/short-link anywhere in the page HTML.
YT_RE = re.compile(r"(?:youtube\.com/(?:embed/|watch\?v=)|youtu\.be/)([\w-]{11})")
DIFF_MAP = {"dễ": "easy", "de": "easy", "trung bình": "medium",
            "trung binh": "medium", "khó": "hard", "kho": "hard"}
DIFF_RE = re.compile(r"Đ[ộo]\s*kh[oó][^<>]{0,12}[:：]?\s*</[^>]+>\s*<[^>]+>\s*([^<]{1,20})", re.I)


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
    body = get(client, SITEMAP) or ""
    urls = sorted({u for u in LOC_RE.findall(body) if RECIPE_URL_RE.match(u)})
    URLS_CACHE.write_text(json.dumps(urls, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Collected {len(urls)} recipe URLs from sitemap")
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


def _split_step(text: str) -> list[str]:
    # cookbeo packs multiple sentences/sub-steps into one instruction string,
    # separated by CR/LF. Split on newlines so each line is its own step.
    return [p.strip() for p in re.split(r"[\r\n]+", text or "") if p.strip()]


def parse_steps(node) -> list[str]:
    ri = node.get("recipeInstructions")
    out: list[str] = []
    if isinstance(ri, str):
        out += _split_step(ri)
    elif isinstance(ri, list):
        for it in ri:
            if isinstance(it, str):
                out += _split_step(it)
            elif isinstance(it, dict):
                if it.get("@type") == "HowToSection":
                    for st in it.get("itemListElement") or []:
                        if isinstance(st, dict):
                            out += _split_step(st.get("text") or st.get("name") or "")
                else:
                    out += _split_step(it.get("text") or it.get("name") or "")
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


def parse_video(node, html: str):
    # JSON-LD `video` first (rare on cookbeo), else a YouTube id in the HTML body.
    v = node.get("video")
    if isinstance(v, list):
        v = v[0] if v else None
    if isinstance(v, dict):
        u = v.get("contentUrl") or v.get("embedUrl")
        if u:
            return u
    if isinstance(v, str) and v:
        return v
    m = YT_RE.search(html)
    return f"https://www.youtube.com/watch?v={m.group(1)}" if m else None


def parse_servings(node):
    ry = node.get("recipeYield")
    if isinstance(ry, list):
        ry = ry[0] if ry else None
    if ry is None:
        return None
    mt = re.search(r"\d+", str(ry))
    return int(mt.group()) if mt else None


def _pt_minutes(v):
    if not isinstance(v, str):
        return 0
    h = re.search(r"(\d+)H", v)
    mi = re.search(r"(\d+)M", v)
    return (int(h.group(1)) * 60 if h else 0) + (int(mi.group(1)) if mi else 0)


def parse_minutes(node):
    for k in ("totalTime", "cookTime", "performTime", "prepTime"):
        mins = _pt_minutes(node.get(k))
        if mins:
            return mins
    return None


def parse_difficulty(html):
    mt = DIFF_RE.search(html)
    if not mt:
        return None
    raw = mt.group(1).strip().lower()
    return DIFF_MAP.get(raw)


def _as_list(v):
    if isinstance(v, list):
        return [str(x) for x in v]
    if isinstance(v, str):
        return [s.strip() for s in v.split(",") if s.strip()]
    return []


def scrape(client: httpx.Client, url: str) -> dict | None:
    html = get(client, url)
    if not html:
        return None
    for block in LDJSON_RE.findall(html):
        try:
            data = json.loads(block.strip(), strict=False)
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
            "video_url": parse_video(node, html),
            "servings": parse_servings(node),
            "cooking_time": parse_minutes(node),
            "difficulty": parse_difficulty(html),
            "description": (node.get("description") or "")[:2000],
            "category": _as_list(node.get("recipeCategory")),
            "cuisine": _as_list(node.get("recipeCuisine")),
            "keywords": _as_list(node.get("keywords")),
            "src": "cookbeo",
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
                if i % 20 == 0 or i == len(todo):
                    print(f"  [{i}/{len(todo)}] + {rec['name']} (total {len(saved)})")
            else:
                print(f"  [{i}/{len(todo)}] - skip (no Recipe) {url}")
            time.sleep(SLEEP)
    print(f"\nDONE. total saved = {len(saved)}")


if __name__ == "__main__":
    main()
