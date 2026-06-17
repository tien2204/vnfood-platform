from app.ai import class_names as cn


def test_valid_groups():
    assert cn.VALID_GROUPS == {
        "BANH", "BUN_PHO", "COM", "MON_KHO_NUONG",
        "CANH_CHAO", "XOI", "GOI_CUON", "DAC_BIET",
    }


def test_slugs_for_group():
    s = cn.slugs_for_group("BUN_PHO")
    assert "pho" in s and "hu-tieu" in s
    assert cn.slugs_for_group("NOPE") == []


def test_group_of_slug():
    assert cn.GROUP_OF_SLUG["pho"] == "BUN_PHO"
    assert cn.GROUP_OF_SLUG["com-tam"] == "COM"


def test_resolve_exact_slug_wins():
    assert cn.resolve_ai_class("bất kể tiêu đề", "pho") == "pho"


def test_resolve_title_prefix_longest_match():
    assert cn.resolve_ai_class("Bánh mì chảo đặc biệt", None) == "banh-mi-chao"
    assert cn.resolve_ai_class("Bánh mì thịt nướng", None) == "banh-mi"
    assert cn.resolve_ai_class("Phở gà Hà Nội", None) == "pho"
    assert cn.resolve_ai_class("Bún chả cá Nha Trang", None) == "bun-cha-ca"


def test_resolve_accent_sensitive_no_false_positive():
    assert cn.resolve_ai_class("Phô mai que", None) is None


def test_resolve_none():
    assert cn.resolve_ai_class("Vịt kho củ cải mặn", None) is None
    assert cn.resolve_ai_class(None, None) is None
    assert cn.resolve_ai_class("", None) is None
