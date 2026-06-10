"""Map a free-text dish name to a known class slug and decide the VNFood match tier.

Pure logic — no DB, no I/O. The canonical-slug cache is populated at startup by
app.services.canonical_coverage."""
import unicodedata
from typing import Callable, Optional

from app.ai.class_names import CLASS_DISPLAY_NAMES

# Confidence gates (mirror inference.py thresholds + a tentative floor).
GROUP_CONF_MIN = 0.5
CLASS_CONFIDENT = 0.6
CLASS_TENTATIVE = 0.4

# Hand aliases for names OpenAI may return that don't match a Vietnamese display name.
_MANUAL_ALIASES = {
    "pho": "pho",
    "banh mi": "banh-mi",
    "vietnamese baguette": "banh-mi",
    "spring roll": "goi-cuon",
    "spring rolls": "goi-cuon",
    "fresh spring roll": "goi-cuon",
}


def _normalize(text: Optional[str]) -> str:
    """lowercase + strip diacritics (NFD, drop combining marks) + collapse whitespace."""
    if not text:
        return ""
    nfd = unicodedata.normalize("NFD", text)
    stripped = "".join(c for c in nfd if not unicodedata.combining(c))
    return " ".join(stripped.lower().split())


def _build_alias_map() -> dict[str, str]:
    amap: dict[str, str] = {}
    for slug, display in CLASS_DISPLAY_NAMES.items():
        amap[_normalize(display)] = slug
        amap[_normalize(slug.replace("-", " "))] = slug
    for alias, slug in _MANUAL_ALIASES.items():
        amap[_normalize(alias)] = slug
    return amap


ALIAS_MAP: dict[str, str] = _build_alias_map()


def resolve_to_slug(name: Optional[str]) -> Optional[str]:
    """Map a free-text dish name to a known class slug, or None."""
    key = _normalize(name)
    if not key:
        return None
    return ALIAS_MAP.get(key)


def resolve_vnfood(
    vnfood_result: dict,
    has_canonical: Callable[[str], bool],
) -> tuple[Optional[str], Optional[str]]:
    """Decide the VNFood stage outcome.

    Returns (slug, tier) where tier ∈ {"confident", "tentative"}, or (None, None)
    when the caller must fall back to OpenAI.
    """
    if vnfood_result.get("group_confidence", 0.0) < GROUP_CONF_MIN:
        return None, None
    top5 = vnfood_result.get("top5") or []
    if not top5:
        return None, None
    top1 = top5[0]
    slug = top1["class"]
    conf = top1["confidence"]
    if conf >= CLASS_CONFIDENT:
        return slug, "confident"
    if conf >= CLASS_TENTATIVE and has_canonical(slug):
        return slug, "tentative"
    return None, None


# ── canonical-slug cache (populated at startup) ───────────────────────────────
CANONICAL_SLUGS: set[str] = set()


def set_canonical_slugs(slugs: set[str]) -> None:
    global CANONICAL_SLUGS
    CANONICAL_SLUGS = set(slugs)


def has_canonical(slug: str) -> bool:
    return slug in CANONICAL_SLUGS
