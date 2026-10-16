from fastapi import APIRouter, Query
from pydantic import BaseModel

from app.config import get_settings
from app.db import get_connection

router = APIRouter(prefix="/shots", tags=["shots"])


class Shot(BaseModel):
    season: int
    game_code: int
    team_code: str | None
    player_id: str | None
    action_type: str | None
    x_coordinate: float | None
    y_coordinate: float | None
    period: int | None
    game_clock: str | None
    shot_index: int


@router.get("", response_model=list[Shot])
def list_shots(
    season: int | None = Query(default=None, ge=1900, le=2100),
    player_id: str | None = Query(default=None, min_length=1),
    team_code: str | None = Query(default=None, min_length=1),
    game_code: int | None = Query(default=None, ge=1),
    limit: int = Query(default=500, ge=1, le=2000),
    offset: int = Query(default=0, ge=0),
) -> list[Shot]:
    selected_season = season if season is not None else get_settings().euroleague_season
    query = """
        SELECT season, game_code, team_code, player_id, action_type,
               x_coordinate, y_coordinate, period, game_clock, shot_index
        FROM analytics.stg_shots
        WHERE season = %s
    """
    params: list[object] = [selected_season]
    for column, value in (
        ("player_id", player_id),
        ("team_code", team_code),
        ("game_code", game_code),
    ):
        if value is not None:
            query += f" AND {column} = %s"
            params.append(value)
    query += " ORDER BY game_code, shot_index LIMIT %s OFFSET %s"
    params.extend((limit, offset))
    with get_connection() as connection:
        rows = connection.execute(query, tuple(params)).fetchall()
    return [Shot.model_validate(row, from_attributes=False) for row in rows]
