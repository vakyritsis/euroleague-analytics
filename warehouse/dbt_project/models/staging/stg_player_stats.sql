with source as (
    select
        season,
        endpoint,
        statistic_mode,
        payload,
        loaded_at
    from {{ source('raw', 'raw_player_stats') }}
),

player_rows as (
    select
        source.season,
        source.endpoint,
        source.statistic_mode,
        source.loaded_at,
        player.value as player,
        player.ordinality as source_ordinal
    from source
    cross join lateral jsonb_array_elements(
        case
            when jsonb_typeof(source.payload) = 'array' then source.payload
            else '[]'::jsonb
        end
    ) with ordinality as player(value, ordinality)
),

cleaned as (
    select
        season,
        endpoint,
        statistic_mode,
        loaded_at,
        coalesce(
            nullif(player ->> 'playerCode', ''),
            nullif(player ->> 'playerId', ''),
            nullif(player ->> 'PLAYER_ID', '')
        ) as player_id,
        coalesce(
            nullif(player ->> 'player', ''),
            nullif(player ->> 'playerName', ''),
            nullif(player ->> 'PLAYER', '')
        ) as player_name,
        coalesce(
            nullif(player ->> 'teamCode', ''),
            nullif(player ->> 'CODETEAM', ''),
            nullif(player ->> 'TEAM', '')
        ) as team_code,
        coalesce(
            nullif(player ->> 'team', ''),
            nullif(player ->> 'teamName', ''),
            nullif(player ->> 'TEAM_NAME', '')
        ) as team_name,
        nullif(coalesce(player ->> 'gamesPlayed', player ->> 'GAMES_PLAYED'), '')::integer
            as games_played,
        nullif(coalesce(player ->> 'gamesStarted', player ->> 'GAMES_STARTED'), '')::integer
            as games_started,
        nullif(coalesce(player ->> 'points', player ->> 'POINTS'), '')::numeric as points,
        nullif(coalesce(player ->> 'totalRebounds', player ->> 'TOTAL_REBOUNDS'), '')::numeric
            as rebounds,
        nullif(
            coalesce(
                player ->> 'assistances',
                player ->> 'assists',
                player ->> 'ASSISTS'
            ),
            ''
        )::numeric as assists,
        nullif(coalesce(player ->> 'steals', player ->> 'STEALS'), '')::numeric as steals,
        nullif(coalesce(player ->> 'valuation', player ->> 'VALUATION'), '')::numeric
            as valuation,
        nullif(
            coalesce(
                player ->> 'effectiveFeildGoalPercentage',
                player ->> 'effectiveFieldGoalPercentage',
                player ->> 'EFG_PERCENT'
            ),
            ''
        )::numeric as efg_percent,
        source_ordinal
    from player_rows
)

select
    *,
    jsonb_build_array(season, endpoint, statistic_mode, player_id)::text
        as player_season_key
from cleaned
