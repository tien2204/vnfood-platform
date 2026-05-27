"""Extract specific canonical dish slug from recipe titles using LLM.

Targets: recipes with catch-all keyword like 'Bánh', 'Canh', 'Cơm' etc.
(parent categories, not specific dishes). LLM analyzes title to extract
the actual dish (e.g. 'Bánh bao nhân thịt heo' -> 'banh-bao').

Skips: is_dessert=true recipes, recipes with already-clean slug keyword.

Output: updates canonical_dish_slug + variant_label.
Idempotent: recipes with canonical_dish_slug already set to a clean slug stay.
"""
import asyncio
import json
import logging

from openai import AsyncOpenAI
from sqlalchemy import or_, select, update

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.recipe import Recipe

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
log = logging.getLogger("extract")

client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
MODEL = "gpt-4o-mini"
BATCH_SIZE = 50
COST_CEILING_USD = 5.0  # Phase 2.5 budget; Phase 3 has separate ceiling
estimated_cost = 0.0

CATCH_ALL_KEYWORDS = ["Bánh", "Canh", "Cơm", "Cá", "Bún", "Gỏi", "Phở", "Thịt", "Xôi"]

EXTRACT_PROMPT = """Bạn là chuyên gia ẩm thực Việt Nam. Cho danh sách tiêu đề công thức, xác định món ăn chính cho mỗi tiêu đề.

Output canonical dish slug:
- Lowercase, hyphens (no diacritics)
- Bao gồm regional/protein suffix NẾU rõ ràng trong title:
  - "miền Bắc" / "Hà Nội" -> "-bac"
  - "miền Trung" / "Huế" -> "-trung"
  - "miền Nam" / "Sài Gòn" -> "-nam"
  - "bò" -> "-bo", "gà" -> "-ga", "tôm" -> "-tom", "cá" -> "-ca", "heo/lợn" -> "-heo", "chay" -> "-chay"

Ví dụ:
- "Bánh bao nhân thịt heo" -> "banh-bao"
- "Phở bò Hà Nội chuẩn vị" -> "pho-bo-bac"
- "Cơm gà xối mỡ Sài Gòn" -> "com-ga-nam"
- "Bánh xèo miền Trung tôm" -> "banh-xeo-trung-tom"
- "Bánh chuối nướng" -> "banh-chuoi-nuong"

Nếu title quá mơ hồ hoặc không phải món ăn cụ thể (ví dụ "Món ngon cuối tuần"), trả "unknown".

Tiêu đề:
{titles}

Output JSON (chỉ JSON, không markdown):
{{"results": [{{"index": 0, "slug": "..."}}, {{"index": 1, "slug": "..."}}, ...]}}
"""


async def extract_batch(titles: list[str]) -> list[str | None]:
    titles_str = "\n".join(f"{i}. {t}" for i, t in enumerate(titles))
    prompt = EXTRACT_PROMPT.format(titles=titles_str)
    try:
        resp = await client.chat.completions.create(
            model=MODEL,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.1,
        )
        data = json.loads(resp.choices[0].message.content)
        global estimated_cost
        # Rough cost: ~1500 tokens in + ~500 tokens out per batch
        estimated_cost += 0.0008
        slugs: list[str | None] = [None] * len(titles)
        for r in data.get("results", []):
            try:
                idx = int(r["index"])
            except (KeyError, ValueError, TypeError):
                continue
            slug = (r.get("slug") or "").strip().lower()
            if 0 <= idx < len(titles) and slug and slug != "unknown":
                slugs[idx] = slug
        return slugs
    except Exception as e:
        log.warning(f"  batch fail: {e}")
        return [None] * len(titles)


def _parse_variant_label(slug: str) -> str | None:
    parts = slug.split("-")
    regions = {"bac": "miền Bắc", "trung": "miền Trung", "nam": "miền Nam"}
    proteins = {"bo": "bò", "ga": "gà", "tom": "tôm", "ca": "cá", "heo": "heo", "chay": "chay"}
    var_parts: list[str] = []
    for p in parts[1:]:
        if p in regions:
            var_parts.append(regions[p])
        elif p in proteins:
            var_parts.append(proteins[p])
    return ", ".join(var_parts) if var_parts else None


async def main() -> None:
    async with AsyncSessionLocal() as db:
        # Fetch recipes with catch-all keyword, not dessert.
        # Idempotent rule (resumable): a row "needs extraction" when its
        # canonical_dish_slug is NULL or starts with an uppercase letter
        # (e.g. "Bánh", "Bún-bo", "Cơm-ga"). Clean LLM-extracted slugs
        # always begin with lowercase ASCII (e.g. "banh-mi", "pho-bo-bac")
        # so they are skipped on re-runs.
        result = await db.execute(
            select(Recipe.id, Recipe.title)
            .where(
                Recipe.is_dessert.is_(False),
                Recipe.keyword.in_(CATCH_ALL_KEYWORDS),
                Recipe.title.is_not(None),
                or_(
                    Recipe.canonical_dish_slug.is_(None),
                    # Postgres POSIX regex: leading uppercase letter or
                    # diacritic-capital (uppercase Vietnamese chars are
                    # outside [A-Z] but `~* '^[a-z]'` negation handles them).
                    Recipe.canonical_dish_slug.op("!~")("^[a-z]"),
                ),
            )
        )
        rows = result.all()
        log.info(f"Processing {len(rows)} recipes with catch-all keyword")

        updated = 0
        skipped = 0
        empty_batches = 0
        batches_done = 0
        for i in range(0, len(rows), BATCH_SIZE):
            if estimated_cost > COST_CEILING_USD:
                log.warning(f"COST CEILING (${estimated_cost:.2f}), stopping")
                break

            batch = rows[i : i + BATCH_SIZE]
            titles = [r.title for r in batch]
            slugs = await extract_batch(titles)
            batches_done += 1
            if all(s is None for s in slugs):
                empty_batches += 1

            for row, slug in zip(batch, slugs):
                if slug:
                    var_label = _parse_variant_label(slug)
                    await db.execute(
                        update(Recipe)
                        .where(Recipe.id == row.id)
                        .values(canonical_dish_slug=slug, variant_label=var_label)
                    )
                    updated += 1
                else:
                    skipped += 1

            await db.commit()

            if (i // BATCH_SIZE) % 5 == 0:
                log.info(
                    f"  ... {i + len(batch)}/{len(rows)} processed, "
                    f"updated={updated}, skipped={skipped}, cost=${estimated_cost:.2f}"
                )

            # Bail out if prompt is failing >50% (safety). Raise threshold +
            # require more samples; earlier 30%/10 trip-wire fired too often
            # on noisy titles and aborted the whole run.
            if batches_done >= 30 and empty_batches / batches_done > 0.50:
                log.error(
                    f"ABORT: {empty_batches}/{batches_done} batches returned all-None. "
                    "Prompt may be broken."
                )
                break

        log.info(
            f"DONE. Updated {updated}, skipped {skipped}, cost ~${estimated_cost:.2f}"
        )


if __name__ == "__main__":
    asyncio.run(main())
