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
        case
            when endpoint = 'leaders' then 'TimePlayed'
            else nullif(split_part(endpoint, ':', 2), '')
        end as stat_category,
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
            nullif(player ->> 'clubCodes', ''),
            nullif(player ->> 'teamCode', ''),
            nullif(player ->> 'CODETEAM', ''),
            nullif(player ->> 'TEAM', '')
        ) as team_code,
        coalesce(
            nullif(player ->> 'clubNames', ''),
            nullif(player ->> 'team', ''),
            nullif(player ->> 'teamName', ''),
            nullif(player ->> 'TEAM_NAME', '')
        ) as team_name,
        nullif(coalesce(player ->> 'gamesPlayed', player ->> 'GAMES_PLAYED'), '')::integer as games_played,
        nullif(coalesce(player ->> 'gamesStarted', player ->> 'GAMES_STARTED'), '')::integer
            as games_started,
        nullif(coalesce(player ->> 'total', player ->> 'TOTAL'), '')::numeric as stat_total,
        nullif(
            coalesce(player ->> 'averagePerGame', player ->> 'AVERAGE_PER_GAME'),
            ''
        )::numeric as stat_per_game,
        nullif(
            coalesce(player ->> 'averagePer100Possessions', player ->> 'AVERAGE_PER_100_POSSESSIONS'),
            ''
        )::numeric as stat_per_100_possessions,
        source_ordinal
    from player_rows
)

select
    *,
    jsonb_build_array(season, stat_category, player_id)::text
        as player_season_key
from cleaned
