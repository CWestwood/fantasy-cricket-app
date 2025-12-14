-- Get current leaderboard
CREATE OR REPLACE FUNCTION get_leaderboard(p_tournament_id uuid)
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
    rank_position integer,
    updated_at timestamptz
)
LANGUAGE sql
STABLE
AS $$
    SELECT 
        team_id,
        team_name,
        user_id,
        username,
        total,
        batting_total,
        bowling_total,
        fielding_total,
        bonus_total,
        rank_position,
        updated_at
    FROM tournament_leaderboard_cache
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
  p_username TEXT,
  p_tournament_id UUID,
  p_stage TEXT,
  p_team_name TEXT,
  p_players JSONB,
  p_captain_id UUID,
  p_subs_used INT
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
  INSERT INTO public.teams (user_id, tournament_id, stage, team_name, subs_used)
  VALUES (
    auth.uid(),
    p_tournament_id,
    p_stage,
    p_team_name,
    p_subs_used
  )
  ON CONFLICT (user_id, tournament_id, stage)
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
      INSERT INTO public.team_players (team_id, player_id, is_captain)
      VALUES (
        v_team_id,
        current_player_id,
        current_player_id = p_captain_id
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
    JOIN teams t ON tp.team_id = t.id AND t.tournament_id = p_tournament_id AND t.stage = p_stage
    GROUP BY tp.player_id
  )
  SELECT
    p.id AS player_id,
    p.name,
    p.role,
    p.country_id,
    p.country_name,
    p.team_name,
    COALESCE(pc.cnt, 0) AS picks_count,
    EXISTS (
      SELECT 1 FROM team_players tp2
      JOIN teams t2 ON tp2.team_id = t2.id
      WHERE tp2.player_id = p.id
        AND t2.user_id = p_user_id
        AND t2.tournament_id = p_tournament_id
        AND t2.stage = p_stage
    ) AS selected_by_user
  FROM players p
  LEFT JOIN picks pc ON pc.player_id = p.id
  WHERE (p.tournament_id = p_tournament_id OR p.tournament_id IS NULL)
    AND (
      p_search IS NULL OR (
        p.name ILIKE '%' || p_search || '%' OR
        p.country_name ILIKE '%' || p_search || '%'
      )
    )
    AND (p_roles IS NULL OR p.role = ANY(p_roles))
    AND (p_countries IS NULL OR p.country_name = ANY(p_countries))
  ORDER BY picks_count DESC, lower(p.name)
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- Grant execute to authenticated users (if using RLS and authenticated role)
GRANT EXECUTE ON FUNCTION public.get_available_players(uuid, uuid, text, text, text[], text[], int, int) TO authenticated;

CREATE OR REPLACE FUNCTION calculate_all_team_scores_for_match(p_match_id uuid)
RETURNS TABLE (
    team_id uuid,
    tournament_id uuid,
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
            s.batting,
            s.bowling,
            s.fielding,
            s.bonus,
            s.total AS score,
            tp.is_captain,
            tp.is_substituted
        FROM team_players tp
        JOIN teams t ON t.id = tp.team_id
        JOIN scores s ON s.player_id = tp.player_id
        WHERE s.match_id = p_match_id
          AND tp.is_substituted = false
    ),
    team_totals AS (
        SELECT
            team_id,
            tournament_id,
            SUM(batting) +  SUM(CASE WHEN is_captain THEN batting ELSE 0 END) AS batting_total,
            SUM(bowling) +  SUM(CASE WHEN is_captain THEN bowling ELSE 0 END) AS bowling_total,
            SUM(fielding) +  SUM(CASE WHEN is_captain THEN fielding ELSE 0 END) AS fielding_total,
            SUM(bonus) +  SUM(CASE WHEN is_captain THEN bonus ELSE 0 END) AS bonus_total,
            SUM(score) +
            SUM(CASE WHEN is_captain THEN score ELSE 0 END) AS final_total
        FROM player_scores
        GROUP BY team_id, tournament_id
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
    v_tournaments_processed uuid[];
BEGIN
    FOR v_match_id IN 
        SELECT match_id FROM score_update_queue ORDER BY queued_at
    LOOP
        -- Update team scores for the match
        PERFORM update_team_scores_for_match(v_match_id);
        
        -- Get tournament_id for this match
        SELECT tournament_id INTO v_tournament_id
        FROM matches
        WHERE id = v_match_id;
        
        -- Refresh leaderboard with history (once per tournament per batch)
        IF v_tournament_id IS NOT NULL AND 
           NOT (v_tournament_id = ANY(v_tournaments_processed)) THEN
            PERFORM refresh_tournament_leaderboard_with_history(v_tournament_id, v_match_id);
            v_tournaments_processed := array_append(v_tournaments_processed, v_tournament_id);
        END IF;
        
        -- Remove from queue
        DELETE FROM score_update_queue WHERE match_id = v_match_id;
    END LOOP;
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
    v_country_count integer;
    v_max_team_players integer := 15;
    v_max_country_players integer;
    v_player_country_id uuid;
BEGIN
    -- Validate inputs
    IF p_team_id IS NULL OR p_player_id IS NULL THEN
        RAISE EXCEPTION 'Team ID and Player ID cannot be null';
    END IF;

    -- Get tournament and country details
    SELECT 
        t.tournament_id, 
        p.country_id,
        ts.max_country
    INTO 
        v_tournament_id, 
        v_player_country_id,
        v_max_country_players
    FROM teams t
    JOIN players p ON p.id = p_player_id
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

    -- Count players from the same country
    SELECT COUNT(*) INTO v_country_count
    FROM team_players tp
    JOIN players p ON p.id = tp.player_id
    WHERE tp.team_id = p_team_id AND p.country_id = v_player_country_id;

    -- Check country player limit
    IF v_country_count >= COALESCE(v_max_country_players, 3) THEN
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
                JOIN players p ON p.id = tp_count.player_id
                JOIN countries c ON c.id = p.country_id
                WHERE tp_count.team_id = t.id
                GROUP BY tp_count.team_id
            ) AS country_distribution
        FROM teams t
        LEFT JOIN team_players tp ON t.id = tp.team_id
        LEFT JOIN team_players tp_captain ON t.id = tp_captain.team_id AND tp_captain.is_captain
        LEFT JOIN players p_captain ON tp_captain.player_id = p_captain.id
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
    FROM players p
    JOIN team_players tp ON p.id = tp.player_id
    JOIN countries c ON p.country_id = c.id
    LEFT JOIN substitution_log sl ON p.id = sl.player_in AND sl.tournament_id = p_tournament_id
    WHERE 
        tp.team_id = p_team_id 
        AND tp.is_starter = false  -- Only non-starter players
        AND p.is_injured = false 
        AND p.is_suspended = false
        AND sl.id IS NULL  -- Player hasn't been used as a substitute
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
    v_stage text;
BEGIN
    -- Get team's tournament and stage info
    SELECT tournament_id, stage INTO v_tournament_id, v_stage
    FROM teams WHERE id = p_team_id;

    -- Get max_country setting for this tournament/stage
    SELECT max_country INTO v_max_country_limit
    FROM tournament_settings 
    WHERE tournament_id = v_tournament_id 
    AND stage = v_stage;

    -- Default to 4 if no setting found
    v_max_country_limit := COALESCE(v_max_country_limit, 4);

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
    JOIN players p ON tp.player_id = p.id
    WHERE tp.team_id = p_team_id 
    AND tp.is_substituted = false;

    -- Check country limit violation
    SELECT MAX(country_count) INTO v_max_country_count
    FROM (
        SELECT COUNT(*) as country_count
        FROM team_players tp
        JOIN players p ON tp.player_id = p.id
        WHERE tp.team_id = p_team_id 
        AND tp.is_substituted = false
        GROUP BY p.country_id
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
    ELSIF v_wicketkeeper_count != 1 THEN
        v_is_valid := false;
        v_error_message := 'Team must have exactly 1 wicketkeeper. Current: ' || v_wicketkeeper_count;
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
    v_stage text;
    v_country_count integer;
    v_player_country_id uuid;
BEGIN
    -- Skip validation if player is being substituted out
    IF TG_OP = 'UPDATE' AND NEW.is_substituted = true THEN
        RETURN NEW;
    END IF;

    -- Get team's tournament and stage info
    SELECT tournament_id, stage INTO v_tournament_id, v_stage
    FROM teams WHERE id = NEW.team_id;

    -- Get max_country setting
    SELECT max_country INTO v_max_country_limit
    FROM tournament_settings 
    WHERE tournament_id = v_tournament_id 
    AND stage = v_stage;

    -- Default to 4 if no setting found
    v_max_country_limit := COALESCE(v_max_country_limit, 3);

    -- Get the country of the player being added/updated
    SELECT country_id INTO v_player_country_id
    FROM players WHERE id = NEW.player_id;

    -- Check if adding this player would violate country limit
    SELECT COUNT(*) INTO v_country_count
    FROM team_players tp
    JOIN players p ON tp.player_id = p.id
    WHERE tp.team_id = NEW.team_id 
    AND p.country_id = v_player_country_id
    AND tp.is_substituted = false
    AND (TG_OP = 'INSERT' OR tp.id != NEW.id);

    -- If adding this player would exceed country limit, reject
    IF v_country_count >= v_max_country_limit THEN
        RAISE EXCEPTION 'Cannot add player: Would exceed country limit of % players from same country', v_max_country_limit;
    END IF;

    -- Get validation results for other rules
    SELECT * INTO validation_result 
    FROM validate_team_composition(NEW.team_id) 
    LIMIT 1;

    -- If adding a player would exceed 11, reject
    IF TG_OP = 'INSERT' AND validation_result.player_count >= 11 THEN
        RAISE EXCEPTION 'Cannot add player: Team already has 11 players';
    END IF;

    -- If setting captain and there's already one, reject
    IF NEW.is_captain = true THEN
        IF EXISTS (
            SELECT 1 FROM team_players 
            WHERE team_id = NEW.team_id 
            AND is_captain = true 
            AND is_substituted = false
            AND (TG_OP = 'INSERT' OR id != NEW.id)
        ) THEN
            RAISE EXCEPTION 'Team can only have one captain';
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
        JOIN players p ON tp.player_id = p.id
        WHERE tp.team_id = p_team_id 
        AND tp.is_substituted = false
        GROUP BY p.role
    ),
    role_requirements AS (
        SELECT 'batter' as role, 3 as min_req, 11 as max_req
        UNION ALL SELECT 'bowler', 3, 11
        UNION ALL SELECT 'allrounder', 1, 11
        UNION ALL SELECT 'wicketkeeper', 1, 1
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

CREATE OR REPLACE FUNCTION get_tournament_leaderboard(p_tournament_id uuid)
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
    rank_position integer
)
LANGUAGE sql
AS $$
    WITH team_totals AS (
        SELECT 
            t.id AS team_id,
            t.team_name,
            t.user_id,
            u.username,
            COALESCE(SUM(ts.total), 0) AS total_score,
            COALESCE(SUM(ts.batting), 0) AS batting_total,
            COALESCE(SUM(ts.bowling), 0) AS bowling_total,
            COALESCE(SUM(ts.fielding), 0) AS fielding_total,
            COALESCE(SUM(ts.bonus), 0) AS bonus_total
            
        FROM teams t
        JOIN users u ON t.user_id = u.id
        LEFT JOIN team_scores ts 
            ON t.id = ts.team_id
            AND ts.tournament_id = p_tournament_id
        WHERE t.tournament_id = p_tournament_id
        GROUP BY t.id, t.team_name, t.user_id, u.username
    )
    SELECT 
        tt.*,
        ROW_NUMBER() OVER (
            ORDER BY tt.total_score DESC, tt.batting_total DESC, tt.team_name
        ) AS rank_position
    FROM team_totals tt
    ORDER BY rank_position;
$$;

CREATE OR REPLACE FUNCTION refresh_tournament_leaderboard_with_history(
    p_tournament_id uuid,
    p_match_id uuid
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_leaderboard_count integer;
BEGIN
    -- First check if we have any data to work with
    SELECT COUNT(*) INTO v_leaderboard_count
    FROM get_tournament_leaderboard(p_tournament_id);
    
    IF v_leaderboard_count = 0 THEN
        RAISE NOTICE 'No leaderboard data found for tournament %', p_tournament_id;
        RETURN;
    END IF;
    
    -- Refresh current leaderboard
    DELETE FROM tournament_leaderboard_cache 
    WHERE tournament_id = p_tournament_id;
    
    INSERT INTO tournament_leaderboard_cache (
        tournament_id, team_id, team_name, user_id, username,
        total, batting_total, bowling_total, fielding_total, bonus_total, rank_position
    )
    SELECT 
        p_tournament_id,
        team_id,
        team_name,
        user_id,
        username,
        total,
        batting_total,
        bowling_total,
        fielding_total,
        bonus_total,
        rank_position
    FROM get_tournament_leaderboard(p_tournament_id);
    
    RAISE NOTICE 'Inserted % rows into cache for tournament %', v_leaderboard_count, p_tournament_id;
    
    -- Save snapshot with rank changes
    INSERT INTO tournament_leaderboard_history (
        tournament_id, match_id, team_id, team_name, user_id, username,
        total, batting_total, bowling_total, fielding_total, bonus_total, 
        rank_position, rank_change
    )
    SELECT 
        c.tournament_id,
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
        -- Calculate rank change from most recent previous snapshot FOR THIS MATCH
        COALESCE(prev.rank_position - c.rank_position, 0) as rank_change
    FROM tournament_leaderboard_cache c
    LEFT JOIN LATERAL (
        SELECT rank_position
        FROM tournament_leaderboard_history h
        WHERE h.tournament_id = c.tournament_id
          AND h.team_id = c.team_id
          -- Don't compare with the current match
        ORDER BY created_at DESC
        LIMIT 1
    ) prev ON true
    WHERE c.tournament_id = p_tournament_id
    ON CONFLICT (tournament_id, match_id, team_id) 
    DO UPDATE SET
        rank_position = EXCLUDED.rank_position,
        rank_change = EXCLUDED.rank_change,
        total = EXCLUDED.total,
        batting_total = EXCLUDED.batting_total,
        bowling_total = EXCLUDED.bowling_total,
        fielding_total = EXCLUDED.fielding_total,
        bonus_total = EXCLUDED.bonus_total;
    
    RAISE NOTICE 'Inserted/updated history for match % in tournament %', p_match_id, p_tournament_id;
END;
$$;
