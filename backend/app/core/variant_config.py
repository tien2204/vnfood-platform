"""Regional + protein variant detection patterns."""
import re

REGIONAL_PATTERNS: dict[str, list[re.Pattern]] = {
    "bac": [re.compile(p, re.IGNORECASE) for p in [
        r"miền\s+bắc", r"\bbắc\b", r"hà\s+nội", r"hà\s+thành",
    ]],
    "trung": [re.compile(p, re.IGNORECASE) for p in [
        r"miền\s+trung", r"\bhuế\b", r"\bquảng", r"đà\s+nẵng", r"hội\s+an",
    ]],
    "nam": [re.compile(p, re.IGNORECASE) for p in [
        r"miền\s+nam", r"sài\s+gòn", r"miệt\s+vườn", r"\bnam\s+bộ\b",
    ]],
}

PROTEIN_PATTERNS: dict[str, re.Pattern] = {
    "bo": re.compile(r"\bbò\b", re.IGNORECASE),
    "ga": re.compile(r"\bgà\b", re.IGNORECASE),
    "heo": re.compile(r"\b(heo|lợn)\b", re.IGNORECASE),
    "ca": re.compile(r"\bcá\b", re.IGNORECASE),
    "tom": re.compile(r"\btôm\b", re.IGNORECASE),
    "chay": re.compile(r"\bchay\b", re.IGNORECASE),
    "haisan": re.compile(r"\b(hải\s+sản|seafood)\b", re.IGNORECASE),
}

REGIONAL_DISPLAY: dict[str, str] = {
    "bac": "miền Bắc",
    "trung": "miền Trung",
    "nam": "miền Nam",
}

PROTEIN_DISPLAY: dict[str, str] = {
    "bo": "bò",
    "ga": "gà",
    "heo": "heo",
    "ca": "cá",
    "tom": "tôm",
    "chay": "chay",
    "haisan": "hải sản",
}

MIN_VARIANT_CLUSTER = 5


def detect_variants(title: str) -> tuple[str | None, str | None]:
    """Return (region, protein) tuple. Either may be None."""
    region = None
    for code, patterns in REGIONAL_PATTERNS.items():
        for p in patterns:
            if p.search(title):
                region = code
                break
        if region:
            break

    protein = None
    for code, p in PROTEIN_PATTERNS.items():
        if p.search(title):
            protein = code
            break

    return region, protein


def build_canonical_slug(keyword: str, region: str | None, protein: str | None) -> str:
    parts = [keyword]
    if region:
        parts.append(region)
    if protein:
        parts.append(protein)
    return "-".join(parts)


def build_variant_label(region: str | None, protein: str | None) -> str | None:
    parts = []
    if region:
        parts.append(REGIONAL_DISPLAY[region])
    if protein:
        parts.append(PROTEIN_DISPLAY[protein])
    return ", ".join(parts) if parts else None


# ── Multi-variant dishes ──────────────────────────────────────────────────────
# Dishes whose recognized class spans many named sub-dishes. For these, the
# recognize UI shows a generic overview instead of pinning a single recipe as
# "the standard". Derived from the variant classification (rich + moderate).
# Group 1 — rich variants (23):
_MULTI_VARIANT_RICH = {
    "pho", "banh-mi", "banh-canh", "hu-tieu", "mi-quang", "banh-xeo",
    "banh-cuon", "banh-bao", "banh-tet", "banh-chung", "banh-trung-thu",
    "com-chien", "com-tam", "canh-chua", "ca-kho-to", "bun-rieu", "goi-cuon",
    "nem-chua", "lap-xuong", "rau-muong-xao", "banh-bo", "banh-da-lon",
    "banh-pia",
}
# Group 2 — moderate variants / by topping–region (34):
_MULTI_VARIANT_MODERATE = {
    "banh-beo", "banh-can", "banh-duc", "banh-hoi", "banh-trang-nuong",
    "banh-da-cua", "banh-u", "bo-ne", "bo-kho", "thit-kho-tau", "kho-quet",
    "ca-loc-nuong", "ca-sot-ca-chua", "ga-chien-nuoc-mam", "muc-nhoi-thit",
    "canh-bi-do", "canh-cua", "canh-kho-hoa", "ca-ri-ga", "sup-cua",
    "bun-cha-ca", "bun-thit-nuong", "bun-mam", "bun-dau-mam-tom", "mi-xao-gion",
    "nui-xao", "ga-hap-la-chanh", "oc-huong-xao", "oc-buou-hap",
    "tau-hu-nhoi-thit", "tau-hu-non", "tiet-canh", "trung-vit-lon", "mam-chung",
}
MULTI_VARIANT_SLUGS: set[str] = _MULTI_VARIANT_RICH | _MULTI_VARIANT_MODERATE


def is_multi_variant(slug: str | None) -> bool:
    """True if `slug` is a dish with many variants (overview-mode)."""
    return bool(slug) and slug in MULTI_VARIANT_SLUGS
