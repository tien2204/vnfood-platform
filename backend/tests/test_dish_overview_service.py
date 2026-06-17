from app.services import dish_overview_service as dos


def test_load_returns_count():
    n = dos.load_dish_overviews()
    assert n >= 2


def test_get_overview_known_slug():
    dos.load_dish_overviews()
    ov = dos.get_overview("banh-mi")
    assert ov is not None
    assert ov["display_name"] == "Bánh mì"
    assert isinstance(ov["key_ingredients"], list) and ov["key_ingredients"]
    assert isinstance(ov["main_steps"], list) and ov["main_steps"]
    assert isinstance(ov["variant_examples"], list)
    assert ov["tasting"]


def test_get_overview_unknown_and_none():
    dos.load_dish_overviews()
    assert dos.get_overview("not-a-slug") is None
    assert dos.get_overview(None) is None
    assert dos.get_overview("") is None
