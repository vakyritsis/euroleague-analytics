from fastapi import APIRouter, Query
from pydantic import BaseModel

from app.config import get_settings
from app.db import get_connection

router = APIRouter(prefix="/games", tags=["games"])


class GameResult(BaseModel):
    season: int
    game_code: int
    game_date: str | None
    game_time: str | None
    home_team: str | None
    home_team_code: str | None
    home_score: int | None
    away_team: str | None
    away_team_code: str | None
    away_score: int | None
    home_margin: int | None
    played: bool | None


@router.get("", response_model=list[GameResult])
def list_games(
    season: int = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
) -> list[GameResult]:
    selected_season = season or get_settings().euroleague_season
    query = """
        SELECT season, game_code, game_date, game_time, home_team,
               home_team_code, home_score, away_team, away_team_code,
               away_score, home_margin, played
        FROM analytics.fct_game_results
        WHERE season = %s
        ORDER BY game_date, game_code
        LIMIT %s
    """
    with get_connection() as connection:
        rows = connection.execute(query, (selected_season, limit)).fetchall()
    return [GameResult.model_validate(row, from_attributes=False) for row in rows]


@router.get("/{game_code}", response_model=GameResult)
def get_game(game_code: int, season: int = Query(default=None)) -> GameResult:
    selected_season = season or get_settings().euroleague_season
    query = """
        SELECT season, game_code, game_date, game_time, home_team,
               home_team_code, home_score, away_team, away_team_code,
               away_score, home_margin, played
        FROM analytics.fct_game_results
        WHERE season = %s AND game_code = %s
    """
    with get_connection() as connection:
        row = connection.execute(query, (selected_season, game_code)).fetchone()
    if row is None:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Game not found")
    return GameResult.model_validate(row, from_attributes=False)
