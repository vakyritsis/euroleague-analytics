with source as (
    select *
    from {{ source('raw', 'raw_games') }}
),

cleaned as (
    select
        season,
        game_code,
        payload ->> 'date' as game_date,
        payload ->> 'time' as game_time,
        payload ->> 'hometeam' as home_team,
        payload ->> 'homecode' as home_team_code,
        nullif(payload ->> 'homescore', '')::integer as home_score,
        payload ->> 'awayteam' as away_team,
        payload ->> 'awaycode' as away_team_code,
        nullif(payload ->> 'awayscore', '')::integer as away_score,
        nullif(payload ->> 'played', '')::boolean as played,
        loaded_at
    from source
)

select *
from cleaned
