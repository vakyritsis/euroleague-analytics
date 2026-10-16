with source as (
    select
        season,
        game_code,
        payload,
        loaded_at
    from {{ source('raw', 'raw_play_by_play') }}
),

event_rows as (
    select
        source.season,
        source.game_code,
        source.loaded_at,
        event.value as event,
        event.ordinality as source_ordinal
    from source
    cross join lateral jsonb_array_elements(
        case
            when jsonb_typeof(source.payload) = 'array' then source.payload
            else '[]'::jsonb
        end
    ) with ordinality as event(value, ordinality)
),

cleaned as (
    select
        season,
        game_code,
        nullif(coalesce(event ->> 'PERIOD', event ->> 'period'), '')::integer as period,
        nullif(
            coalesce(
                event ->> 'TRUE_NUMBEROFPLAY',
                event ->> 'NUMBEROFPLAY',
                event ->> 'numberOfPlay'
            ),
            ''
        )::integer as play_number,
        nullif(coalesce(event ->> 'MARKERTIME', event ->> 'markertime'), '') as game_clock,
        coalesce(
            nullif(event ->> 'PLAYTYPE', ''),
            nullif(event ->> 'playType', '')
        ) as play_type,
        coalesce(
            nullif(event ->> 'SUBTYPE', ''),
            nullif(event ->> 'subType', '')
        ) as play_subtype,
        coalesce(
            nullif(event ->> 'CODETEAM', ''),
            nullif(event ->> 'teamCode', '')
        ) as team_code,
        coalesce(
            nullif(event ->> 'PLAYER_ID', ''),
            nullif(event ->> 'playerId', '')
        ) as player_id,
        coalesce(
            nullif(event ->> 'PLAYER', ''),
            nullif(event ->> 'player', '')
        ) as player_name,
        nullif(coalesce(event ->> 'POINTS_A', event ->> 'pointsA'), '')::integer
            as home_score,
        nullif(coalesce(event ->> 'POINTS_B', event ->> 'pointsB'), '')::integer
            as away_score,
        (source_ordinal - 1)::bigint as event_index,
        loaded_at
    from event_rows
)

select
    *,
    jsonb_build_array(season, game_code, event_index)::text as event_key
from cleaned
