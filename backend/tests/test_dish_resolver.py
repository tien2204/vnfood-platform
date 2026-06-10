from app.services import dish_resolver as dr


def test_normalize_strips_accents_and_case():
    assert dr._normalize("Phở") == "pho"
    assert dr._normalize("  Bánh   Xèo ") == "banh xeo"
    assert dr._normalize("") == ""
    assert dr._normalize(None) == ""


def test_resolve_to_slug_from_display_name():
    assert dr.resolve_to_slug("Bánh xèo") == "banh-xeo"
    assert dr.resolve_to_slug("phở") == "pho"
    # accent-insensitive: English/no-diacritic input still maps
    assert dr.resolve_to_slug("pho") == "pho"


def test_resolve_to_slug_unknown_returns_none():
    assert dr.resolve_to_slug("pizza margherita") is None
    assert dr.resolve_to_slug("") is None
    assert dr.resolve_to_slug(None) is None


def test_resolve_vnfood_confident():
    vn = {"group_confidence": 0.9, "top5": [{"class": "pho", "confidence": 0.8}]}
    slug, tier = dr.resolve_vnfood(vn, has_canonical=lambda s: True)
    assert (slug, tier) == ("pho", "confident")


def test_resolve_vnfood_tentative_when_canonical_exists():
    vn = {"group_confidence": 0.9, "top5": [{"class": "pho", "confidence": 0.5}]}
    slug, tier = dr.resolve_vnfood(vn, has_canonical=lambda s: True)
    assert (slug, tier) == ("pho", "tentative")


def test_resolve_vnfood_tentative_blocked_without_canonical():
    vn = {"group_confidence": 0.9, "top5": [{"class": "pho", "confidence": 0.5}]}
    slug, tier = dr.resolve_vnfood(vn, has_canonical=lambda s: False)
    assert (slug, tier) == (None, None)


def test_resolve_vnfood_low_group_falls_back():
    vn = {"group_confidence": 0.3, "top5": [{"class": "pho", "confidence": 0.9}]}
    slug, tier = dr.resolve_vnfood(vn, has_canonical=lambda s: True)
    assert (slug, tier) == (None, None)


def test_resolve_vnfood_below_tentative_floor_falls_back():
    vn = {"group_confidence": 0.9, "top5": [{"class": "pho", "confidence": 0.35}]}
    slug, tier = dr.resolve_vnfood(vn, has_canonical=lambda s: True)
    assert (slug, tier) == (None, None)


def test_canonical_slug_cache_roundtrip():
    dr.set_canonical_slugs({"pho", "banh-xeo"})
    assert dr.has_canonical("pho") is True
    assert dr.has_canonical("com-tam") is False
