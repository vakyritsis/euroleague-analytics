with source as (
    select
        season,
        competition,
        loaded_at,
        (payload ->> 'round')::integer as standings_round,
        case
            when jsonb_typeof(payload -> 'rows') = 'array' then payload -> 'rows'
            else '[]'::jsonb
        end as rows
    from {{ source('raw', 'raw_standings') }}
),

team_rows as (
    select
        source.season,
        source.competition,
        source.loaded_at,
        source.standings_round,
        team.value as team,
        team.ordinality as source_ordinal
    from source
    cross join lateral jsonb_array_elements(source.rows) with ordinality as team(value, ordinality)
),

team_stats as (
    select
        season,
        competition,
        standings_round,
        nullif(team ->> 'club.code', '') as team_code,
        coalesce(
            nullif(team ->> 'club.name', ''),
            nullif(team ->> 'club.editorialName', '')
        ) as team_name,
        nullif(team ->> 'position', '')::integer as league_position,
        nullif(team ->> 'gamesPlayed', '')::integer as games_played,
        nullif(team ->> 'gamesWon', '')::integer as wins,
        nullif(team ->> 'gamesLost', '')::integer as losses,
        nullif(team ->> 'pointsFor', '')::numeric as points_for,
        nullif(team ->> 'pointsAgainst', '')::numeric as points_against,
        nullif(team ->> 'pointsDifference', '')::numeric as point_differential,
        nullif(replace(team ->> 'winPercentage', '%', ''), '')::numeric / 100.0
            as source_win_percentage,
        loaded_at
    from team_rows
)

select
    season,
    competition,
    standings_round,
    team_code,
    team_name,
    league_position,
    games_played,
    wins,
    losses,
    points_for,
    points_against,
    coalesce(point_differential, points_for - points_against) as point_differential,
    coalesce(
        source_win_percentage,
        wins::numeric / nullif(games_played, 0)
    ) as win_percentage,
    points_for / nullif(games_played, 0) as points_for_per_game,
    points_against / nullif(games_played, 0) as points_against_per_game,
    loaded_at,
    jsonb_build_array(season, competition, team_code)::text as team_season_key
from team_stats
