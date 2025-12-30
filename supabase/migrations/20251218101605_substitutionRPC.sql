CREATE OR REPLACE FUNCTION process_substitution(p_substitution_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  s substitutions%ROWTYPE;
BEGIN
  SELECT *
  INTO s
  FROM substitutions
  WHERE id = p_substitution_id
    AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or already processed substitution';
  END IF;

  -- Mark outgoing player
  UPDATE team_players
  SET is_substituted = true,
      removed_at = s.requested_at
  WHERE team_id = s.team_id
    AND player_id = s.player_out_id
    AND is_substituted = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Outgoing player not active';
  END IF;

  -- Add incoming player (trigger enforces rules)
  INSERT INTO team_players (team_id, player_id)
  VALUES (s.team_id, s.player_in_id);

  -- Success
  UPDATE substitutions
  SET status = 'completed',
      processed_at = now()
  WHERE id = s.id;

EXCEPTION WHEN OTHERS THEN
  UPDATE substitutions
  SET status = 'failed',
      processed_at = now()
  WHERE id = p_substitution_id;

  RAISE;
END;
$$;
