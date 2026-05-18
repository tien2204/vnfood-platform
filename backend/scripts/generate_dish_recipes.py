"""Generate backend/app/ai/dish_recipes.json from 103 trained dishes.

Iterates unique slugs from GROUP_CLASSES, asks OpenAI GPT-4o-mini for a
structured recipe per slug, writes incrementally so the run is resumable
(skips slugs already present in the output file).

Usage:
    python -m scripts.generate_dish_recipes [--limit N] [--overwrite]
"""
import argparse
import asyncio
import json
import os
from pathlib import Path

from openai import AsyncOpenAI

from app.ai.class_names import CLASS_DISPLAY_NAMES, GROUP_CLASSES
from app.core.config import settings

OUTPUT_PATH = Path("app/ai/dish_recipes.json")

PROMPT_TEMPLATE = """Sinh công thức nấu món Việt "{display_name}" (slug: {slug}).

Reply ONLY với JSON object — không markdown, không giải thích:
{{
  "title": "{display_name}",
  "description": "Mô tả ngắn 1-2 câu",
  "ingredients": ["nguyên liệu 1 có định lượng", "nguyên liệu 2 có định lượng", ...],
  "steps": ["bước 1 chi tiết", "bước 2 chi tiết", ...],
  "cooking_time_minutes": 30,
  "servings": 4,
  "difficulty": "easy" | "medium" | "hard"
}}

Yêu cầu:
- ingredients: ít nhất 5, mỗi item có định lượng (e.g. "Bột gạo 200g")
- steps: ít nhất 3, mô tả đủ chi tiết để người không biết nấu cũng làm được
- cooking_time_minutes: số nguyên (15-180)
- difficulty: chọn 1 trong easy/medium/hard
"""


def collect_unique_slugs() -> list[tuple[str, str]]:
    """Return [(slug, display_name), ...] — dedup across groups."""
    seen = set()
    pairs = []
    for slugs in GROUP_CLASSES.values():
        for slug in slugs:
            if slug in seen:
                continue
            seen.add(slug)
            display = CLASS_DISPLAY_NAMES.get(slug, slug)
            pairs.append((slug, display))
    return pairs


async def generate_one(client: AsyncOpenAI, slug: str, display_name: str) -> dict:
    response = await client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": PROMPT_TEMPLATE.format(slug=slug, display_name=display_name)}],
        max_tokens=1500,
        response_format={"type": "json_object"},
    )
    content = response.choices[0].message.content.strip()
    return json.loads(content)


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=None, help="Test với N món trước")
    parser.add_argument("--overwrite", action="store_true", help="Re-generate slugs đã có")
    args = parser.parse_args()

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    existing = {}
    if OUTPUT_PATH.exists():
        existing = json.loads(OUTPUT_PATH.read_text(encoding="utf-8"))
        print(f"[INIT] Loaded {len(existing)} existing entries from {OUTPUT_PATH}")

    pairs = collect_unique_slugs()
    if args.limit:
        pairs = pairs[: args.limit]

    client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

    for idx, (slug, display) in enumerate(pairs, start=1):
        if slug in existing and not args.overwrite:
            print(f"  [{idx}/{len(pairs)}] SKIP {slug} (already exists)")
            continue

        try:
            recipe = await generate_one(client, slug, display)
            existing[slug] = recipe
            OUTPUT_PATH.write_text(
                json.dumps(existing, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            print(f"  [{idx}/{len(pairs)}] OK   {slug} | {recipe.get('title')}")
        except Exception as e:
            print(f"  [{idx}/{len(pairs)}] FAIL {slug}: {e}")

        await asyncio.sleep(0.5)  # Soft rate limit

    print(f"\n[DONE] Total entries in {OUTPUT_PATH}: {len(existing)}")


if __name__ == "__main__":
    asyncio.run(main())
