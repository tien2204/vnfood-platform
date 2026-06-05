"""LLM-fill facet tags for canonical recipes still NULL per facet (the ~400
non-MNMN canonicals + any MNMN dish absent from a taxonomy). Classifies each
title into that facet's raw-term vocab (read from facet_vocab.json), reusing the
classify_meal_types pattern. Idempotent — only touches NULL rows.

Run from backend (after crawl_facets):
    python -m scripts.backfill_facets
"""
import asyncio
import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

from openai import AsyncOpenAI  # noqa: E402
from sqlalchemy import select, update  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.core.database import AsyncSessionLocal  # noqa: E402
from app.models.recipe import Recipe  # noqa: E402

VOCAB_FILE = Path(__file__).resolve().parents[2] / "cookpad_recipe" / "facet_vocab.json"

# facet label (for the prompt) + DB column
FACETS = {
    "region": ("vùng miền (Bắc/Trung/Nam...)", "regions"),
    "occasion": ("dịp nấu (hằng ngày/đãi tiệc/lễ tết/ăn vặt...)", "occasions"),
    "dish_type": ("loại món (canh/kho/xào/nướng/chiên/gỏi/lẩu...)", "dish_types"),
    "diet": ("chế độ ăn (mặn/chay/ăn kiêng...)", "diets"),
}


async def classify_facets(client: AsyncOpenAI, title: str, facet_desc: str,
                          allowed: list[dict]) -> list[str]:
    """Return a subset of allowed term slugs that fit `title` for this facet."""
    labels = ", ".join(f'{t["value"]} ({t["label"]})' for t in allowed)
    try:
        resp = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{
                "role": "user",
                "content": (
                    f'Món ăn Việt Nam: "{title}". Phân loại theo {facet_desc}. '
                    f'Chỉ chọn trong danh sách (value): {labels}. '
                    'Trả JSON object {"values": [...]} gồm các value phù hợp '
                    '(có thể nhiều, hoặc rỗng nếu không chắc). Chỉ JSON.'
                ),
            }],
            response_format={"type": "json_object"},
            temperature=0,
        )
        allowed_set = {t["value"] for t in allowed}
        data = json.loads(resp.choices[0].message.content)
        return [v for v in (data.get("values") or []) if v in allowed_set]
    except Exception as e:
        print(f"    [ERR] classify {facet_desc}: {e}")
        return []


async def main() -> None:
    if not VOCAB_FILE.exists():
        print(f"missing {VOCAB_FILE} — run scripts.crawl_facets first")
        return
    vocab = json.loads(VOCAB_FILE.read_text(encoding="utf-8"))
    client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    async with AsyncSessionLocal() as db:
        for facet, (desc, col) in FACETS.items():
            allowed = vocab.get(facet, [])
            if not allowed:
                print(f"[{facet}] no vocab — skip")
                continue
            rows = (await db.execute(
                select(Recipe.id, Recipe.title).where(
                    Recipe.is_canonical.is_(True),
                    getattr(Recipe, col).is_(None),
                )
            )).all()
            print(f"[{facet}] to fill: {len(rows)}")
            done = 0
            for rid, title in rows:
                terms = await classify_facets(client, title, desc, allowed)
                # store [] for "none chosen" so reruns don't re-query it
                await db.execute(update(Recipe).where(Recipe.id == rid).values(**{col: terms}))
                done += 1
                if done % 50 == 0:
                    await db.commit()
                    print(f"  [{facet}] {done}/{len(rows)}")
            await db.commit()
            print(f"[{facet}] DONE filled {done}")


if __name__ == "__main__":
    asyncio.run(main())
