"""Classify a grocery ingredient name into a coarse category (keyword map, on-the-fly).

No DB, no migration: categories are computed when building the grocery payload.
"""
import unicodedata

CATEGORY_LABELS = {
    "thit-ca": "Thịt & Hải sản",
    "rau-cu": "Rau củ quả",
    "gia-vi": "Gia vị & Nước chấm",
    "kho-dong-goi": "Khô & Đóng gói",
    "khac": "Khác",
}

# Display/group order (most-perishable first is a sensible shopping order).
CATEGORY_ORDER = ["thit-ca", "rau-cu", "gia-vi", "kho-dong-goi", "khac"]

# Keyword → category. Keywords are diacritic-stripped lowercase substrings.
_KEYWORDS = {
    "thit-ca": [
        "thit", "bo", "heo", "lon", "ga", "vit", "ca ", "ca,", "tom", "muc",
        "cua", "ngao", "so", "oc", "luon", "trung", "xuong", "suon", "gio song",
        "hai san", "cua dong", "ech", "chim",
    ],
    "rau-cu": [
        "rau", "cu", "ca chua", "ca rot", "hanh", "toi", "ot", "nam", "gung",
        "sa", "rieng", "khoai", "bi ", "bau", "muop", "dau", "gia ", "cai",
        "ngo", "mui", "que", "chanh", "dua leo", "dua chuot", "kho qua",
        "muop dang", "bap", "ngo ", "rau muong", "rau thom", "la lot", "chuoi",
        "dua hau", "tao", "cam", "xa lach", "su hao", "do",
    ],
    "gia-vi": [
        "muoi", "duong", "nuoc mam", "mam", "tieu", "dau an", "dau hao",
        "bot ngot", "hat nem", "nuoc tuong", "tuong", "giam", "me", "sa te",
        "bot", "nuoc cot", "ruou", "mat ong", "dau me", "ngu vi", "bot canh",
        "nuoc dua", "sot",
    ],
    "kho-dong-goi": [
        "bun", "pho", "mien", "banh trang", "banh pho", "banh da", "mi ",
        "nui", "dau hu", "tau hu", "lap xuong", "cha", "nem", "do hop",
        "sua", "pho mai", "bo ", "banh mi", "hu tieu", "bot mi", "bot gao",
        "nep", "gao", "dau phong", "dau xanh", "me rang",
    ],
}


def _norm(name: str) -> str:
    name = unicodedata.normalize("NFKD", name or "")
    name = "".join(c for c in name if not unicodedata.combining(c))
    return name.lower().replace("đ", "d").replace("Đ", "d").strip()


def categorize(name: str) -> str:
    """Return a category slug from CATEGORY_LABELS. Falls back to 'khac'."""
    n = _norm(name)
    if not n:
        return "khac"
    # Check in priority order; first matching keyword wins.
    for cat in CATEGORY_ORDER:
        for kw in _KEYWORDS.get(cat, []):
            if kw.strip() and kw in n:
                return cat
    return "khac"
