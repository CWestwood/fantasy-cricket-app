create trigger trg_normalize_player_role BEFORE INSERT
or
update on players for EACH row
execute FUNCTION normalize_player_role ();

create trigger validate_team_composition_trigger BEFORE INSERT
or
update on team_players for EACH row
execute FUNCTION check_team_composition ();

create trigger trg_queue_match_update
after INSERT on scores for EACH row
execute FUNCTION queue_match_for_recalculation ();