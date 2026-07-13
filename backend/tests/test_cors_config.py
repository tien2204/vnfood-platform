from app.core.config import Settings

_BASE = dict(
    DATABASE_URL="postgresql://u:p@localhost/db",
    SECRET_KEY="x" * 32,
)


def test_cors_defaults_to_localhost():
    s = Settings(CORS_ORIGINS="", **_BASE)
    assert s.cors_origins_list == [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]


def test_cors_parses_comma_separated_with_whitespace():
    s = Settings(CORS_ORIGINS="https://app.vercel.app, https://www.x.com ", **_BASE)
    assert s.cors_origins_list == ["https://app.vercel.app", "https://www.x.com"]
