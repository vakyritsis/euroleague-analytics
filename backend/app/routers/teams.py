from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.config import get_settings
from app.db import get_connection

router = APIRouter(tags=["teams"])


class TeamStanding(BaseModel):
    team_code: str
    team_name: str
    games_played: int
    wins: int
    losses: int
    points_for: int
    points_against: int
    point_difference: int


STANDINGS_QUERY = """
    WITH team_games AS (
        SELECT home_team_code AS team_code, home_team AS team_name,
               home_score AS points_for, away_score AS points_against,
               CASE WHEN home_score > away_score THEN 1 ELSE 0 END AS win
        FROM analytics.fct_game_results
        WHERE season = %s AND played = true
        UNION ALL
        SELECT away_team_code, away_team, away_score, home_score,
               CASE WHEN away_score > home_score THEN 1 ELSE 0 END
        FROM analytics.fct_game_results
        WHERE season = %s AND played = true
    )
    SELECT team_code, team_name, COUNT(*)::integer AS games_played,
           SUM(win)::integer AS wins, (COUNT(*) - SUM(win))::integer AS losses,
           SUM(points_for)::integer AS points_for,
           SUM(points_against)::integer AS points_against,
           (SUM(points_for) - SUM(points_against))::integer AS point_difference
    FROM team_games
    WHERE team_code IS NOT NULL
    GROUP BY team_code, team_name
"""

STANDINGS_ORDER = " ORDER BY wins DESC, point_difference DESC, team_name"


@router.get("/standings", response_model=list[TeamStanding])
def standings(season: int = Query(default=None)) -> list[TeamStanding]:
    selected_season = season or get_settings().euroleague_season
    with get_connection() as connection:
        rows = connection.execute(STANDINGS_QUERY + STANDINGS_ORDER, (selected_season, selected_season)).fetchall()
    return [TeamStanding.model_validate(row, from_attributes=False) for row in rows]


@router.get("/teams/{team_code}", response_model=TeamStanding)
def team_summary(team_code: str, season: int = Query(default=None)) -> TeamStanding:
    selected_season = season or get_settings().euroleague_season
    query = f"{STANDINGS_QUERY} HAVING team_code = %s"
    with get_connection() as connection:
        row = connection.execute(query, (selected_season, selected_season, team_code)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Team not found")
    return TeamStanding.model_validate(row, from_attributes=False)
