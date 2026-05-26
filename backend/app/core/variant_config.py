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
