CREATE TABLE IF NOT EXISTS raw_standings (
    season INTEGER NOT NULL,
    competition TEXT NOT NULL,
    loaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    payload JSONB NOT NULL,
    PRIMARY KEY (season, competition)
);

CREATE TABLE IF NOT EXISTS raw_games (
    season INTEGER NOT NULL,
    game_code INTEGER NOT NULL,
    loaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    payload JSONB NOT NULL,
    PRIMARY KEY (season, game_code)
);

CREATE TABLE IF NOT EXISTS raw_player_stats (
    season INTEGER NOT NULL,
    endpoint TEXT NOT NULL,
    statistic_mode TEXT NOT NULL,
    loaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    payload JSONB NOT NULL,
    PRIMARY KEY (season, endpoint, statistic_mode)
);

CREATE TABLE IF NOT EXISTS raw_shots (
    season INTEGER NOT NULL,
    game_code INTEGER NOT NULL,
    loaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    payload JSONB NOT NULL,
    PRIMARY KEY (season, game_code)
);

CREATE TABLE IF NOT EXISTS raw_play_by_play (
    season INTEGER NOT NULL,
    game_code INTEGER NOT NULL,
    loaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    payload JSONB NOT NULL,
    PRIMARY KEY (season, game_code)
);
