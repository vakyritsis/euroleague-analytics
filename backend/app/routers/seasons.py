from fastapi import APIRouter

from app.db import get_connection

router = APIRouter(prefix="/seasons", tags=["seasons"])


@router.get("", response_model=list[int])
def list_seasons() -> list[int]:
    query = """
        SELECT season FROM analytics.fct_game_results
        UNION
        SELECT season FROM analytics.fct_player_performance
        UNION
        SELECT season FROM analytics.fct_team_performance
        ORDER BY season DESC
    """
    with get_connection() as connection:
        rows = connection.execute(query, ()).fetchall()
    return [row["season"] for row in rows]
