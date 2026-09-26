import json
import math

import psycopg
from dagster import ConfigurableResource
from euroleague_api.EuroLeagueData import EuroLeagueData
from euroleague_api.play_by_play_data import PlayByPlay
from euroleague_api.player_stats import PlayerStats
from euroleague_api.shot_data import ShotData
from euroleague_api.standings import Standings

from ingestion.config import get_settings


def _json_safe(value: object) -> object:
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if isinstance(value, dict):
        return {key: _json_safe(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_json_safe(item) for item in value]
    return value


class EuroLeagueResource(ConfigurableResource):
    competition: str = "E"

    def client(self) -> EuroLeagueData:
        return EuroLeagueData(competition=self.competition)

    def standings_client(self) -> Standings:
        return Standings(competition=self.competition)

    def player_stats_client(self) -> PlayerStats:
        return PlayerStats(competition=self.competition)

    def shot_data_client(self) -> ShotData:
        return ShotData(competition=self.competition)

    def play_by_play_client(self) -> PlayByPlay:
        return PlayByPlay(competition=self.competition)


class PostgresResource(ConfigurableResource):
    database_url: str = get_settings().database_url

    def connect(self):
        connection_string = self.database_url.replace("postgresql+psycopg://", "postgresql://", 1)
        return psycopg.connect(connection_string)

    def insert_json(self, table: str, key_columns: tuple[str, ...], key_values: tuple[object, ...], payload: object) -> None:
        columns = ", ".join((*key_columns, "payload"))
        placeholders = ", ".join(["%s"] * (len(key_columns) + 1))
        conflict_columns = ", ".join(key_columns)
        query = f"""
            INSERT INTO {table} ({columns})
            VALUES ({placeholders})
            ON CONFLICT ({conflict_columns}) DO UPDATE
            SET loaded_at = NOW(), payload = EXCLUDED.payload
        """
        with self.connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(query, (*key_values, json.dumps(_json_safe(payload), default=str)))
