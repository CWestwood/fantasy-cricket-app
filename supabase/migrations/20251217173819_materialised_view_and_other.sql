DROP MATERIALIZED VIEW IF EXISTS player_performance_summary CASCADE;

CREATE MATERIALIZED VIEW player_performance_summary AS
SELECT 
    tp.team_id,
    tp.player_id,
    p.name as player_name,
    p.role as player_role,
    p.team_name as cricket_team,
    m.id as match_id,
    m.match_name,
    m.match_date,
    m.status as match_status,
    -- Actual cricket stats (unchanged)
    md.batting_runs,
    md.batting_balls_faced,
    md.batting_six,
    md.batting_strike_rate,
    md.bowling_wickets,
    md.bowling_runs_conceded,
    md.bowling_overs,
    md.bowling_maiden_overs,
    md.bowling_noballs_wides,
    md.bowling_econ_rate,
    md.fielding_catches,
    md.fielding_runouts,
    md.fielding_stumpings,
    md.bonus_potm,
    -- Fantasy scores with captain multiplier (2x if captain, 1x if not)
    CASE 
        WHEN tp.is_captain THEN s.batting * 2
        ELSE s.batting
    END as batting,
    CASE 
        WHEN tp.is_captain THEN s.bowling * 2
        ELSE s.bowling
    END as bowling,
    CASE 
        WHEN tp.is_captain THEN s.fielding * 2
        ELSE s.fielding
    END as fielding,
    CASE 
        WHEN tp.is_captain THEN s.bonus * 2
        ELSE s.bonus
    END as bonus,
    CASE 
        WHEN tp.is_captain THEN s.total * 2
        ELSE s.total
    END as fantasy_total,
    -- Team context
    tp.is_captain,
    tp.added_at,
    tp.removed_at,
    -- Match context
    t.tournament_id,
    tr.name as tournament_name
FROM team_players tp
JOIN players p ON tp.player_id = p.id
JOIN teams t ON tp.team_id = t.id
JOIN tournaments tr ON t.tournament_id = tr.id
INNER JOIN match_data md ON p.id = md.player_id
INNER JOIN matches m ON md.match_id = m.id 
    AND t.tournament_id = m.tournament_id
    AND m.match_date >= tp.added_at
    AND (tp.removed_at IS NULL OR m.match_date < tp.removed_at)
LEFT JOIN scores s ON p.id = s.player_id AND m.id = s.match_id;

CREATE UNIQUE INDEX idx_player_perf_unique
ON player_performance_summary(team_id, player_id, match_id);

CREATE INDEX idx_player_perf_team_match ON player_performance_summary(team_id, match_id);
CREATE INDEX idx_player_perf_team_player ON player_performance_summary(team_id, player_id);


REFRESH MATERIALIZED VIEW CONCURRENTLY player_performance_summary;

CREATE OR REPLACE FUNCTION get_player_performance_unique(
  p_player_id uuid,
  p_tournament_id uuid
)
RETURNS TABLE (
  match_id uuid,
  match_name text,
  match_date timestamp,
  match_status text,
  batting numeric,
  bowling numeric,
  fielding numeric,
  bonus numeric,
  fantasy_total numeric
)
LANGUAGE sql
AS $$
  SELECT DISTINCT ON (match_id)
    match_id,
    match_name,
    match_date,
    match_status,
    batting,
    bowling,
    fielding,
    bonus,
    fantasy_total
  FROM player_performance_summary
  WHERE player_id = p_player_id
    AND tournament_id = p_tournament_id
  ORDER BY match_id, match_date ASC;
$$;