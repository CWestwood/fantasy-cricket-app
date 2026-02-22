-- Get current leaderboard
CREATE OR REPLACE FUNCTION get_leaderboard(p_tournament_id uuid)
RETURNS TABLE (
    team_id uuid,
    team_name text,
    stage_id uuid,
    user_id uuid,
    username text,
    total numeric,
    batting_total numeric,
    bowling_total numeric,
    fielding_total numeric,
    bonus_total numeric,
    rank_position integer,
    rank_change integer,
    updated_at timestamptz
)
LANGUAGE sql
STABLE
AS $$
    SELECT 
        team_id,
        team_name,
        stage_id,
        user_id,
        username,
        total,
        batting_total,
        bowling_total,
        fielding_total,
        bonus_total,
        rank_position,
        COALESCE((
            SELECT h.rank_change 
            FROM tournament_leaderboard_history h 
            WHERE h.team_id = c.team_id 
              AND h.tournament_id = c.tournament_id 
            ORDER BY h.created_at DESC 
            LIMIT 1
        ), 0) as rank_change,
        updated_at
    FROM tournament_leaderboard_cache c
    WHERE tournament_id = p_tournament_id
    ORDER BY rank_position;
$$;

-- Get leaderboard at a specific match
CREATE OR REPLACE FUNCTION get_leaderboard_at_match(
    p_tournament_id uuid,
    p_match_id uuid
)
RETURNS TABLE (
    team_id uuid,
    team_name text,
    stage_id uuid,
    user_id uuid,
    username text,
    total numeric,
    batting_total numeric,
    bowling_total numeric,
    fielding_total numeric,
    bonus_total numeric,
    rank_position integer,
    rank_change integer
)
LANGUAGE sql
STABLE
AS $$
    SELECT 
        team_id,
        team_name,
        stage_id,
        user_id,
        username,
        total,
        batting_total,
        bowling_total,
        fielding_total,
        bonus_total,
        rank_position,
        rank_change
    FROM tournament_leaderboard_history
    WHERE tournament_id = p_tournament_id
      AND match_id = p_match_id
    ORDER BY rank_position;
$$;

-- Get team's progression
CREATE OR REPLACE FUNCTION get_team_progression(
    p_tournament_id uuid,
    p_team_id uuid
)
RETURNS TABLE (
    match_id uuid,
    match_name text,
    match_date timestamptz,
    rank_position integer,
    rank_change integer,
    total numeric,
    points_gained numeric
)
LANGUAGE sql
STABLE
AS $$
    SELECT 
        h.match_id,
        m.match_name,
        m.match_date,
        h.rank_position,
        h.rank_change,
        h.total,
        ts.total as points_gained
    FROM tournament_leaderboard_history h
    JOIN matches m ON h.match_id = m.id
    LEFT JOIN team_scores ts ON ts.match_id = h.match_id AND ts.team_id = h.team_id
    WHERE h.tournament_id = p_tournament_id
      AND h.team_id = p_team_id
    ORDER BY m.match_date;
$$;

CREATE OR REPLACE FUNCTION public.submit_team(
  p_tournament_id UUID,
  p_stage TEXT,
  p_stage_id UUID,
  p_team_name TEXT,
  p_players JSONB,
  p_captain_id UUID,
)
RETURNS UUID -- Return the team_id for confirmation
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_team_id UUID;
  player_record JSONB;
  current_player_id UUID;
BEGIN
  -- Step 1: Upsert the team details into the 'teams' table
  INSERT INTO public.teams (user_id, tournament_id, stage, stage_id, team_name, subs_used)
  VALUES (
    auth.uid(),
    p_tournament_id,
    p_stage,
    p_stage_id,
    p_team_name,
    0
  )
  ON CONFLICT (user_id, tournament_id, stage_id)
  DO UPDATE SET
    team_name = EXCLUDED.team_name,
    subs_used = EXCLUDED.subs_used
  RETURNING id INTO v_team_id;

  -- Step 2: Remove old players
  DELETE FROM public.team_players WHERE team_id = v_team_id;

  -- Step 3: Insert new players
  IF p_players IS NOT NULL AND jsonb_array_length(p_players) > 0 THEN
    FOR player_record IN SELECT * FROM jsonb_array_elements(p_players)
    LOOP
      current_player_id := (player_record->>'id')::UUID;
      INSERT INTO public.team_players (team_id, player_id, is_captain, stage_id, is_substituted)
      VALUES (
        v_team_id,
        current_player_id,
        current_player_id = p_captain_id,
        p_stage_id,
        false
      );
    END LOOP;
  END IF;

  RETURN v_team_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_available_players(
  p_tournament_id uuid,
  p_user_id uuid,
  p_stage text DEFAULT 'group',
  p_stage_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_roles text[] DEFAULT NULL,
  p_countries text[] DEFAULT NULL,
  p_limit int DEFAULT 400,
  p_offset int DEFAULT 0
)
RETURNS TABLE(
  player_id uuid,
  name text,
  role text,
  country_id uuid,
  country_name text,
  team_name text,
  multiplier numeric,
  picks_count int,
  selected_by_user boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH picks AS (
    SELECT tp.player_id, COUNT(*)::int AS cnt
    FROM team_players tp
    JOIN teams t ON tp.team_id = t.id 
        AND t.tournament_id = p_tournament_id 
        AND (p_stage_id IS NULL OR t.stage_id = p_stage_id)
    GROUP BY tp.player_id
  )
  SELECT
    p.id AS player_id,
    p.name,
    p.role,
    c.id AS country_id,
    c.name AS country_name,
    p.team_name,
    p.multiplier,
    COALESCE(pc.cnt, 0) AS picks_count,
    EXISTS (
      SELECT 1 FROM team_players tp2
      JOIN teams t2 ON tp2.team_id = t2.id
      WHERE tp2.player_id = p.id
        AND t2.user_id = p_user_id
        AND t2.tournament_id = p_tournament_id
        AND (p_stage_id IS NULL OR t2.stage_id = p_stage_id)
    ) AS selected_by_user
  FROM squads p
  LEFT JOIN countries c ON c.sportsmonk_id = p.country_id
  LEFT JOIN picks pc ON pc.player_id = p.id
  WHERE (p.tournament_id = p_tournament_id OR p.tournament_id IS NULL)
    AND (
      p_search IS NULL OR (
        p.name ILIKE '%' || p_search || '%' OR
        c.name ILIKE '%' || p_search || '%'
      )
    )
    AND (p_roles IS NULL OR p.role = ANY(p_roles))
    AND (p_countries IS NULL OR c.name = ANY(p_countries))
  ORDER BY picks_count DESC, lower(p.name)
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- Grant execute to authenticated users (if using RLS and authenticated role)
GRANT EXECUTE ON FUNCTION public.get_available_players(uuid, uuid, text, uuid, text, text[], text[], int, int) TO authenticated;

CREATE OR REPLACE FUNCTION calculate_all_team_scores_for_match(p_match_id uuid)
RETURNS TABLE (
    team_id uuid,
    tournament_id uuid,
    stage_id uuid,
    batting_total numeric,
    bowling_total numeric,
    fielding_total numeric,
    bonus_total numeric,
    final_total numeric
)
LANGUAGE sql
AS $$
    WITH player_scores AS (
        SELECT 
            tp.team_id,
            t.tournament_id,
            t.stage_id, -- Get stage_id from the team/team_players context
            s.batting,
            s.bowling,
            s.fielding,
            s.bonus,
            s.total AS score,
            tp.is_captain
        FROM team_players tp
        JOIN teams t ON t.id = tp.team_id
        JOIN scores s ON s.player_id = tp.player_id
        JOIN matches m ON m.id = s.match_id -- Join matches to verify the stage
        WHERE s.match_id = p_match_id
          AND tp.is_substituted = false
          -- CRITICAL: Only count scores if the match stage matches the team stage
          AND t.stage_id = m.stage_id 
    ),
    team_totals AS (
        SELECT
            team_id,
            tournament_id,
            stage_id,
            SUM(batting) + SUM(CASE WHEN is_captain THEN batting ELSE 0 END) AS batting_total,
            SUM(bowling) + SUM(CASE WHEN is_captain THEN bowling ELSE 0 END) AS bowling_total,
            SUM(fielding) + SUM(CASE WHEN is_captain THEN fielding ELSE 0 END) AS fielding_total,
            SUM(bonus) + SUM(CASE WHEN is_captain THEN bonus ELSE 0 END) AS bonus_total,
            SUM(score) + SUM(CASE WHEN is_captain THEN score ELSE 0 END) AS final_total
        FROM player_scores
        GROUP BY team_id, tournament_id, stage_id
    )
    SELECT * FROM team_totals;
$$;

CREATE OR REPLACE FUNCTION update_team_scores_for_match(p_match_id uuid)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
    v_count int;
BEGIN
    INSERT INTO team_scores (team_id, tournament_id, match_id, batting, bowling, fielding, bonus, total)
    SELECT 
        team_id,
        tournament_id,
        stage_id,
        p_match_id,
        batting_total,
        bowling_total,
        fielding_total,
        bonus_total,
        final_total
    FROM calculate_all_team_scores_for_match(p_match_id)
    ON CONFLICT (team_id, match_id)
    DO UPDATE SET
        batting = EXCLUDED.batting,
        bowling = EXCLUDED.bowling,
        fielding = EXCLUDED.fielding,
        bonus = EXCLUDED.bonus,
        total = EXCLUDED.total,
        updated_at = NOW();

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION queue_match_for_recalculation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO score_update_queue (match_id)
    VALUES (NEW.match_id)
    ON CONFLICT (match_id) DO NOTHING;

    RETURN NEW;
END;
$$;


CREATE TRIGGER trg_queue_match_update
AFTER INSERT ON scores
FOR EACH ROW
EXECUTE FUNCTION queue_match_for_recalculation();

CREATE OR REPLACE FUNCTION process_score_update_queue()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_match_id uuid;
    v_tournament_id uuid;
    v_stage_id uuid;
BEGIN
    FOR v_match_id IN 
        SELECT match_id FROM score_update_queue ORDER BY queued_at
    LOOP
        -- Update team scores for the match
        PERFORM update_team_scores_for_match(v_match_id);
        
        -- Get tournament_id for this match
        SELECT tournament_id INTO v_tournament_id
        -- Get tournament_id and stage_id for this match
        SELECT tournament_id, stage_id INTO v_tournament_id, v_stage_id
        FROM matches
END;
$$;

-- Step 1: Queue all matches that have scores
INSERT INTO score_update_queue (match_id)
SELECT DISTINCT match_id 
FROM scores
ON CONFLICT (match_id) DO NOTHING;

-- Step 2: Process the queue (this will update team_scores and refresh leaderboards)
SELECT process_score_update_queue();

CREATE OR REPLACE FUNCTION create_user_team(
    p_user_id uuid, 
    p_tournament_id uuid, 
    p_team_name text, 
    p_stage text DEFAULT 'group'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_team_id uuid;
    v_max_teams integer;
    v_existing_team_count integer;
BEGIN
    -- Validate input parameters
    IF p_user_id IS NULL OR p_tournament_id IS NULL OR p_team_name IS NULL THEN
        RAISE EXCEPTION 'Invalid input: User ID, Tournament ID, and Team Name are required';
    END IF;

    -- Check tournament stage validity
    IF p_stage NOT IN ('group', 'knockout') THEN
        RAISE EXCEPTION 'Invalid stage. Must be "group" or "knockout"';
    END IF;

    -- Get maximum teams allowed from tournament settings
    SELECT COALESCE(max_teams, 1) INTO v_max_teams
    FROM tournament_settings 
    WHERE tournament_id = p_tournament_id AND stage = p_stage;

    -- Count existing teams for this user and tournament
    SELECT COUNT(*) INTO v_existing_team_count
    FROM teams 
    WHERE user_id = p_user_id 
      AND tournament_id = p_tournament_id 
      AND stage = p_stage;

    -- Check team creation limit
    IF v_existing_team_count >= COALESCE(v_max_teams, 1) THEN
        RAISE EXCEPTION 'Maximum team limit reached for this tournament stage';
    END IF;

    -- Create team
    INSERT INTO teams (
        user_id, 
        tournament_id, 
        team_name, 
        stage
    ) VALUES (
        p_user_id, 
        p_tournament_id, 
        p_team_name, 
        p_stage
    ) RETURNING id INTO v_team_id;

    RETURN v_team_id;
EXCEPTION 
    WHEN OTHERS THEN
        RAISE NOTICE 'Error in create_user_team: %', SQLERRM;
        RETURN NULL;
END;
$$;

-- Enhanced Add Player to Team Function
CREATE OR REPLACE FUNCTION add_player_to_team(
    p_team_id uuid, 
    p_player_id uuid, 
    p_is_starter boolean DEFAULT true
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_tournament_id uuid;
    v_team_player_count integer;
    v_team_name_count integer;
    v_max_team_players integer := 15;
    v_max_team_name_players integer;
    v_player_team_name text;
BEGIN
    -- Validate inputs
    IF p_team_id IS NULL OR p_player_id IS NULL THEN
        RAISE EXCEPTION 'Team ID and Player ID cannot be null';
    END IF;

    -- Get tournament and player's represented country (via team_name) details
    SELECT 
        t.tournament_id, 
        p.team_name,
        ts.max_country
    INTO 
        v_tournament_id, 
        v_player_team_name,
        v_max_team_name_players
    FROM teams t
    JOIN squads p ON p.id = p_player_id
    JOIN tournament_settings ts ON ts.tournament_id = t.tournament_id
    WHERE t.id = p_team_id;

    -- Check if player is already in the team
    IF EXISTS (
        SELECT 1 FROM team_players 
        WHERE team_id = p_team_id AND player_id = p_player_id
    ) THEN
        RAISE EXCEPTION 'Player is already in this team';
    END IF;

    -- Count current team players
    SELECT COUNT(*) INTO v_team_player_count
    FROM team_players
    WHERE team_id = p_team_id;

    -- Check team player limit
    IF v_team_player_count >= v_max_team_players THEN
        RAISE EXCEPTION 'Team has reached maximum player limit';
    END IF;

    -- Count players representing the same country (matched by team_name)
    SELECT COUNT(*) INTO v_team_name_count
    FROM team_players tp
    JOIN squads p ON p.id = tp.player_id
    WHERE tp.team_id = p_team_id AND p.team_name = v_player_team_name;

    IF v_team_name_count >= COALESCE(v_max_team_name_players, 3) THEN
        RAISE EXCEPTION 'Maximum players from this country limit reached';
    END IF;

    -- Insert player into team
    INSERT INTO team_players (
        team_id, 
        player_id, 
        is_starter
    ) VALUES (
        p_team_id, 
        p_player_id, 
        p_is_starter
    );

    RETURN true;
EXCEPTION 
    WHEN OTHERS THEN
        RAISE NOTICE 'Error in add_player_to_team: %', SQLERRM;
        RETURN false;
END;
$$;

-- Enhanced Substitute Player Function
CREATE OR REPLACE FUNCTION substitute_player(
    p_team_id uuid, 
    p_player_out_id uuid, 
    p_player_in_id uuid,
    p_tournament_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_player_out_is_starter boolean;
    v_player_in_is_starter boolean;
    v_player_out_is_captain boolean;
    v_max_substitutions integer;
    v_current_substitutions integer;
    v_stage text;
BEGIN
    -- Validate inputs
    IF p_team_id IS NULL OR p_player_out_id IS NULL OR p_player_in_id IS NULL OR p_tournament_id IS NULL THEN
        RAISE EXCEPTION 'All input parameters must be non-null';
    END IF;

    -- Get tournament stage and substitution limit
    SELECT 
        stage, 
        COALESCE(max_subs, 3) AS max_subs
    INTO 
        v_stage, 
        v_max_substitutions
    FROM tournament_settings
    WHERE tournament_id = p_tournament_id;

    -- Check if both players are in the same team
    IF NOT EXISTS (
        SELECT 1 FROM team_players 
        WHERE team_id = p_team_id AND player_id IN (p_player_out_id, p_player_in_id)
    ) THEN
        RAISE EXCEPTION 'Players must be in the same team';
    END IF;

    -- Check player statuses
    SELECT 
        tp_out.is_starter, 
        tp_out.is_captain,
        tp_in.is_starter
    INTO 
        v_player_out_is_starter, 
        v_player_out_is_captain,
        v_player_in_is_starter
    FROM team_players tp_out
    JOIN team_players tp_in ON tp_in.team_id = p_team_id
    WHERE tp_out.team_id = p_team_id 
      AND tp_out.player_id = p_player_out_id
      AND tp_in.player_id = p_player_in_id;

    -- Validate substitution rules
    IF NOT v_player_out_is_starter THEN
        RAISE EXCEPTION 'Cannot substitute a non-starter player out';
    END IF;

    IF v_player_in_is_starter THEN
        RAISE EXCEPTION 'Substitute player must not be a starter';
    END IF;

    -- Count current substitutions for this tournament
    SELECT COUNT(*) INTO v_current_substitutions
    FROM substitution_log
    WHERE team_id = p_team_id 
      AND tournament_id = p_tournament_id;

    -- Check substitution limit
    IF v_current_substitutions >= v_max_substitutions THEN
        RAISE EXCEPTION 'Maximum substitutions limit reached';
    END IF;

    -- Perform substitution
    BEGIN
        -- Update player statuses
        UPDATE team_players 
        SET is_starter = false 
        WHERE team_id = p_team_id AND player_id = p_player_out_id;

        UPDATE team_players 
        SET is_starter = true 
        WHERE team_id = p_team_id AND player_id = p_player_in_id;

        -- Log the substitution
        INSERT INTO substitution_log (
            team_id, 
            tournament_id, 
            player_out, 
            player_in, 
            stage,
            was_captain
        ) VALUES (
            p_team_id, 
            p_tournament_id, 
            p_player_out_id, 
            p_player_in_id, 
            v_stage,
            v_player_out_is_captain
        );

        RETURN true;
    EXCEPTION 
        WHEN OTHERS THEN
            RAISE NOTICE 'Error in substitute_player: %', SQLERRM;
            RETURN false;
    END;
END;
$$;

-- Enhanced Get Team Details Function
CREATE OR REPLACE FUNCTION get_team_details(
    p_team_id uuid
)
RETURNS TABLE (
    team_id uuid,
    team_name text,
    tournament_id uuid,
    stage text,
    captain_id uuid,
    captain_name text,
    total_players integer,
    starters integer,
    substitutes integer,
    country_distribution jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY 
    WITH team_stats AS (
        SELECT 
            t.id AS team_id,
            t.team_name,
            t.tournament_id,
            t.stage,
            tp_captain.player_id AS captain_id,
            p_captain.name AS captain_name,
            COUNT(tp.player_id) AS total_players,
            SUM(CASE WHEN tp.is_starter THEN 1 ELSE 0 END) AS starters,
            SUM(CASE WHEN NOT tp.is_starter THEN 1 ELSE 0 END) AS substitutes,
            (
                SELECT jsonb_object_agg(c.name, COUNT(p.id))
                FROM team_players tp_count
                JOIN squads p ON p.id = tp_count.player_id
                JOIN countries c ON c.sportsmonk_id = p.country_id
                WHERE tp_count.team_id = t.id
                GROUP BY tp_count.team_id
            ) AS country_distribution
        FROM teams t
        LEFT JOIN team_players tp ON t.id = tp.team_id
        LEFT JOIN team_players tp_captain ON t.id = tp_captain.team_id AND tp_captain.is_captain
        LEFT JOIN squads p_captain ON tp_captain.player_id = p_captain.id
        WHERE t.id = p_team_id
        GROUP BY 
            t.id, 
            t.team_name, 
            t.tournament_id, 
            t.stage, 
            tp_captain.player_id,
            p_captain.name
    )
    SELECT 
        team_id, 
        team_name, 
        tournament_id, 
        stage, 
        captain_id, 
        captain_name, 
        total_players, 
        starters, 
        substitutes,
        country_distribution
    FROM team_stats;
END;
$$;

-- Get Available Players for Substitution
CREATE OR REPLACE FUNCTION get_available_players_for_substitution(
    p_team_id uuid, 
    p_tournament_id uuid
)
RETURNS TABLE (
    player_id uuid,
    player_name text,
    role text,
    team_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY 
    SELECT 
        p.id AS player_id,
        p.name AS player_name,
        p.role AS position,
        p.is_injured,
        p.is_suspended,
        c.name AS country_name
    FROM squads p
    JOIN team_players tp ON p.id = tp.player_id
    LEFT JOIN countries c ON c.sportsmonk_id = p.country_id
    LEFT JOIN substitution_log sl ON p.id = sl.player_in AND sl.tournament_id = p_tournament_id
    WHERE 
        tp.team_id = p_team_id 
        AND tp.is_starter = false
        AND p.is_injured = false 
        AND p.is_suspended = false
        AND sl.id IS NULL
    ORDER BY 
        CASE 
            WHEN p.role = 'allrounder' THEN 1
            WHEN p.role = 'batsman' THEN 2
            WHEN p.role = 'bowler' THEN 3
            WHEN p.role = 'wicketkeeper' THEN 4
            ELSE 5
        END;
END;
$$;

CREATE OR REPLACE FUNCTION validate_team_composition(p_team_id uuid)
RETURNS TABLE (
    is_valid boolean,
    error_message text,
    player_count integer,
    batter_count integer,
    bowler_count integer,
    allrounder_count integer,
    wicketkeeper_count integer,
    captain_count integer,
    max_country_violated boolean,
    max_country_count integer
) 
LANGUAGE plpgsql
AS $function$
DECLARE
    v_player_count integer;
    v_batter_count integer;
    v_bowler_count integer;
    v_allrounder_count integer;
    v_wicketkeeper_count integer;
    v_captain_count integer;
    v_max_country_limit integer;
    v_max_country_count integer;
    v_max_country_violated boolean := false;
    v_error_message text := '';
    v_is_valid boolean := true;
    v_tournament_id uuid;
    v_stage_id uuid;
BEGIN
    -- Get team's tournament and stage info
    SELECT tournament_id, stage_id INTO v_tournament_id, v_stage_id
    FROM teams WHERE id = p_team_id;

    -- Get max_country setting for this tournament/stage
    SELECT max_country INTO v_max_country_limit
    FROM tournament_settings 
    WHERE tournament_id = v_tournament_id 
    AND stage_id = v_stage_id;

    -- Default to 3 if no setting found
    v_max_country_limit := COALESCE(v_max_country_limit, 3);

    -- Get team composition counts
    SELECT 
        COUNT(*) as total_players,
        COUNT(CASE WHEN p.role = 'batter' THEN 1 END) as batters,
        COUNT(CASE WHEN p.role = 'bowler' THEN 1 END) as bowlers,
        COUNT(CASE WHEN p.role = 'allrounder' THEN 1 END) as allrounders,
        COUNT(CASE WHEN p.role = 'wicketkeeper' THEN 1 END) as wicketkeepers,
        COUNT(CASE WHEN tp.is_captain = true THEN 1 END) as captains
    INTO 
        v_player_count, v_batter_count, v_bowler_count, 
        v_allrounder_count, v_wicketkeeper_count, v_captain_count
    FROM team_players tp
    JOIN squads p ON tp.player_id = p.id
    WHERE tp.team_id = p_team_id 
    AND tp.is_substituted = false;

    -- Check country limit violation (grouped by represented country via team_name)
    SELECT MAX(country_count) INTO v_max_country_count
    FROM (
        SELECT COUNT(*) as country_count
        FROM team_players tp
        JOIN squads p ON tp.player_id = p.id
        WHERE tp.team_id = p_team_id 
        AND tp.is_substituted = false
        GROUP BY p.team_name
    ) country_counts;

    v_max_country_count := COALESCE(v_max_country_count, 0);
    v_max_country_violated := v_max_country_count > v_max_country_limit;

    -- Validation rules
    IF v_player_count != 11 THEN
        v_is_valid := false;
        v_error_message := 'Team must have exactly 11 players. Current: ' || v_player_count;
    ELSIF v_batter_count < 3 OR v_batter_count > 11 THEN
        v_is_valid := false;
        v_error_message := 'Team must have at least 3 batters. Current: ' || v_batter_count;
    ELSIF v_bowler_count < 3 OR v_bowler_count > 11 THEN
        v_is_valid := false;
        v_error_message := 'Team must have at least 3 bowlers. Current: ' || v_bowler_count;
    ELSIF v_wicketkeeper_count < 1 THEN
        v_is_valid := false;
        v_error_message := 'Team must have at least 1 wicketkeeper. Current: ' || v_wicketkeeper_count;
    ELSIF v_captain_count != 1 THEN
        v_is_valid := false;
        v_error_message := 'Team must have exactly 1 captain. Current: ' || v_captain_count;
    ELSIF v_max_country_violated THEN
        v_is_valid := false;
        v_error_message := 'Too many players from same country. Max allowed: ' || v_max_country_limit || ', Current max: ' || v_max_country_count;
    END IF;

    -- Return results
    RETURN QUERY SELECT 
        v_is_valid,
        v_error_message,
        v_player_count,
        v_batter_count,
        v_bowler_count,
        v_allrounder_count,
        v_wicketkeeper_count,
        v_captain_count,
        v_max_country_violated,
        v_max_country_count;
END;
$function$;

-- Trigger function to validate before inserting/updating team players
CREATE OR REPLACE FUNCTION check_team_composition()
RETURNS TRIGGER 
LANGUAGE plpgsql
AS $function$
DECLARE
    validation_result RECORD;
    v_max_country_limit integer;
    v_tournament_id uuid;
    v_stage_id uuid;
    v_country_count integer;
    v_player_team_name text;
    v_active_player_count integer;
    v_captain_count integer;
BEGIN
    -- Skip validation if player is being substituted out
    IF TG_OP = 'UPDATE' AND NEW.is_substituted = true THEN
        RETURN NEW;
    END IF;

    -- Get team's tournament and stage info
    SELECT tournament_id, stage_id INTO v_tournament_id, v_stage_id
    FROM teams WHERE id = NEW.team_id;

    -- Get max_country setting
    SELECT max_country INTO v_max_country_limit
    FROM tournament_settings 
    WHERE tournament_id = v_tournament_id 
    AND stage_id = v_stage_id;

    -- Default to 3 if no setting found
    v_max_country_limit := COALESCE(v_max_country_limit, 3);

    -- Get the represented country of the player being added/updated
    SELECT team_name INTO v_player_team_name
    FROM squads WHERE id = NEW.player_id;

    -- Check if adding this player would violate country limit
    SELECT COUNT(*) INTO v_country_count
    FROM team_players tp
    JOIN squads p ON tp.player_id = p.id
    WHERE tp.team_id = NEW.team_id 
    AND p.team_name = v_player_team_name
    AND tp.is_substituted = false
    AND tp.id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000');

    IF v_country_count >= v_max_country_limit THEN
        RAISE EXCEPTION 'Cannot add player: Would exceed country limit of % players from same country', v_max_country_limit;
    END IF;

    -- Check active player count
    SELECT COUNT(*) INTO v_active_player_count
    FROM team_players tp
    WHERE tp.team_id = NEW.team_id
    AND tp.is_substituted = false
    AND tp.id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000');

    IF TG_OP = 'INSERT' AND v_active_player_count >= 11 THEN
        RAISE EXCEPTION 'Cannot add player: Team already has 11 players. Current active: %', v_active_player_count;
    END IF;

    -- Check captain constraint
    IF NEW.is_captain = true THEN
        SELECT COUNT(*) INTO v_captain_count
        FROM team_players tp
        WHERE tp.team_id = NEW.team_id
        AND tp.is_captain = true
        AND tp.is_substituted = false
        AND tp.id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000');

        IF v_captain_count > 0 THEN
            RAISE EXCEPTION 'Team can only have one active captain';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

-- Create the trigger
CREATE TRIGGER validate_team_composition_trigger
    BEFORE INSERT OR UPDATE ON team_players
    FOR EACH ROW
    EXECUTE FUNCTION check_team_composition();


-- Function to check if team is complete and valid for tournament play
CREATE OR REPLACE FUNCTION is_team_ready_for_play(p_team_id uuid)
RETURNS boolean 
LANGUAGE plpgsql
AS $function$
DECLARE
    validation_result RECORD;
BEGIN
    SELECT * INTO validation_result 
    FROM validate_team_composition(p_team_id) 
    LIMIT 1;
    
    RETURN validation_result.is_valid;
END;
$function$;

-- Helper function to get team composition summary
CREATE OR REPLACE FUNCTION get_team_composition(p_team_id uuid)
RETURNS TABLE (
    role text,
    count bigint,
    required_min integer,
    required_max integer,
    is_valid boolean
) 
LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    WITH role_counts AS (
        SELECT 
            p.role,
            COUNT(*) as player_count
        FROM team_players tp
        JOIN squads p ON tp.player_id = p.id
        WHERE tp.team_id = p_team_id 
        AND tp.is_substituted = false
        GROUP BY p.role
    ),
    role_requirements AS (
        SELECT 'batter' as role, 3 as min_req, 11 as max_req
        UNION ALL SELECT 'bowler', 3, 11
        UNION ALL SELECT 'allrounder', 1, 11
        UNION ALL SELECT 'wicketkeeper', 1, 11
    )
    SELECT 
        rr.role,
        COALESCE(rc.player_count, 0) as count,
        rr.min_req as required_min,
        rr.max_req as required_max,
        (COALESCE(rc.player_count, 0) >= rr.min_req AND COALESCE(rc.player_count, 0) <= rr.max_req) as is_valid
    FROM role_requirements rr
    LEFT JOIN role_counts rc ON rr.role = rc.role
    ORDER BY 
        CASE rr.role 
            WHEN 'batter' THEN 1
            WHEN 'bowler' THEN 2  
            WHEN 'allrounder' THEN 3
            WHEN 'wicketkeeper' THEN 4
        END;
END;
$function$;

CREATE OR REPLACE FUNCTION get_leaderboard(
    p_tournament_id uuid,
    p_stage_id uuid DEFAULT NULL  -- NULL means combined/overall leaderboard
)
RETURNS TABLE (
    team_id uuid,
    team_name text,
    stage_id uuid,
    user_id uuid,
    username text,
    total numeric,
    batting_total numeric,
    bowling_total numeric,
    fielding_total numeric,
    bonus_total numeric,
    rank_position integer,
    rank_change integer,
    updated_at timestamptz
)
LANGUAGE sql
STABLE
AS $$
    -- Per-stage leaderboard: filter cache by stage_id
    SELECT 
        c.team_id,
        c.team_name,
        c.stage_id,
        c.user_id,
        c.username,
        c.total,
        c.batting_total,
        c.bowling_total,
        c.fielding_total,
        c.bonus_total,
        c.rank_position,
        COALESCE((
            SELECT h.rank_change 
            FROM tournament_leaderboard_history h 
            WHERE h.team_id = c.team_id 
              AND h.tournament_id = c.tournament_id
              AND h.stage_id = c.stage_id
            ORDER BY h.created_at DESC 
            LIMIT 1
        ), 0) AS rank_change,
        c.updated_at
    FROM tournament_leaderboard_cache c
    WHERE c.tournament_id = p_tournament_id
      AND c.stage_id = p_stage_id  -- exact stage match
      AND p_stage_id IS NOT NULL

    UNION ALL

    -- Combined leaderboard: sum points across all stages, grouped by user_id
    -- Uses team_id/team_name from the most recently updated team for display
    SELECT 
        (array_agg(c.team_id ORDER BY c.updated_at DESC))[1] AS team_id,
        c.team_name,
        NULL::uuid AS stage_id,
        c.user_id,
        c.username,
        SUM(c.total) AS total,
        SUM(c.batting_total) AS batting_total,
        SUM(c.bowling_total) AS bowling_total,
        SUM(c.fielding_total) AS fielding_total,
        SUM(c.bonus_total) AS bonus_total,
        RANK() OVER (ORDER BY SUM(c.total) DESC)::integer AS rank_position,
        -- Rank change for combined: compare to most recent combined history snapshot
        COALESCE((
            SELECT h2.rank_change
            FROM tournament_leaderboard_history h2
            WHERE h2.tournament_id = c.tournament_id
              AND h2.user_id = c.user_id
              AND h2.stage_id IS NULL  -- combined snapshots stored with NULL stage_id
            ORDER BY h2.created_at DESC
            LIMIT 1
        ), 0) AS rank_change,
        MAX(c.updated_at) AS updated_at
    FROM tournament_leaderboard_cache c
    WHERE c.tournament_id = p_tournament_id
      AND p_stage_id IS NULL  -- only run this branch for combined view
    GROUP BY c.user_id, c.username, c.team_name, c.tournament_id

    ORDER BY rank_position;
$$;

CREATE OR REPLACE FUNCTION get_tournament_leaderboard(p_tournament_id uuid, p_stage_id uuid)
RETURNS TABLE (
    team_id uuid,
    team_name text,
    user_id uuid,
    username text,
    total numeric,
    batting_total numeric,
    bowling_total numeric,
    fielding_total numeric,
    bonus_total numeric,
    rank_position bigint
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    t.id AS team_id,
    t.team_name,
    t.user_id,
    u.username,
    COALESCE(SUM(ts.total), 0) AS total,
    COALESCE(SUM(ts.batting), 0) AS batting_total,
    COALESCE(SUM(ts.bowling), 0) AS bowling_total,
    COALESCE(SUM(ts.fielding), 0) AS fielding_total,
    COALESCE(SUM(ts.bonus), 0) AS bonus_total,
    RANK() OVER (ORDER BY COALESCE(SUM(ts.total), 0) DESC) AS rank_position
  FROM teams t
  JOIN users u ON t.user_id = u.id
  LEFT JOIN team_scores ts ON t.id = ts.team_id
  WHERE t.tournament_id = p_tournament_id
    AND t.stage_id = p_stage_id
  GROUP BY t.id, t.team_name, t.user_id, u.username;
$$;

CREATE OR REPLACE FUNCTION refresh_tournament_leaderboard_with_history(
    p_tournament_id uuid,
    p_match_id uuid,
    p_stage_id uuid  -- now a real parameter, not a phantom variable
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_leaderboard_count integer;
BEGIN
    -- Check if this stage has any scored data yet
    SELECT COUNT(*) INTO v_leaderboard_count
    FROM get_tournament_leaderboard(p_tournament_id, p_stage_id);

    IF v_leaderboard_count = 0 THEN
        RAISE NOTICE 'No leaderboard data for tournament % stage % - initializing', 
            p_tournament_id, p_stage_id;

        -- Seed the cache with zeroed entries for teams in this stage
        INSERT INTO tournament_leaderboard_cache (
            tournament_id, stage_id, team_id, team_name, user_id, username,
            total, batting_total, bowling_total, fielding_total, bonus_total, rank_position
        )
        SELECT 
            p_tournament_id,
            p_stage_id,
            t.id AS team_id,
            t.team_name,
            t.user_id,
            t.username,
            0, 0, 0, 0, 0,
            ROW_NUMBER() OVER (ORDER BY t.team_name) AS rank_position
        FROM teams t
        WHERE t.tournament_id = p_tournament_id
          AND t.stage_id = p_stage_id  -- only seed teams belonging to this stage
        ON CONFLICT (tournament_id, stage_id, team_id) DO NOTHING;

        -- Snapshot the zeroed state
        INSERT INTO tournament_leaderboard_history (
            tournament_id, stage_id, match_id, team_id, team_name, user_id, username,
            total, batting_total, bowling_total, fielding_total, bonus_total,
            rank_position, rank_change
        )
        SELECT 
            tournament_id, stage_id, p_match_id, team_id, team_name, user_id, username,
            total, batting_total, bowling_total, fielding_total, bonus_total,
            rank_position, 0
        FROM tournament_leaderboard_cache
        WHERE tournament_id = p_tournament_id
          AND stage_id = p_stage_id;

        RAISE NOTICE 'Initialized empty leaderboard for tournament % stage %', 
            p_tournament_id, p_stage_id;
        RETURN;
    END IF;

    -- Refresh: remove stale cache rows for this stage only (don't touch other stages)
    DELETE FROM tournament_leaderboard_cache 
    WHERE tournament_id = p_tournament_id
      AND stage_id = p_stage_id;

    INSERT INTO tournament_leaderboard_cache (
        tournament_id, stage_id, team_id, team_name, user_id, username,
        total, batting_total, bowling_total, fielding_total, bonus_total, rank_position
    )
    SELECT 
        p_tournament_id,
        p_stage_id,
        team_id, team_name, user_id, username,
        total, batting_total, bowling_total, fielding_total, bonus_total, rank_position
    FROM get_tournament_leaderboard(p_tournament_id, p_stage_id);

    RAISE NOTICE 'Refreshed % rows in cache for tournament % stage %', 
        v_leaderboard_count, p_tournament_id, p_stage_id;

    -- Save per-stage history snapshot with rank change vs previous snapshot for this stage
    INSERT INTO tournament_leaderboard_history (
        tournament_id, stage_id, match_id, team_id, team_name, user_id, username,
        total, batting_total, bowling_total, fielding_total, bonus_total,
        rank_position, rank_change
    )
    SELECT 
        c.tournament_id,
        p_stage_id,
        p_match_id,
        c.team_id,
        c.team_name,
        c.user_id,
        c.username,
        c.total,
        c.batting_total,
        c.bowling_total,
        c.fielding_total,
        c.bonus_total,
        c.rank_position,
        COALESCE(prev.rank_position - c.rank_position, 0) AS rank_change
    FROM tournament_leaderboard_cache c
    LEFT JOIN LATERAL (
        SELECT h.rank_position
        FROM tournament_leaderboard_history h
        WHERE h.tournament_id = c.tournament_id
          AND h.team_id = c.team_id
          AND h.stage_id = p_stage_id  -- compare within the same stage
          AND h.match_id != p_match_id  -- exclude current match if already partially written
        ORDER BY h.created_at DESC
        LIMIT 1
    ) prev ON true
    WHERE c.tournament_id = p_tournament_id
      AND c.stage_id = p_stage_id
    ON CONFLICT (tournament_id, match_id, team_id) 
    DO UPDATE SET
        rank_position = EXCLUDED.rank_position,
        rank_change   = EXCLUDED.rank_change,
        total         = EXCLUDED.total,
        batting_total = EXCLUDED.batting_total,
        bowling_total = EXCLUDED.bowling_total,
        fielding_total = EXCLUDED.fielding_total,
        bonus_total   = EXCLUDED.bonus_total;

    -- Also save a combined/overall history snapshot (stage_id = NULL)
    -- This lets rank_change work on the combined leaderboard too
    INSERT INTO tournament_leaderboard_history (
        tournament_id, stage_id, match_id, team_id, team_name, user_id, username,
        total, batting_total, bowling_total, fielding_total, bonus_total,
        rank_position, rank_change
    )
    SELECT
        agg.tournament_id,
        NULL AS stage_id,  -- marks this as a combined snapshot
        p_match_id,
        agg.representative_team_id,
        agg.team_name,
        agg.user_id,
        agg.username,
        agg.total,
        agg.batting_total,
        agg.bowling_total,
        agg.fielding_total,
        agg.bonus_total,
        agg.rank_position,
        COALESCE(prev_combined.rank_position - agg.rank_position, 0) AS rank_change
    FROM (
        SELECT
            c.tournament_id,
            (array_agg(c.team_id ORDER BY c.updated_at DESC))[1] AS representative_team_id,
            c.team_name,
            c.user_id,
            c.username,
            SUM(c.total) AS total,
            SUM(c.batting_total) AS batting_total,
            SUM(c.bowling_total) AS bowling_total,
            SUM(c.fielding_total) AS fielding_total,
            SUM(c.bonus_total) AS bonus_total,
            RANK() OVER (ORDER BY SUM(c.total) DESC)::integer AS rank_position
        FROM tournament_leaderboard_cache c
        WHERE c.tournament_id = p_tournament_id
        GROUP BY c.tournament_id, c.user_id, c.username, c.team_name
    ) agg
    LEFT JOIN LATERAL (
        SELECT h.rank_position
        FROM tournament_leaderboard_history h
        WHERE h.tournament_id = agg.tournament_id
          AND h.user_id = agg.user_id
          AND h.stage_id IS NULL  -- previous combined snapshots only
        ORDER BY h.created_at DESC
        LIMIT 1
    ) prev_combined ON true
    ON CONFLICT (tournament_id, match_id, team_id)
    DO UPDATE SET
        rank_position  = EXCLUDED.rank_position,
        rank_change    = EXCLUDED.rank_change,
        total          = EXCLUDED.total,
        batting_total  = EXCLUDED.batting_total,
        bowling_total  = EXCLUDED.bowling_total,
        fielding_total = EXCLUDED.fielding_total,
        bonus_total    = EXCLUDED.bonus_total;

    RAISE NOTICE 'History saved for match % tournament % stage %', 
        p_match_id, p_tournament_id, p_stage_id;
END;
$$;

CREATE UNIQUE INDEX uniq_history_combined 
ON tournament_leaderboard_history (tournament_id, match_id, team_id) 
WHERE stage_id IS NULL;


CREATE UNIQUE INDEX uniq_history_stage 
ON tournament_leaderboard_history (tournament_id, match_id, team_id, stage_id) 
WHERE stage_id IS NOT NULL;

CREATE OR REPLACE FUNCTION add_tournament_id_to_process_queue()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only attempt lookup if tournament_id is NULL and match_id exists
  IF NEW.tournament_id IS NULL
     AND NEW.match_id IS NOT NULL THEN

    SELECT m.tournament_id
    INTO NEW.tournament_id
    FROM matches m
    WHERE m.id = NEW.match_id
    LIMIT 1;

  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION initialize_tournament_leaderboard(p_tournament_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    -- Call the refresh function with a NULL match_id to initialize
    PERFORM refresh_tournament_leaderboard_with_history(p_tournament_id, NULL);
    
    RAISE NOTICE 'Tournament % leaderboard initialized', p_tournament_id;
END;
$$;

CREATE OR REPLACE TRIGGER trg_add_tournament_id_to_process_queue
BEFORE INSERT OR UPDATE OF match_id, tournament_id
ON score_update_queue
FOR EACH ROW
WHEN (NEW.tournament_id IS NULL)
EXECUTE FUNCTION add_tournament_id_to_process_queue();

CREATE OR REPLACE FUNCTION calculate_live_team_scores_for_match(p_match_id uuid)
RETURNS void
LANGUAGE sql
AS $$
    WITH live_scoring AS (
        SELECT 
            tp.team_id,
            t.tournament_id,
            t.user_id,
            s.batting,
            s.bowling,
            s.fielding,
            s.bonus,
            s.total AS score,
            tp.is_captain,
            tp.is_substituted
        FROM team_players tp
        JOIN teams t ON t.id = tp.team_id
        JOIN live_scoring s ON s.player_id = tp.player_id
        AND s.match_id = p_match_id
        WHERE 
            COALESCE(tp.is_substituted, false) = false
    ),
    team_totals AS (
        SELECT
            team_id,
            tournament_id,
            user_id,
            SUM(batting) + SUM(CASE WHEN is_captain THEN batting ELSE 0 END) AS batting_total,
            SUM(bowling) + SUM(CASE WHEN is_captain THEN bowling ELSE 0 END) AS bowling_total,
            SUM(fielding) + SUM(CASE WHEN is_captain THEN fielding ELSE 0 END) AS fielding_total,
            SUM(bonus) + SUM(CASE WHEN is_captain THEN bonus ELSE 0 END) AS bonus_total,
            SUM(score) + SUM(CASE WHEN is_captain THEN score ELSE 0 END) AS final_total
        FROM live_scoring
        GROUP BY team_id, tournament_id, user_id
    )
    INSERT INTO live_userteam_points (team_id, tournament_id, match_id, user_id, batting, bowling, fielding, bonus, total)
    SELECT team_id, tournament_id, p_match_id, user_id, batting_total, bowling_total, fielding_total, bonus_total, final_total
    FROM team_totals
    ON CONFLICT (team_id, match_id)
    DO UPDATE SET
        batting = EXCLUDED.batting,
        bowling = EXCLUDED.bowling,
        fielding = EXCLUDED.fielding,
        bonus = EXCLUDED.bonus,
        total = EXCLUDED.total,
        user_id = EXCLUDED.user_id,
        updated_at = NOW();
$$;