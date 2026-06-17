"""One-off: judge each in-scope recipe's description; rewrite weak ones into
recipes.flavor_text (taste-focused). Good descriptions are left as-is (NULL).

Run from backend/:  .venv/Scripts/python scripts/seed_flavor_text.py [--force]
Resume-safe: skips recipes that already have flavor_text unless --force.
Requires OPENAI_API_KEY.
"""
import argparse
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from openai import OpenAI  # noqa: E402
from sqlalchemy import select  # noqa: E402
from sqlalchemy.orm import selectinload  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.core.database import AsyncSessionLocal  # noqa: E402
from app.models.recipe import Recipe  # noqa: E402

BATCH = 25


def build_prompt(title: str, description: str | None, ingredients: list[str]) -> str:
    ing = ", ".join(ingredients[:8]) if ingredients else "(không rõ)"
    desc = (description or "").strip() or "(trống)"
    return (
        f'Món: "{title}".\n'
        f"Nguyên liệu chính: {ing}.\n"
        f"Mô tả hiện tại: «{desc}»\n\n"
        "Nhiệm vụ: đánh giá mô tả hiện tại đã nói về VỊ và CÁCH THƯỞNG THỨC "
        "(ăn ra sao, vị thế nào, ăn kèm gì) chưa. Mô tả kiểu chatty/quảng cáo "
        '("nhà mình", "Món Ngon Mỗi Ngày", "cách làm…"), sáo rỗng, hoặc trống '
        "thì coi là CHƯA đạt.\n"
        "Trả về DUY NHẤT một JSON object, không markdown:\n"
        '{"keep": true}  nếu mô tả hiện tại ĐÃ tả vị tốt (giữ nguyên),\n'
        'hoặc {"keep": false, "flavor_text": "2-3 câu tiếng Việt tả VỊ + CÁCH '
        'THƯỞNG THỨC, cụ thể, tránh sáo rỗng"}  nếu CHƯA đạt.'
    )


def judge(client: OpenAI, title: str, description: str | None, ingredients: list[str]) -> str | None:
    """Return new flavor_text string, or None to keep the original."""
    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": build_prompt(title, description, ingredients)}],
        max_tokens=400,
        response_format={"type": "json_object"},
    )
    data = json.loads(resp.choices[0].message.content.strip())
    if data.get("keep") is True:
        return None
    text = (data.get("flavor_text") or "").strip()
    return text or None


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="re-evaluate recipes that already have flavor_text")
    args = ap.parse_args()

    if not settings.OPENAI_API_KEY:
        raise SystemExit("OPENAI_API_KEY not set — cannot seed.")
    client = OpenAI(api_key=settings.OPENAI_API_KEY)

    async with AsyncSessionLocal() as db:
        stmt = (
            select(Recipe)
            .options(selectinload(Recipe.ingredients))
            .where(
                Recipe.is_canonical.is_(True),
                Recipe.ai_class_slug.isnot(None),
                Recipe.status == "approved",
            )
        )
        if not args.force:
            stmt = stmt.where(Recipe.flavor_text.is_(None))
        rows = (await db.execute(stmt)).scalars().all()
        print(f"{len(rows)} recipes to evaluate.")

        rewritten = 0
        for i, r in enumerate(rows, 1):
            ings = [ing.display_text for ing in r.ingredients]
            try:
                new_text = judge(client, r.title, r.description, ings)
            except Exception as e:  # noqa: BLE001
                print(f"[{i}/{len(rows)}] {r.title[:40]} FAILED: {e}")
                continue
            if new_text:
                r.flavor_text = new_text
                rewritten += 1
            if i % BATCH == 0:
                await db.commit()
                print(f"  …{i}/{len(rows)} (rewritten {rewritten})")
        await db.commit()
        print(f"Done. rewrote {rewritten}/{len(rows)} descriptions.")


if __name__ == "__main__":
    asyncio.run(main())
