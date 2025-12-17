-- Complete rewrite of check_team_composition trigger
-- Drop and recreate to ensure old version doesn't interfere

DROP TRIGGER IF EXISTS validate_team_composition_trigger ON team_players;

CREATE OR REPLACE FUNCTION check_team_composition()
RETURNS TRIGGER 
LANGUAGE plpgsql
AS $function$
DECLARE
    v_max_country_limit integer;
    v_tournament_id uuid;
    v_stage text;
    v_country_count integer;
    v_player_country_id uuid;
    v_active_player_count integer;
    v_captain_count integer;
BEGIN
    -- Skip validation if player is being marked as substituted
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
    AND stage = v_stage
    LIMIT 1;

    -- Default to 4 if no setting found
    v_max_country_limit := COALESCE(v_max_country_limit, 4);

    -- Get the country of the player being added/updated
    SELECT country_id INTO v_player_country_id
    FROM players WHERE id = NEW.player_id;

    -- Check if adding this player would violate country limit
    -- Only count players that are currently active (is_substituted = false)
    SELECT COUNT(*) INTO v_country_count
    FROM team_players tp
    JOIN players p ON tp.player_id = p.id
    WHERE tp.team_id = NEW.team_id 
    AND p.country_id = v_player_country_id
    AND tp.is_substituted = false
    AND tp.id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000');

    -- If adding this player would exceed country limit, reject
    IF v_country_count >= v_max_country_limit THEN
        RAISE EXCEPTION 'Cannot add player: Would exceed country limit of % players from same country', v_max_country_limit;
    END IF;

    -- Count active (non-substituted) players in the team
    SELECT COUNT(*) INTO v_active_player_count
    FROM team_players tp
    WHERE tp.team_id = NEW.team_id 
    AND tp.is_substituted = false
    AND tp.id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000');

    -- If adding a player would exceed 11, reject
    IF TG_OP = 'INSERT' AND v_active_player_count >= 11 THEN
        RAISE EXCEPTION 'Cannot add player: Team already has 11 players. Current active: %', v_active_player_count;
    END IF;

    -- Check captain constraint: if setting a captain, ensure no other active captain exists
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

-- Recreate the trigger
CREATE TRIGGER validate_team_composition_trigger
    BEFORE INSERT OR UPDATE ON team_players
    FOR EACH ROW
    EXECUTE FUNCTION check_team_composition();
