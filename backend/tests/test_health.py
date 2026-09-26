import psycopg
from fastapi.testclient import TestClient

from app import main as main_module
from app.main import app


client = TestClient(app)


def test_health() -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_database_health_reports_unavailable_when_database_cannot_authenticate(monkeypatch) -> None:
    def failing_connection():
        raise psycopg.OperationalError("authentication failed")

    monkeypatch.setattr(main_module, "get_connection", failing_connection)
    response = client.get("/health/db")

    assert response.status_code == 200
    assert response.json() == {"status": "unavailable"}


def test_list_games_returns_loaded_games() -> None:
    response = client.get("/games?limit=1")

    assert response.status_code == 200
    assert len(response.json()) == 1
    assert response.json()[0]["season"] == 2025


def test_get_game_returns_loaded_game() -> None:
    response = client.get("/games/1")

    assert response.status_code == 200
    assert response.json()["game_code"] == 1


def test_standings_returns_teams() -> None:
    response = client.get("/standings")

    assert response.status_code == 200
    assert len(response.json()) > 0
    assert {"team_code", "wins", "losses"}.issubset(response.json()[0])
