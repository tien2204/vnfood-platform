"""Classify a grocery ingredient name into a coarse category (keyword map, on-the-fly).

No DB, no migration: categories are computed when building the grocery payload.

Strategy: diacritic-strip + lowercase, then
  1. match multi-word PHRASES (specific, longest-first) — resolves ambiguous
     bare syllables like "ca" (cá fish vs cà rốt carrot), "dau" (dầu oil vs
     đậu beans), so "ca rot" -> rau-cu before the bare "ca" token -> thit-ca.
  2. otherwise match a curated set of whole-word TOKENS, scanned in
     CATEGORY_ORDER priority.
  3. fallback "khac".
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

# Multi-word phrases (diacritic-stripped lowercase) → category.
# Checked FIRST, longest-first, so specific phrases beat ambiguous bare tokens.
_PHRASES = {
    "rau-cu": [
        "ca rot", "ca chua", "kho qua", "muop dang", "rau muong", "rau thom",
        "rau cai", "la lot", "dua leo", "dua chuot", "dua hau", "xa lach",
        "su hao", "hanh la", "hanh tay", "hanh tim", "cu cai", "bi do",
        "bi xanh", "khoai tay", "khoai lang", "gia do",
    ],
    "gia-vi": [
        "nuoc mam", "nuoc tuong", "dau hao", "dau an", "dau me", "bot ngot",
        "hat nem", "bot canh", "bot nghe", "nuoc cot", "mat ong", "sa te",
        "ngu vi huong", "nuoc dua", "tuong ot", "tuong den", "dau dieu",
    ],
    "kho-dong-goi": [
        "banh trang", "banh pho", "banh da", "banh mi", "banh hoi", "hu tieu",
        "dau hu", "tau hu", "lap xuong", "pho mai", "do hop", "bot mi",
        "bot gao", "dau phong", "dau xanh", "me rang", "nuoc cot dua",
    ],
    "thit-ca": [
        "hai san", "ca loc", "ca hoi", "ca thu", "ca basa", "ca ngu", "ca chich",
        "cua dong", "gio song", "thit bo", "thit heo", "thit ga", "thit vit",
        "suon non", "suon heo", "trung vit", "trung ga", "trung cut",
    ],
}

# Whole-word tokens (curated to minimise ambiguity) → category.
# Checked AFTER phrases, in CATEGORY_ORDER priority.
_TOKENS = {
    "thit-ca": {
        "thit", "bo", "heo", "lon", "ga", "vit", "tom", "muc", "cua", "ngao",
        "oc", "luon", "trung", "xuong", "suon", "ech", "ca", "so", "ngheu",
    },
    "rau-cu": {
        "rau", "cu", "hanh", "toi", "ot", "nam", "gung", "sa", "rieng", "khoai",
        "bi", "bau", "muop", "cai", "ngo", "mui", "que", "chanh", "bap", "dua",
        "tao", "cam", "gia", "ca",  # "ca" here only reached if not matched above
    },
    "gia-vi": {
        "muoi", "duong", "mam", "tieu", "tuong", "giam", "me", "bot", "ruou",
        "sot", "dau",
    },
    "kho-dong-goi": {
        "bun", "pho", "mien", "nui", "cha", "nem", "sua", "nep", "gao", "mi",
    },
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

    # 1. Phrase match, longest phrase first (most specific wins).
    phrase_hits = []
    for cat, phrases in _PHRASES.items():
        for ph in phrases:
            if ph in n:
                phrase_hits.append((len(ph), cat))
    if phrase_hits:
        phrase_hits.sort(reverse=True)  # longest phrase first
        return phrase_hits[0][1]

    # 2. Whole-word token match, in category priority order.
    tokens = set(n.split())
    for cat in CATEGORY_ORDER:
        if cat in _TOKENS and tokens & _TOKENS[cat]:
            return cat

    return "khac"
