with player_category_stats as (
    select
        season,
        player_id,
        max(player_name) as player_name,
        max(team_code) as team_code,
        max(team_name) as team_name,
        max(games_played) as games_played,
        max(stat_total) filter (where stat_category = 'Score') as points,
        max(stat_total) filter (where stat_category = 'TotalRebounds') as rebounds,
        max(stat_total) filter (where stat_category = 'Assistances') as assists,
        max(stat_total) filter (where stat_category = 'Valuation') as valuation,
        max(stat_total) filter (where stat_category = 'FieldGoalsMade2') as two_point_field_goals_made,
        max(stat_total) filter (where stat_category = 'FieldGoalsAttempted2') as two_point_field_goals_attempted,
        max(stat_total) filter (where stat_category = 'FieldGoalsMade3') as three_point_field_goals_made,
        max(stat_total) filter (where stat_category = 'FieldGoalsAttempted3') as three_point_field_goals_attempted,
        max(loaded_at) as loaded_at
    from {{ ref('stg_player_stats') }}
    where stat_category in (
        'Score',
        'TotalRebounds',
        'Assistances',
        'Valuation',
        'FieldGoalsMade2',
        'FieldGoalsAttempted2',
        'FieldGoalsMade3',
        'FieldGoalsAttempted3'
    )
    group by season, player_id
),

totals as (
    select
        *,
        coalesce(two_point_field_goals_made, 0)
            + coalesce(three_point_field_goals_made, 0) as field_goals_made,
        coalesce(two_point_field_goals_attempted, 0)
            + coalesce(three_point_field_goals_attempted, 0) as field_goals_attempted
    from player_category_stats
)

select
    season,
    player_id,
    player_name,
    team_code,
    team_name,
    games_played,
    points,
    points / nullif(games_played, 0) as points_per_game,
    rebounds,
    rebounds / nullif(games_played, 0) as rebounds_per_game,
    assists,
    assists / nullif(games_played, 0) as assists_per_game,
    valuation,
    field_goals_made,
    field_goals_attempted,
    field_goals_made / nullif(field_goals_attempted, 0) as field_goal_percentage,
    three_point_field_goals_made,
    three_point_field_goals_attempted,
    three_point_field_goals_made
        / nullif(three_point_field_goals_attempted, 0) as three_point_percentage,
    (
        field_goals_made + 0.5 * coalesce(three_point_field_goals_made, 0)
    ) / nullif(field_goals_attempted, 0) as effective_field_goal_percentage,
    loaded_at,
    jsonb_build_array(season, player_id)::text as player_season_key
from totals
