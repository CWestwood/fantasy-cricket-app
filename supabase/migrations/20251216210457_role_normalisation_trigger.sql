-- 1. Helper function (This is fine, no changes needed)
CREATE OR REPLACE FUNCTION map_player_role(role text)
RETURNS text AS $$
BEGIN
  CASE lower(role)
    WHEN 'batsman' THEN RETURN 'Batter';
    WHEN 'bowler' THEN RETURN 'Bowler';
    WHEN 'bowling allrounder' THEN RETURN 'Allrounder';
    WHEN 'batting allrounder' THEN RETURN 'Allrounder';
    WHEN 'wk-batsman' THEN RETURN 'Wicketkeeper';
    WHEN 'batter' THEN RETURN 'Batter';
    WHEN 'allrounder' THEN RETURN 'Allrounder';
    WHEN 'wicketkeeper' THEN RETURN 'Wicketkeeper';
    ELSE RETURN role; 
  END CASE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 2. Trigger Function (THIS IS WHERE THE FIX IS)
CREATE OR REPLACE FUNCTION normalize_player_role()
RETURNS TRIGGER AS $$
BEGIN
  -- If it's an INSERT, or if it's an UPDATE where the role changed:
  IF (TG_OP = 'INSERT') OR (NEW.role IS DISTINCT FROM OLD.role) THEN
      NEW.role := map_player_role(NEW.role);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. The Trigger
DROP TRIGGER IF EXISTS trg_normalize_player_role ON players;

CREATE TRIGGER trg_normalize_player_role 
BEFORE INSERT OR UPDATE ON players
FOR EACH ROW
EXECUTE FUNCTION normalize_player_role();

CREATE OR REPLACE FUNCTION set_squad_country_name()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only attempt lookup if country_id is present
  IF NEW.country_id IS NOT NULL THEN
    SELECT c.name
    INTO NEW.country_name
    FROM countries c
    WHERE c.sportsmonk_id = NEW.country_id
    LIMIT 1;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_squad_country_name
BEFORE INSERT OR UPDATE ON squads
FOR EACH ROW
EXECUTE FUNCTION set_squad_country_name();