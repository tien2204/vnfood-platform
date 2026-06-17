"""One-off: LLM-seed dish_overviews.json for every MULTI_VARIANT_SLUGS entry.

Resume-safe: writes after each slug, skips slugs already present unless --force.
Run from backend/:  .venv/Scripts/python scripts/seed_dish_overviews.py [--force]
Requires OPENAI_API_KEY in the environment / settings.
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from openai import OpenAI  # noqa: E402

from app.ai.class_names import CLASS_DISPLAY_NAMES  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.core.variant_config import MULTI_VARIANT_SLUGS  # noqa: E402

OUT_PATH = Path(__file__).parent.parent / "app" / "ai" / "dish_overviews.json"


def build_prompt(display_name: str) -> str:
    return (
        f'Viết phần giới thiệu CHUNG cho món Việt "{display_name}" (món này có NHIỀU biến thể).\n'
        "Trả về DUY NHẤT một JSON object, không markdown:\n"
        "{\n"
        f'  "display_name": "{display_name}",\n'
        '  "tasting": "2-3 câu mô tả VỊ và CÁCH THƯỞNG THỨC (ăn ra sao, vị thế nào, ăn kèm gì) — tránh sáo rỗng",\n'
        '  "key_ingredients": ["nguyên liệu chủ chốt CHUNG cho mọi biến thể", "..."],\n'
        '  "main_steps": ["bước chính ở mức tổng quát", "..."],\n'
        '  "variant_examples": ["tên biến thể phổ biến", "..."]\n'
        "}\n"
        "key_ingredients: 4-6 mục, KHÔNG định lượng. main_steps: 3-4 bước tổng quát. "
        "variant_examples: 4-6 tên. Toàn bộ bằng tiếng Việt."
    )


def generate(client: OpenAI, display_name: str) -> dict:
    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": build_prompt(display_name)}],
        max_tokens=800,
        response_format={"type": "json_object"},
    )
    data = json.loads(resp.choices[0].message.content.strip())
    # enforce shape
    return {
        "display_name": data.get("display_name") or display_name,
        "tasting": data["tasting"],
        "key_ingredients": list(data["key_ingredients"]),
        "main_steps": list(data["main_steps"]),
        "variant_examples": list(data.get("variant_examples", [])),
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="regenerate slugs already present")
    args = ap.parse_args()

    existing: dict = {}
    if OUT_PATH.exists():
        existing = json.loads(OUT_PATH.read_text(encoding="utf-8"))

    if not settings.OPENAI_API_KEY:
        raise SystemExit("OPENAI_API_KEY not set — cannot seed.")
    client = OpenAI(api_key=settings.OPENAI_API_KEY)

    todo = sorted(
        s for s in MULTI_VARIANT_SLUGS if args.force or s not in existing
    )
    print(f"{len(todo)} slugs to generate ({len(existing)} already present).")

    for i, slug in enumerate(todo, 1):
        display = CLASS_DISPLAY_NAMES.get(slug, slug)
        try:
            existing[slug] = generate(client, display)
            # write incrementally so a crash mid-run keeps progress
            OUT_PATH.write_text(
                json.dumps(existing, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            print(f"[{i}/{len(todo)}] {slug} ✓")
        except Exception as e:  # noqa: BLE001
            print(f"[{i}/{len(todo)}] {slug} FAILED: {e}")

    print(f"Done. {len(existing)} total overviews in {OUT_PATH}")


if __name__ == "__main__":
    main()
