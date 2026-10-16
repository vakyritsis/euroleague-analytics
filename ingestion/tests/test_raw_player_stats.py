import pandas as pd

from ingestion.definitions import raw_player_stats


class FakePlayerStats:
    def __init__(self):
        self.calls = []

    def get_player_stats_leaders_single_season(
        self,
        season,
        *,
        stat_category,
        top_n,
        statistic_mode,
    ):
        self.calls.append((season, stat_category, top_n, statistic_mode))
        return pd.DataFrame(
            [
                {
                    "playerCode": "001",
                    "playerName": "Player One",
                    "clubCodes": "MAD",
                    "clubNames": "Madrid",
                    "gamesPlayed": 10,
                    "total": 100,
                }
            ]
        )


class FakePostgres:
    def __init__(self):
        self.calls = []

    def insert_json(self, table, key_columns, key_values, payload):
        self.calls.append(
            {
                "table": table,
                "key_columns": key_columns,
                "key_values": key_values,
                "payload": payload,
            }
        )


def test_raw_player_stats_loads_categories_for_player_efficiency():
    player_stats = FakePlayerStats()
    postgres = FakePostgres()
    euroleague = type(
        "FakeEuroLeague",
        (),
        {"player_stats_client": lambda self: player_stats},
    )()

    result = raw_player_stats(euroleague=euroleague, postgres=postgres)

    expected_categories = [
        "Score",
        "TotalRebounds",
        "Assistances",
        "Valuation",
        "FieldGoalsMade2",
        "FieldGoalsAttempted2",
        "FieldGoalsMade3",
        "FieldGoalsAttempted3",
    ]
    assert result == len(expected_categories)
    assert [call[1] for call in player_stats.calls] == expected_categories
    assert all(call[0] == 2025 and call[2:] == (500, "Accumulated") for call in player_stats.calls)
    assert [call["key_values"][1] for call in postgres.calls] == [
        f"leaders:{category}" for category in expected_categories
    ]
    assert all(call["table"] == "raw_player_stats" for call in postgres.calls)
