from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.config import get_settings
from app.db import get_connection

router = APIRouter(prefix="/players", tags=["players"])


class PlayerPerformance(BaseModel):
    season: int
    player_id: str
    player_name: str | None
    team_code: str | None
    team_name: str | None
    games_played: int | None
    points: float | None
    points_per_game: float | None
    rebounds: float | None
    rebounds_per_game: float | None
    assists: float | None
    assists_per_game: float | None
    valuation: float | None
    field_goals_made: float | None
    field_goals_attempted: float | None
    field_goal_percentage: float | None
    three_point_field_goals_made: float | None
    three_point_field_goals_attempted: float | None
    three_point_percentage: float | None
    effective_field_goal_percentage: float | None


PLAYER_COLUMNS = """
    season, player_id, player_name, team_code, team_name, games_played,
    points, points_per_game, rebounds, rebounds_per_game, assists,
    assists_per_game, valuation, field_goals_made, field_goals_attempted,
    field_goal_percentage, three_point_field_goals_made,
    three_point_field_goals_attempted, three_point_percentage,
    effective_field_goal_percentage
"""


def _selected_season(season: int | None) -> int:
    return season if season is not None else get_settings().euroleague_season


@router.get("", response_model=list[PlayerPerformance])
def list_players(
    season: int | None = Query(default=None, ge=1900, le=2100),
    team_code: str | None = Query(default=None, min_length=1),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> list[PlayerPerformance]:
    query = f"""
        SELECT {PLAYER_COLUMNS}
        FROM analytics.fct_player_performance
        WHERE season = %s
    """
    params: list[object] = [_selected_season(season)]
    if team_code is not None:
        query += " AND team_code = %s"
        params.append(team_code)
    query += " ORDER BY points_per_game DESC NULLS LAST, player_name, player_id LIMIT %s OFFSET %s"
    params.extend((limit, offset))
    with get_connection() as connection:
        rows = connection.execute(query, tuple(params)).fetchall()
    return [PlayerPerformance.model_validate(row, from_attributes=False) for row in rows]


@router.get("/{player_id}", response_model=PlayerPerformance)
def get_player(
    player_id: str,
    season: int | None = Query(default=None, ge=1900, le=2100),
) -> PlayerPerformance:
    query = f"""
        SELECT {PLAYER_COLUMNS}
        FROM analytics.fct_player_performance
        WHERE season = %s AND player_id = %s
    """
    with get_connection() as connection:
        row = connection.execute(query, (_selected_season(season), player_id)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Player not found")
    return PlayerPerformance.model_validate(row, from_attributes=False)
