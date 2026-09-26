import pandas as pd

from ingestion.definitions import raw_play_by_play, raw_shots


class FakeShotData:
    def __init__(self):
        self.calls = []

    def get_game_shot_data(self, season, gamecode):
        self.calls.append((season, gamecode))
        return pd.DataFrame([{"TEAM": "MAD", "ID_PLAYER": " 1 ", "ID_ACTION": " 2FGM "}])


class FakePlayByPlay:
    def __init__(self):
        self.calls = []

    def get_game_play_by_play_data(self, season, gamecode, include_ishometeam=False):
        self.calls.append((season, gamecode, include_ishometeam))
        return pd.DataFrame([{"PLAYER": "Player 1", "CODETEAM": "MAD", "PLAYER_ID": " 7 ", "PLAYTYPE": " FGM ", "MARKERTIME": " 00:42 "}])


class FakePostgres:
    def __init__(self):
        self.calls = []

    def insert_json(self, table, key_columns, key_values, payload):
        self.calls.append({
            "table": table,
            "key_columns": key_columns,
            "key_values": key_values,
            "payload": payload,
        })


def test_raw_shots_asset_inserts_game_level_shot_rows():
    postgres = FakePostgres()
    euroleague = type("FakeEuroLeague", (), {"shot_data_client": lambda self: FakeShotData()})()

    result = raw_shots(
        season_game_codes=[{"gameCode": 101}, {"gameCode": 102}, {"gameCode": None}],
        euroleague=euroleague,
        postgres=postgres,
    )

    assert result == 2
    assert postgres.calls[0]["table"] == "raw_shots"
    assert postgres.calls[0]["key_values"] == (2025, 101)


def test_raw_play_by_play_asset_inserts_game_level_pbp_rows():
    postgres = FakePostgres()
    euroleague = type("FakeEuroLeague", (), {"play_by_play_client": lambda self: FakePlayByPlay()})()

    result = raw_play_by_play(
        season_game_codes=[{"gameCode": 201}, {"gameCode": 202}],
        euroleague=euroleague,
        postgres=postgres,
    )

    assert result == 2
    assert postgres.calls[0]["table"] == "raw_play_by_play"
    assert postgres.calls[0]["key_values"] == (2025, 201)
