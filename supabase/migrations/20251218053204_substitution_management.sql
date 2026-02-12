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
