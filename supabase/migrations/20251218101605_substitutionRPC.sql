CREATE OR REPLACE FUNCTION process_substitution(p_substitution_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  s substitutions%ROWTYPE;
  v_was_captain boolean;
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

  -- Check if outgoing player is captain
  SELECT is_captain
  INTO v_was_captain
  FROM team_players
  WHERE team_id = s.team_id
    AND player_id = s.player_out_id
    AND is_substituted = false
  FOR UPDATE;

  -- Mark outgoing player
  UPDATE team_players
  SET is_substituted = true,
      removed_at = s.requested_at,
  WHERE team_id = s.team_id
    AND player_id = s.player_out_id
    AND is_substituted = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Outgoing player not active';
  END IF;

  -- Add incoming player
  INSERT INTO team_players (team_id, player_id, is_captain)
  VALUES (
    s.team_id,
    s.player_in_id,
    COALESCE(v_was_captain, false)
  );

  -- Mark substitution completed
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
