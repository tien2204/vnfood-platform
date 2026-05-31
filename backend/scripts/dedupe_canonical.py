"""Phase 1: collapse duplicate-title canonical clusters.

Per cluster: keep ONE recipe (keep_slug), set its canonical_dish_slug=target_slug,
demote all other canonical rows in the cluster to is_canonical=false.
Decisions are hardcoded (approved in spec 2026-05-31). Idempotent: if a cluster is
already collapsed (no duplicates), it is skipped.

Usage:
    python -m scripts.dedupe_canonical --dry-run
    python -m scripts.dedupe_canonical
"""
import argparse
import asyncio
import sys
import unicodedata
from collections import defaultdict

sys.stdout.reconfigure(encoding="utf-8")

from sqlalchemy import select  # noqa: E402
from app.core.database import AsyncSessionLocal  # noqa: E402
from app.models.recipe import Recipe  # noqa: E402

# normalized_title -> (keep_slug, target_slug)
# keep_slug = which row's content survives; target_slug = its final canonical_dish_slug.
DEDUP_DECISIONS = {
    "com chien duong chau": ("com-chien-duong-chau", "com-chien-duong-chau"),
    "bun bo hue": ("bun-bo-hue-trung", "bun-bo-hue"),
    "bun rieu cua": ("bun-rieu-cua", "bun-rieu"),
    "canh chua ca loc": ("canh-chua", "canh-chua"),
    "com chien tom": ("com-chien", "com-chien"),
    "pho bo": ("pho", "pho"),
    "xoi khuc": ("xoi-khuc", "xoi-khuc"),
    "banh chuoi hap nuoc cot dua": ("banh-chuoi-hap", "banh-chuoi-hap"),
    "com chien dua bo": ("com-chien-dua-bo", "com-chien-dua-bo"),
    "canh bau nau tom": ("canh-bau-nau-tom", "canh-bau-nau-tom"),
    "canh kho qua nhoi thit": ("canh-kho-qua-nhoi-thit", "canh-kho-qua-nhoi-thit"),
    "banh da lon": ("banh-da-lon", "banh-da-lon"),
    "com rang dua bo": ("com-rang-dua-bo", "com-rang-dua-bo"),
    "canh suon bo": ("canh-suon-bo", "canh-suon-bo"),
    "com chien ca man": ("com-chien-ca-man", "com-chien-ca-man"),
    "canh ngao chua": ("canh-ngao-chua", "canh-ngao-chua"),
    "canh bi do thit bam": ("canh-bi-do-thit-bam", "canh-bi-do-thit-bam"),
    "canh rong bien thit bam": ("canh-rong-bien-thit-bam", "canh-rong-bien-thit-bam"),
}


def norm_title(t: str) -> str:
    t = unicodedata.normalize("NFKD", t or "")
    t = "".join(c for c in t if not unicodedata.combining(c))
    t = t.lower().replace("đ", "d").replace("Đ", "d")
    return " ".join(t.split())


async def main(dry_run: bool) -> None:
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(
            select(Recipe).where(Recipe.is_canonical.is_(True))
        )).scalars().all()

        by_title = defaultdict(list)
        for r in rows:
            by_title[norm_title(r.title)].append(r)

        demoted = 0
        reslugged = 0
        for ntitle, cluster in by_title.items():
            if len(cluster) < 2:
                continue
            if ntitle not in DEDUP_DECISIONS:
                print(f"[WARN] unexpected duplicate cluster not in table: {ntitle!r} "
                      f"slugs={[r.canonical_dish_slug for r in cluster]}")
                continue
            keep_slug, target_slug = DEDUP_DECISIONS[ntitle]
            keeper = next((r for r in cluster if r.canonical_dish_slug == keep_slug), None)
            if keeper is None:
                print(f"[WARN] keep_slug {keep_slug!r} not found in cluster {ntitle!r}; skipping")
                continue
            print(f"[{ntitle}] keep={keep_slug} -> slug {target_slug}; "
                  f"demote {[r.canonical_dish_slug for r in cluster if r is not keeper]}")
            if not dry_run:
                if keeper.canonical_dish_slug != target_slug:
                    keeper.canonical_dish_slug = target_slug
                    reslugged += 1
                for r in cluster:
                    if r is not keeper:
                        r.is_canonical = False
                        demoted += 1
        if not dry_run:
            await db.commit()
        print(f"\n{'DRY-RUN ' if dry_run else ''}done. demoted={demoted} reslugged={reslugged}")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()
    asyncio.run(main(args.dry_run))
