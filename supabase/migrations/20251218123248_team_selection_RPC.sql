CREATE OR REPLACE FUNCTION save_draft_team(
  p_tournament_id uuid,
  p_stage text,
  p_team_name text,
  p_username text,
  p_player_ids uuid[],
  p_captain_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_team_id uuid;
  v_is_locked boolean;
  v_deadline timestamptz;
BEGIN
  -- 1. Validate input
  IF array_length(p_player_ids, 1) IS DISTINCT FROM 11 THEN
    RAISE EXCEPTION 'Team must contain exactly 11 players';
  END IF;

  IF NOT p_captain_id = ANY (p_player_ids) THEN
    RAISE EXCEPTION 'Captain must be one of the selected players';
  END IF;

  -- 2. Update username only (don't insert - user should already exist)
  UPDATE public.users 
  SET username = p_username
  WHERE id = auth.uid() 
    AND (username IS NULL OR username = p_username);
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User record not found. Please ensure user is properly registered.';
  END IF;

  -- 3. Upsert team
  INSERT INTO teams (user_id, tournament_id, stage, team_name, username)
  VALUES (auth.uid(), p_tournament_id, p_stage, p_team_name, p_username)
  ON CONFLICT (user_id, tournament_id, stage)
  DO UPDATE SET 
    team_name = EXCLUDED.team_name,
    username = EXCLUDED.username
  RETURNING id INTO v_team_id;

  -- 4. Lock check
  SELECT is_locked INTO v_is_locked FROM teams WHERE id = v_team_id;
  IF v_is_locked THEN
    RAISE EXCEPTION 'Team is locked and cannot be edited';
  END IF;

  -- 5. Check deadline and auto-lock if past deadline
  SELECT team_selection_deadline INTO v_deadline
  FROM tournament_settings
  WHERE tournament_id = p_tournament_id AND stage = p_stage;

  IF v_deadline IS NOT NULL AND NOW() > v_deadline THEN
    UPDATE teams
    SET is_locked = true
    WHERE id = v_team_id;
    
    -- Optional: You could also raise an exception here to inform the user
    -- RAISE EXCEPTION 'Team selection deadline has passed. Team saved but locked.';
  END IF;

  -- 6. Clear existing active players
  DELETE FROM team_players
  WHERE team_id = v_team_id AND is_substituted = false;

  -- 7. Insert new players
  INSERT INTO team_players (team_id, player_id, is_captain)
  SELECT v_team_id, pid, (pid = p_captain_id)
  FROM unnest(p_player_ids) AS pid;

  RETURN v_team_id;
END;
$$;

CREATE CONSTRAINT TRIGGER validate_team_composition
AFTER INSERT OR UPDATE ON team_players
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION check_team_composition();


-- Trigger function to lock teams after the deadline
CREATE OR REPLACE FUNCTION lock_team_if_deadline_passed()
RETURNS TRIGGER AS $$
DECLARE
  v_deadline timestamptz;
BEGIN
  -- Get the deadline for this tournament and stage
  SELECT team_selection_deadline
    INTO v_deadline
    FROM tournament_settings
   WHERE tournament_id = NEW.tournament_id
     AND stage = NEW.stage;

  -- If deadline exists and has passed, lock the team
  IF v_deadline IS NOT NULL AND now() >= v_deadline THEN
    NEW.is_locked := TRUE;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_team_composition
BEFORE INSERT OR UPDATE ON team_players
FOR EACH ROW
EXECUTE FUNCTION check_team_composition();

CREATE INDEX idx_team_players_active
ON team_players (team_id)
WHERE is_substituted = false;

CREATE OR REPLACE FUNCTION lock_teams_past_deadline()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE teams t
  SET is_locked = true
  FROM tournament_settings ts
  WHERE t.tournament_id = ts.tournament_id
    AND t.stage = ts.stage
    AND ts.team_selection_deadline IS NOT NULL
    AND NOW() > ts.team_selection_deadline
    AND t.is_locked = false;
END;
$$;

CREATE OR REPLACE FUNCTION add_player_name_to_performances()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only attempt lookup if player_name is NULL and player_id exists
  IF NEW.player_name IS NULL
     AND NEW.player_id IS NOT NULL THEN

    SELECT s.name
    INTO NEW.player_name
    FROM squads s
    WHERE s.id = NEW.player_id
    LIMIT 1;

  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_add_player_name_to_performances
BEFORE INSERT OR UPDATE OF player_id, player_name
ON match_data
FOR EACH ROW
WHEN (NEW.player_name IS NULL)
EXECUTE FUNCTION add_player_name_to_performances();



CREATE OR REPLACE FUNCTION live_add_player_name_to_performances()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only attempt lookup if player_name is NULL and player_id exists
  IF NEW.player_name IS NULL
     AND NEW.player_id IS NOT NULL THEN

    SELECT s.name
    INTO NEW.player_name
    FROM squads s
    WHERE s.id = NEW.player_id
    LIMIT 1;

  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_live_add_player_name_to_performances
BEFORE INSERT OR UPDATE OF player_id, player_name
ON live_scoring
FOR EACH ROW
WHEN (NEW.player_name IS NULL)
EXECUTE FUNCTION live_add_player_name_to_performances();
