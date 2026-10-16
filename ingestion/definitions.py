import logging
import time
from collections.abc import Callable

from dagster import Definitions, asset
from requests import HTTPError
from requests.exceptions import ConnectionError as RequestsConnectionError, RequestException, Timeout

from ingestion.config import get_settings
from ingestion.resources import EuroLeagueResource, PostgresResource

logger = logging.getLogger(__name__)


def _to_rows(payload: object) -> list[object]:
    if payload is None:
        return []
    if hasattr(payload, "to_dict"):
        payload = payload.to_dict(orient="records")
    if isinstance(payload, dict):
        for key in ("rows", "data", "results"):
            value = payload.get(key)
            if isinstance(value, list):
                return value
        return [payload]
    if isinstance(payload, list):
        return payload
    return [payload]


def _normalize_game_code(game: object) -> int | None:
    if not isinstance(game, dict):
        return None
    game_code = game.get("gameCode")
    if game_code is None:
        game_code = game.get("game_code")
    if game_code in (None, ""):
        return None
    try:
        return int(game_code)
    except (TypeError, ValueError):
        logger.warning("Skipping game with invalid game_code=%r", game_code)
        return None


def _is_retryable_error(error: RequestException) -> bool:
    if isinstance(error, (Timeout, RequestsConnectionError)):
        return True
    if isinstance(error, HTTPError):
        response = getattr(error, "response", None)
        if response is None:
            return False
        return getattr(response, "status_code", None) in {429, 500, 502, 503, 504}
    return False


def _fetch_with_retry(
    operation: Callable[[], object],
    *,
    context: str,
    retries: int = 3,
    backoff_seconds: float = 0.5,
) -> object:
    for attempt in range(1, retries + 1):
        try:
            return operation()
        except RequestException as exc:
            if not _is_retryable_error(exc):
                raise
            if attempt == retries:
                logger.warning("API request failed for %s after %s attempts: %s", context, retries, exc)
                raise
            delay = backoff_seconds * (2 ** (attempt - 1))
            logger.warning(
                "Transient API failure for %s on attempt %s/%s; retrying in %.1fs: %s",
                context,
                attempt,
                retries,
                delay,
                exc,
            )
            time.sleep(delay)
    raise RuntimeError(f"Request failed for {context} without a retryable API exception")


@asset
def season_game_codes(euroleague: EuroLeagueResource) -> list[dict[str, object]]:
    settings = get_settings()
    try:
        games = _fetch_with_retry(
            lambda: euroleague.client().get_gamecodes_season(settings.euroleague_season),
            context=f"season {settings.euroleague_season} game codes",
        )
    except RequestException:
        logger.warning(
            "Skipping season game code fetch for season=%s because the API request failed",
            settings.euroleague_season,
        )
        return []
    return _to_rows(games)


@asset(deps=[season_game_codes])
def raw_games(
    season_game_codes: list[dict[str, object]],
    postgres: PostgresResource,
) -> int:
    settings = get_settings()
    inserted = 0
    for game in season_game_codes:
        game_code = _normalize_game_code(game)
        if game_code is None:
            logger.warning("Skipping raw_games row with missing or invalid game metadata: %s", game)
            continue
        postgres.insert_json(
            "raw_games",
            ("season", "game_code"),
            (settings.euroleague_season, game_code),
            game,
        )
        inserted += 1
    return inserted


@asset(deps=[season_game_codes])
def raw_standings(
    season_game_codes: list[dict[str, object]],
    euroleague: EuroLeagueResource,
    postgres: PostgresResource,
) -> int:
    settings = get_settings()
    rounds = [
        int(game["Round"])
        for game in season_game_codes
        if isinstance(game, dict) and game.get("Round") is not None and bool(game.get("played"))
    ]
    latest_round = max(rounds, default=1)
    standings_client = euroleague.standings_client()
    standings = None
    for round_number in range(latest_round, 0, -1):
        try:
            standings = _fetch_with_retry(
                lambda: standings_client.get_standings(settings.euroleague_season, round_number),
                context=f"standings for season {settings.euroleague_season} round {round_number}",
            )
            latest_round = round_number
            break
        except RequestException as error:
            logger.warning(
                "Skipping standings for season=%s round=%s because the API request failed: %s",
                settings.euroleague_season,
                round_number,
                error,
            )
    if standings is None:
        logger.warning(
            "No valid standings payload found for season=%s; skipping the raw_standings insert",
            settings.euroleague_season,
        )
        return 0
    rows = _to_rows(standings)
    if not rows:
        logger.warning(
            "Skipping raw_standings for season=%s because the response was empty",
            settings.euroleague_season,
        )
        return 0
    postgres.insert_json(
        "raw_standings",
        ("season", "competition"),
        (settings.euroleague_season, settings.euroleague_competition),
        {"round": latest_round, "rows": rows},
    )
    return len(rows)


@asset
def raw_player_stats(
    euroleague: EuroLeagueResource,
    postgres: PostgresResource,
) -> int:
    settings = get_settings()
    statistic_mode = "Accumulated"
    stat_categories = (
        "Score",
        "TotalRebounds",
        "Assistances",
        "Valuation",
        "FieldGoalsMade2",
        "FieldGoalsAttempted2",
        "FieldGoalsMade3",
        "FieldGoalsAttempted3",
    )
    player_stats_client = euroleague.player_stats_client()
    inserted = 0
    for category in stat_categories:
        try:
            stats = _fetch_with_retry(
                lambda: player_stats_client.get_player_stats_leaders_single_season(
                    settings.euroleague_season,
                    stat_category=category,
                    top_n=500,
                    statistic_mode=statistic_mode,
                ),
                context=f"player stats category={category} for season {settings.euroleague_season}",
            )
        except RequestException as error:
            logger.warning(
                "Skipping raw player stats category=%s for season=%s after API request failed: %s",
                category,
                settings.euroleague_season,
                error,
            )
            continue
        rows = _to_rows(stats)
        if not rows:
            logger.warning(
                "Skipping empty raw player stats category=%s for season=%s",
                category,
                settings.euroleague_season,
            )
            continue
        postgres.insert_json(
            "raw_player_stats",
            ("season", "endpoint", "statistic_mode"),
            (settings.euroleague_season, f"leaders:{category}", statistic_mode),
            rows,
        )
        inserted += len(rows)
    return inserted


@asset(deps=[season_game_codes])
def raw_shots(
    season_game_codes: list[dict[str, object]],
    euroleague: EuroLeagueResource,
    postgres: PostgresResource,
) -> int:
    settings = get_settings()
    shot_client = euroleague.shot_data_client()
    inserted = 0
    for game in season_game_codes:
        game_code = _normalize_game_code(game)
        if game_code is None:
            continue
        try:
            shots = _fetch_with_retry(
                lambda: shot_client.get_game_shot_data(settings.euroleague_season, game_code),
                context=f"shots for game_code={game_code}",
            )
        except RequestException as error:
            logger.warning(
                "Skipping raw shots for game_code=%s after API request failed: %s",
                game_code,
                error,
            )
            continue
        rows = _to_rows(shots)
        if not rows:
            logger.warning("Skipping raw shots for game_code=%s because the payload was empty", game_code)
            continue
        postgres.insert_json(
            "raw_shots",
            ("season", "game_code"),
            (settings.euroleague_season, game_code),
            rows,
        )
        inserted += 1
    return inserted


@asset(deps=[season_game_codes])
def raw_play_by_play(
    season_game_codes: list[dict[str, object]],
    euroleague: EuroLeagueResource,
    postgres: PostgresResource,
) -> int:
    settings = get_settings()
    pbp_client = euroleague.play_by_play_client()
    inserted = 0
    for game in season_game_codes:
        game_code = _normalize_game_code(game)
        if game_code is None:
            continue
        try:
            pbp = _fetch_with_retry(
                lambda: pbp_client.get_game_play_by_play_data(settings.euroleague_season, game_code),
                context=f"play-by-play for game_code={game_code}",
            )
        except RequestException as error:
            logger.warning(
                "Skipping raw play-by-play for game_code=%s after API request failed: %s",
                game_code,
                error,
            )
            continue
        rows = _to_rows(pbp)
        if not rows:
            logger.warning(
                "Skipping raw play-by-play for game_code=%s because the payload was empty",
                game_code,
            )
            continue
        postgres.insert_json(
            "raw_play_by_play",
            ("season", "game_code"),
            (settings.euroleague_season, game_code),
            rows,
        )
        inserted += 1
    return inserted


defs = Definitions(
    assets=[
        season_game_codes,
        raw_games,
        raw_standings,
        raw_player_stats,
        raw_shots,
        raw_play_by_play,
    ],
    resources={"euroleague": EuroLeagueResource(), "postgres": PostgresResource()},
)
