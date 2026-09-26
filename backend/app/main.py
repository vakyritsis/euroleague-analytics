from fastapi import FastAPI
import psycopg

from app.db import get_connection
from app.routers.games import router as games_router
from app.routers.teams import router as teams_router

app = FastAPI(title="EuroLeague Analytics API", version="0.1.0")
app.include_router(games_router)
app.include_router(teams_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/health/db")
def database_health() -> dict[str, str]:
    try:
        with get_connection() as connection:
            connection.execute("SELECT 1")
        return {"status": "ok"}
    except psycopg.Error:
        return {"status": "unavailable"}
