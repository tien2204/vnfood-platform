"""Dessert detection patterns.

Filter ONLY Western/modern desserts. Keep traditional Vietnamese cakes like
banh-trung-thu, banh-pia, banh-bo, banh-da-lon, banh-gai, banh-troi-nuoc,
banh-u, banh-tieu, banh-la (these are part of Vietnamese cuisine).
"""
import re

DESSERT_SLUG_PATTERNS: list[re.Pattern] = [
    re.compile(r"^kem-", re.IGNORECASE),
]

DESSERT_TITLE_PATTERNS: list[re.Pattern] = [
    re.compile(p, re.IGNORECASE)
    for p in [
        r"\bbánh\s+kem\b",
        r"\bbánh\s+gato\b",
        r"\bbánh\s+ngọt\b",
        r"\bkem\s+tươi\b",
        r"\bcupcake\b",
        r"\btiramisu\b",
        r"\bcheesecake\b",
        r"\bmacaron\b",
        r"\bmousse\b",
        r"\bpudding\b",
        r"\bsữa\s+chua\b",
        r"\bsinh\s+tố\b",
        r"\bflan\b",
        r"\bbingsu\b",
    ]
]


def is_dessert(keyword: str | None, title: str | None) -> bool:
    if keyword:
        for p in DESSERT_SLUG_PATTERNS:
            if p.search(keyword):
                return True
    if title:
        for p in DESSERT_TITLE_PATTERNS:
            if p.search(title):
                return True
    return False
