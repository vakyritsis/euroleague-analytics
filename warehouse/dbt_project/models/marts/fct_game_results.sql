select
    season,
    game_code,
    game_date,
    game_time,
    home_team,
    home_team_code,
    home_score,
    away_team,
    away_team_code,
    away_score,
    home_score - away_score as home_margin,
    played,
    loaded_at
from {{ ref('stg_games') }}
