create table public.substitutions (
  id uuid primary key,
  team_id uuid references teams not null,
  tournament_id uuid references tournaments not null,
  player_out_id uuid references squads not null,
  player_in_id uuid references squads not null,
  status text, -- 'pending', 'completed', 'failed'
  requested_at timestamp,
  processed_at timestamp
) TABLESPACE pg_default;

ALTER TABLE substitutions
ADD CONSTRAINT valid_status
CHECK (status IN ('pending', 'completed', 'failed'));

ALTER TABLE substitutions
ADD CONSTRAINT processed_only_when_complete
CHECK (
  (status = 'completed' AND processed_at IS NOT NULL)
  OR (status <> 'completed')
);

alter table public.substitutions enable row level security;
create policy "Team owners can view their own substitutions"
on "public"."substitutions"
for select
to authenticated
using (
  (auth.uid() = ( SELECT teams.user_id
   FROM teams
  WHERE (teams.id = substitutions.team_id)))
);

CREATE POLICY "Team owners can request substitutions"
ON public.substitutions
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = (
    SELECT teams.user_id
    FROM teams
    WHERE teams.id = substitutions.team_id
  )
  AND status = 'pending'
  AND processed_at IS NULL
);


DROP TRIGGER IF EXISTS validate_team_composition_trigger ON team_players;

CREATE OR REPLACE FUNCTION check_team_composition()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    v_tournament_id uuid;
    v_stage text;
    v_max_country_limit integer;
    v_player_country_id uuid;
    v_active_count integer;
    v_country_count integer;
    v_captain_count integer;
BEGIN
    /*
     * 1. Resolve tournament + stage
     */
    SELECT t.tournament_id, t.stage
    INTO v_tournament_id, v_stage
    FROM teams t
    WHERE t.id = NEW.team_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invalid team_id %', NEW.team_id;
    END IF;

    /*
     * 2. Resolve rules (defaults allowed)
     */
    SELECT ts.max_country
    INTO v_max_country_limit
    FROM tournament_settings ts
    WHERE ts.tournament_id = v_tournament_id
      AND ts.stage = v_stage
    LIMIT 1;

    v_max_country_limit := COALESCE(v_max_country_limit, 4);

    /*
     * 3. Country of incoming/updated player
     */
   SELECT c.id
   INTO v_player_country_id
   FROM squads s
   JOIN countries c
   ON c.sportsmonk_id = s.country_id
   WHERE s.id = NEW.player_id;

   IF NOT FOUND THEN
    -- If no country found (e.g. country table not populated), treat as null/no-country to allow submission
    v_player_country_id := NULL;
   END IF;

     /*
     * 4. Build the FINAL active team state
     *
     * This dataset represents what the team would look like
     * AFTER this row is applied.
     */
    WITH active_team AS (
    SELECT
        tp.id,
        c.id AS country_id,   
        tp.is_captain
    FROM team_players tp
    JOIN squads s ON s.id = tp.player_id
    JOIN countries c ON c.sportsmonk_id = s.country_id
    WHERE tp.team_id = NEW.team_id
      AND tp.is_substituted = false
      AND tp.id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000')
)
SELECT
    COUNT(*)                                                   AS active_count,
    COUNT(*) FILTER (WHERE country_id = v_player_country_id)  AS country_count,
    COUNT(*) FILTER (WHERE is_captain = true)                 AS captain_count
INTO
    v_active_count,
    v_country_count,
    v_captain_count
    FROM active_team;

    /*
     * 5. Apply INSERT/UPDATE effects
     */
    IF NEW.is_substituted = false THEN
        v_active_count := v_active_count + 1;
        v_country_count := v_country_count + 1;

        IF NEW.is_captain = true THEN
            v_captain_count := v_captain_count + 1;
        END IF;
    END IF;

    /*
     * 6. Enforce constraints
     */

    -- Max 11 active players
    IF v_active_count > 11 THEN
        RAISE EXCEPTION
            'Invalid team composition: max 11 active players allowed (attempted %)',
            v_active_count;
    END IF;

    -- Country limit
    IF v_country_count > v_max_country_limit THEN
        RAISE EXCEPTION
            'Invalid team composition: max % players allowed from same country',
            v_max_country_limit;
    END IF;

    -- Single active captain
    IF v_captain_count > 1 THEN
        RAISE EXCEPTION
            'Invalid team composition: only one active captain allowed';
    END IF;

    RETURN NEW;
END;
$function$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_countries_sportsmonk_id
ON countries (sportsmonk_id);

CREATE INDEX IF NOT EXISTS idx_squads_country_id
ON squads (country_id);

CREATE OR REPLACE FUNCTION enforce_substitution_limit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_subs_used numeric;
    v_max_subs numeric;
    v_stage text;
BEGIN
    SELECT subs_used, stage
    INTO v_subs_used, v_stage
    FROM teams
    WHERE id = NEW.team_id;

    SELECT max_subs
    INTO v_max_subs
    FROM tournament_settings
    WHERE tournament_id = NEW.tournament_id
      AND stage = v_stage;

    v_max_subs := COALESCE(v_max_subs, 3);

    IF v_subs_used >= v_max_subs THEN
        RAISE EXCEPTION 'Substitution limit reached (% used, % max)', v_subs_used, v_max_subs;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_substitution_limit
BEFORE INSERT ON substitutions
FOR EACH ROW
EXECUTE FUNCTION enforce_substitution_limit();

CREATE OR REPLACE FUNCTION update_substitution_usage_count()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
        UPDATE teams
        SET subs_used = COALESCE(subs_used, 0) + 1
        WHERE id = NEW.team_id;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_substitution_usage_count
AFTER UPDATE ON substitutions
FOR EACH ROW
EXECUTE FUNCTION update_substitution_usage_count();
