from fastapi.testclient import TestClient

from app.main import app
from app.routers import players, seasons, shots, teams

client = TestClient(app)

PLAYER = {
    "season": 2025,
    "player_id": "003469",
    "player_name": "VEZENKOV, SASHA",
    "team_code": "OLY",
    "team_name": "Olympiacos",
    "games_played": 39,
    "points": 740.0,
    "points_per_game": 18.97,
    "rebounds": 250.0,
    "rebounds_per_game": 6.41,
    "assists": 49.0,
    "assists_per_game": 1.26,
    "valuation": 800.0,
    "field_goals_made": 300.0,
    "field_goals_attempted": 550.0,
    "field_goal_percentage": 0.545,
    "three_point_field_goals_made": 90.0,
    "three_point_field_goals_attempted": 222.0,
    "three_point_percentage": 0.405,
    "effective_field_goal_percentage": 0.627,
}

TEAM = {
    "season": 2025,
    "competition": "E",
    "standings_round": 38,
    "team_code": "OLY",
    "team_name": "Olympiacos Piraeus",
    "league_position": 1,
    "games_played": 38,
    "wins": 26,
    "losses": 12,
    "points_for": 3406.0,
    "points_against": 3144.0,
    "point_differential": 262.0,
    "win_percentage": 0.684,
    "points_for_per_game": 89.63,
    "points_against_per_game": 82.74,
}

SHOT = {
    "season": 2025,
    "game_code": 1,
    "team_code": "OLY",
    "player_id": "003469",
    "action_type": "2FGM",
    "x_coordinate": 12.5,
    "y_coordinate": 5.2,
    "period": 1,
    "game_clock": "09:42",
    "shot_index": 0,
}


class FakeCursor:
    def __init__(self, rows=(), row=None):
        self.rows = rows
        self.row = row

    def fetchall(self):
        return self.rows

    def fetchone(self):
        return self.row


class FakeConnection:
    def __init__(self, *, rows=(), row=None):
        self.cursor = FakeCursor(rows=rows, row=row)
        self.query = None
        self.params = None

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def execute(self, query, params):
        self.query = query
        self.params = params
        return self.cursor


def test_list_players_returns_season_stats_and_filters_team(monkeypatch):
    connection = FakeConnection(rows=[PLAYER])
    monkeypatch.setattr(players, "get_connection", lambda: connection)

    response = client.get("/players?season=2024&team_code=OLY&limit=20&offset=5")

    assert response.status_code == 200
    assert response.json() == [PLAYER]
    assert "analytics.fct_player_performance" in connection.query
    assert connection.params == (2024, "OLY", 20, 5)


def test_get_player_returns_stats_for_requested_season(monkeypatch):
    connection = FakeConnection(row=PLAYER)
    monkeypatch.setattr(players, "get_connection", lambda: connection)

    response = client.get("/players/003469?season=2024")

    assert response.status_code == 200
    assert response.json()["player_id"] == "003469"
    assert response.json()["effective_field_goal_percentage"] == 0.627
    assert connection.params == (2024, "003469")


def test_get_player_returns_404_when_missing(monkeypatch):
    monkeypatch.setattr(players, "get_connection", lambda: FakeConnection())

    response = client.get("/players/missing?season=2025")

    assert response.status_code == 404
    assert response.json()["detail"] == "Player not found"


def test_get_team_returns_performance_mart_row(monkeypatch):
    connection = FakeConnection(row=TEAM)
    monkeypatch.setattr(teams, "get_connection", lambda: connection)

    response = client.get("/teams/OLY?season=2024")

    assert response.status_code == 200
    assert response.json() == TEAM
    assert "analytics.fct_team_performance" in connection.query
    assert connection.params == (2024, "OLY")


def test_get_team_returns_404_when_missing(monkeypatch):
    monkeypatch.setattr(teams, "get_connection", lambda: FakeConnection())

    response = client.get("/teams/UNKNOWN?season=2025")

    assert response.status_code == 404
    assert response.json()["detail"] == "Team not found"


def test_list_seasons_returns_distinct_available_seasons_descending(monkeypatch):
    connection = FakeConnection(rows=[{"season": 2025}, {"season": 2024}])
    monkeypatch.setattr(seasons, "get_connection", lambda: connection)

    response = client.get("/seasons")

    assert response.status_code == 200
    assert response.json() == [2025, 2024]
    assert "UNION" in connection.query


def test_list_shots_filters_by_season_player_team_and_game(monkeypatch):
    connection = FakeConnection(rows=[SHOT])
    monkeypatch.setattr(shots, "get_connection", lambda: connection)

    response = client.get(
        "/shots?season=2024&player_id=003469&team_code=OLY&game_code=1&limit=25&offset=10"
    )

    assert response.status_code == 200
    assert response.json() == [SHOT]
    assert "analytics.stg_shots" in connection.query
    assert connection.params == (2024, "003469", "OLY", 1, 25, 10)


def test_list_shots_returns_empty_list_for_empty_season(monkeypatch):
    connection = FakeConnection()
    monkeypatch.setattr(shots, "get_connection", lambda: connection)

    response = client.get("/shots?season=2024")

    assert response.status_code == 200
    assert response.json() == []
    assert connection.params == (2024, 500, 0)
