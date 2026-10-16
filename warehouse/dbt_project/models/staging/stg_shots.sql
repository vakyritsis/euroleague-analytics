with source as (
    select
        season,
        game_code,
        payload,
        loaded_at
    from {{ source('raw', 'raw_shots') }}
),

shot_rows as (
    select
        source.season,
        source.game_code,
        source.loaded_at,
        shot.value as shot,
        shot.ordinality as source_ordinal
    from source
    cross join lateral jsonb_array_elements(
        case
            when jsonb_typeof(source.payload) = 'array' then source.payload
            else '[]'::jsonb
        end
    ) with ordinality as shot(value, ordinality)
),

cleaned as (
    select
        season,
        game_code,
        coalesce(
            nullif(shot ->> 'TEAM', ''),
            nullif(shot ->> 'team', ''),
            nullif(shot ->> 'CODETEAM', '')
        ) as team_code,
        coalesce(
            nullif(shot ->> 'ID_PLAYER', ''),
            nullif(shot ->> 'PLAYER_ID', ''),
            nullif(shot ->> 'playerCode', '')
        ) as player_id,
        coalesce(
            nullif(shot ->> 'ID_ACTION', ''),
            nullif(shot ->> 'ACTION', ''),
            nullif(shot ->> 'action', '')
        ) as action_type,
        nullif(
            coalesce(
                shot ->> 'COORD_X',
                shot ->> 'X',
                shot ->> 'x'
            ),
            ''
        )::numeric as x_coordinate,
        nullif(
            coalesce(
                shot ->> 'COORD_Y',
                shot ->> 'Y',
                shot ->> 'y'
            ),
            ''
        )::numeric as y_coordinate,
        nullif(coalesce(shot ->> 'PERIOD', shot ->> 'PERIOD_NUMBER'), '')::integer as period,
        nullif(coalesce(shot ->> 'MINUTE', shot ->> 'MARKERTIME'), '') as game_clock,
        (source_ordinal - 1)::bigint as shot_index,
        loaded_at
    from shot_rows
)

select
    *,
    jsonb_build_array(season, game_code, shot_index)::text as shot_key
from cleaned
