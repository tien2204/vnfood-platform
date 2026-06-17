from app.core import variant_config as vc


def test_multi_variant_slugs_size_and_membership():
    assert len(vc.MULTI_VARIANT_SLUGS) == 57
    assert "pho" in vc.MULTI_VARIANT_SLUGS
    assert "banh-mi" in vc.MULTI_VARIANT_SLUGS
    assert "tau-hu-non" in vc.MULTI_VARIANT_SLUGS
    # single-variant dishes must NOT be present
    assert "cao-lau" not in vc.MULTI_VARIANT_SLUGS
    assert "banh-khot" not in vc.MULTI_VARIANT_SLUGS


def test_all_slugs_are_real_classes():
    from app.ai.class_names import CLASS_DISPLAY_NAMES
    for slug in vc.MULTI_VARIANT_SLUGS:
        assert slug in CLASS_DISPLAY_NAMES, f"{slug} not a known class"


def test_is_multi_variant():
    assert vc.is_multi_variant("pho") is True
    assert vc.is_multi_variant("cao-lau") is False
    assert vc.is_multi_variant(None) is False
    assert vc.is_multi_variant("") is False
