import pytest
from pydantic import ValidationError

from app.config import Settings


def test_postgres_url_missing_fails_fast(monkeypatch):
    """A deployed environment missing POSTGRES_URL must fail at startup,
    not silently fall back to a localhost default."""
    monkeypatch.delenv("POSTGRES_URL", raising=False)
    monkeypatch.delenv("postgres_url", raising=False)
    with pytest.raises(ValidationError):
        Settings(_env_file=None)


def test_postgres_url_reads_from_environment(monkeypatch):
    monkeypatch.setenv("POSTGRES_URL", "postgresql://user:pass@db.example.com:5432/quizloop")
    s = Settings(_env_file=None)
    assert s.postgres_url == "postgresql://user:pass@db.example.com:5432/quizloop"