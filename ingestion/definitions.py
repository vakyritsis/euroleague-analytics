from dagster import Definitions, asset
from requests import HTTPError

from ingestion.config import get_settings
from ingestion.resources import EuroLeagueResource, PostgresResource


@asset
def season_game_codes(euroleague: EuroLeagueResource) -> list[dict[str, object]]:
    settings = get_settings()
    games = euroleague.client().get_gamecodes_season(settings.euroleague_season)
    return games.to_dict(orient="records")


@asset(deps=[season_game_codes])
def raw_games(
    season_game_codes: list[dict[str, object]],
    postgres: PostgresResource,
) -> int:
    settings = get_settings()
    for game in season_game_codes:
        game_code = game.get("gameCode") or game.get("game_code")
        if game_code is None:
            continue
        postgres.insert_json(
            "raw_games",
            ("season", "game_code"),
            (settings.euroleague_season, int(game_code)),
            game,
        )
    return len(season_game_codes)


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
        if game.get("Round") is not None and bool(game.get("played"))
    ]
    latest_round = max(rounds, default=1)
    standings_client = euroleague.standings_client()
    for round_number in range(latest_round, 0, -1):
        try:
            standings = standings_client.get_standings(settings.euroleague_season, round_number)
            latest_round = round_number
            break
        except HTTPError:
            continue
    else:
        raise RuntimeError("No valid standings round found")
    postgres.insert_json(
        "raw_standings",
        ("season", "competition"),
        (settings.euroleague_season, settings.euroleague_competition),
        {"round": latest_round, "rows": standings.to_dict(orient="records")},
    )
    return len(standings)


@asset
def raw_player_stats(
    euroleague: EuroLeagueResource,
    postgres: PostgresResource,
) -> int:
    settings = get_settings()
    statistic_mode = "Accumulated"
    stats = euroleague.player_stats_client().get_player_stats_leaders_single_season(
        settings.euroleague_season,
        top_n=500,
        statistic_mode=statistic_mode,
    )
    postgres.insert_json(
        "raw_player_stats",
        ("season", "endpoint", "statistic_mode"),
        (settings.euroleague_season, "leaders", statistic_mode),
        stats.to_dict(orient="records"),
    )
    return len(stats)


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
        game_code = game.get("gameCode") or game.get("game_code")
        if game_code is None:
            continue
        try:
            shots = shot_client.get_game_shot_data(settings.euroleague_season, int(game_code))
        except HTTPError:
            continue
        rows = shots.to_dict(orient="records") if hasattr(shots, "to_dict") else shots
        if not rows:
            continue
        postgres.insert_json(
            "raw_shots",
            ("season", "game_code"),
            (settings.euroleague_season, int(game_code)),
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
        game_code = game.get("gameCode") or game.get("game_code")
        if game_code is None:
            continue
        try:
            pbp = pbp_client.get_game_play_by_play_data(settings.euroleague_season, int(game_code))
        except HTTPError:
            continue
        rows = pbp.to_dict(orient="records") if hasattr(pbp, "to_dict") else pbp
        if not rows:
            continue
        postgres.insert_json(
            "raw_play_by_play",
            ("season", "game_code"),
            (settings.euroleague_season, int(game_code)),
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
