from app.core.config import settings


def test_ai_backend_defaults_to_local():
    assert settings.AI_BACKEND == "local"


def test_ai_service_fields_exist_with_defaults():
    assert settings.AI_SERVICE_URL == ""
    assert settings.AI_SERVICE_TOKEN == ""
    assert settings.AI_SERVICE_TIMEOUT == 30
