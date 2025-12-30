-- users table
create table public.users (
  id uuid not null,
  username text null,
  email text not null,
  role_level text default 'user'::text,
  created_at timestamp with time zone null default now(),
  constraint users_pkey primary key (id),
  constraint users_email_key unique (email),
  constraint users_username_key unique (username),
  constraint users_role_level_check check (
    (
      role_level = any (array['user'::text, 'admin'::text, 'superadmin'::text])
    )
  )
) TABLESPACE pg_default;

-- Enable RLS
alter table public.users enable row level security;

create policy "Users can view their own data"
on "public"."users"
for select
to authenticated
using (
    auth.uid() = id
);

create policy "Users can update their own data"
on "public"."users"
for update
to authenticated
using (
    auth.uid() = id
);

create policy "Users can delete their own data"
on "public"."users"
for delete
to authenticated
using (
    auth.uid() = id
);

create policy "Authenticated users can view all public profiles"
ON users
FOR SELECT
TO authenticated
using(
    true
);

--countries
create table public.countries (
  id uuid not null default extensions.uuid_generate_v4 (),
  name text not null,
  flag_url text null,
  multiplier numeric null default 1,
  created_at timestamp with time zone null default now(),
  constraint countries_pkey primary key (id)
) TABLESPACE pg_default;

alter table public.countries enable row level security;


-- tournaments table
create table public.tournaments (
  id uuid not null default extensions.uuid_generate_v4 (),
  name text not null,
  created_at timestamp with time zone null default now(),
  status text null,
  is_registering boolean null default false,
  tournament_rounds integer null,
  constraint tournaments_pkey primary key (id)
) TABLESPACE pg_default;

alter table public.tournaments enable row level security;
create policy "Authenticated users can view active tournaments"
on public.tournaments
for select
to authenticated
using (
  is_registering = true
);

--matches
create table public.matches (
  id uuid not null default extensions.uuid_generate_v4 (),
  tournament_id uuid null,
  match_date date null,
  team1 text null,
  team2 text null,
  location text null,
  match_name text null,
  status text null,
  match_time timestamp with time zone null,
  type_match text null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone null default now(),
  completed_and_captured boolean null default false,
  currently_live boolean not null default false,
  constraint matches_pkey primary key (id),
  constraint matches_tournament_id_fkey foreign KEY (tournament_id) references tournaments (id)
) TABLESPACE pg_default;

CREATE INDEX idx_matches_tournament_date ON matches(tournament_id, match_date);

alter table public.matches enable row level security;
create policy "Authenticated users can view all matches"
on public.matches
for select
to authenticated
using (
  true
);


-- user_registration
create table public.user_tournament_registration (
  id uuid not null default extensions.uuid_generate_v4 (),
  user_id uuid not null,
  tournament_id uuid not null,
  created_at timestamp with time zone null default now(),
  constraint user_registration_pkey primary key (id),
  constraint user_registration_user_id_fkey foreign KEY (user_id) references users (id),
  constraint user_registration_tournament_id_fkey foreign KEY (tournament_id) references tournaments (id),
  constraint unique_user_tournament_registration unique (user_id, tournament_id)
) TABLESPACE pg_default;

alter table public.user_tournament_registration enable row level security;

create policy "Users can register THEMSELVES"
on public.user_tournament_registration
for insert
to authenticated
with check (
  auth.uid() = user_id
);

create policy "Users can view their own registrations"
on public.user_tournament_registration
for select
to authenticated
using (
  auth.uid() = user_id
);

create policy "Users can delete their own registrations"
on public.user_tournament_registration
for delete
to authenticated
using (
  auth.uid() = user_id
);



-- tournament_settings
create table public.tournament_settings (
  id uuid not null default extensions.uuid_generate_v4 (),
  tournament_id uuid not null,
  stage text null,
  max_subs numeric null default 3,
  team_selection_deadline timestamp with time zone null,
  max_country numeric not null default '3'::numeric,
  constraint tournament_settings_pkey primary key (id),
  constraint tournament_settings_tournament_id_fkey foreign KEY (tournament_id) references tournaments (id),
  constraint tournament_settings_stage_check check (
    (
      stage = any (array['group'::text, 'knockout'::text])
    )
  )
) TABLESPACE pg_default;

alter table public.tournament_settings enable row level security;

create policy "Authenticated users can view tournament settings"
on public.tournament_settings
for select
to authenticated
using (
  true
);


--tournament_rounds
create table public.tournament_rounds (
  id uuid not null default extensions.uuid_generate_v4 (),
  tournament_id uuid null,
  stage text null,
  created_at timestamp with time zone null default now(),
  constraint tournament_rounds_pkey primary key (id),
  constraint tournament_rounds_tournament_id_fkey foreign KEY (tournament_id) references tournaments(id),
  constraint tournament_rounds_stage_check check (
    (
      stage = any (array['group'::text, 'knockout'::text])
    )
  )
) TABLESPACE pg_default;

alter table public.tournament_rounds enable row level security;

-- tournament_leaderboard_cache
create table public.tournament_leaderboard_cache (
  tournament_id uuid not null,
  team_id uuid not null,
  team_name text null,
  user_id uuid null,
  username text null,
  total numeric null,
  batting_total numeric null,
  bowling_total numeric null,
  fielding_total numeric null,
  bonus_total numeric null,
  rank_position integer null,
  updated_at timestamp with time zone null default now(),
  constraint tournament_leaderboard_cache_pkey primary key (tournament_id, team_id)
) TABLESPACE pg_default;

alter table public.tournament_leaderboard_cache enable row level security;
create policy "Authenticated users can view tournament leaderboards"
on public.tournament_leaderboard_cache
for select
to authenticated
using (
  true
);

create index IF not exists idx_leaderboard_tournament_stage on public.tournament_leaderboard_cache using btree (tournament_id) TABLESPACE pg_default;
create index IF not exists idx_leaderboard_rank on public.tournament_leaderboard_cache using btree (tournament_id, rank_position) TABLESPACE pg_default;

-- tournament_leaderboard_history
create table public.tournament_leaderboard_history (
  id uuid not null default gen_random_uuid (),
  tournament_id uuid not null,
  match_id uuid not null,
  team_id uuid not null,
  team_name text null,
  user_id uuid null,
  username text null,
  total numeric null,
  batting_total numeric null,
  bowling_total numeric null,
  fielding_total numeric null,
  bonus_total numeric null,
  rank_position integer null,
  rank_change integer null,
  created_at timestamp with time zone null default now(),
  constraint tournament_leaderboard_history_pkey primary key (id),
  constraint tournament_leaderboard_histor_tournament_id_match_id_team_i_key unique (tournament_id, match_id, team_id)
) TABLESPACE pg_default;

alter table public.tournament_leaderboard_history enable row level security;

create policy "Authenticated users can view tournament leaderboard history"
on public.tournament_leaderboard_history
for select
to authenticated
using (
  true
);

create index IF not exists idx_leaderboard_history_tournament on public.tournament_leaderboard_history using btree (tournament_id) TABLESPACE pg_default;
create index IF not exists idx_leaderboard_history_match on public.tournament_leaderboard_history using btree (match_id) TABLESPACE pg_default;
create index IF not exists idx_leaderboard_history_team on public.tournament_leaderboard_history using btree (tournament_id, team_id, created_at) TABLESPACE pg_default;

create table public.players (
  id uuid not null default extensions.uuid_generate_v4 (),
  name text not null,
  team_name text null,
  country_id uuid null,
  role text null,
  country_name text null,
  tournament_id uuid null,
  player_id uuid null,
  updated_at timestamp with time zone null default now(),
  constraint players_pkey primary key (id),
  constraint unique_player_tournament unique (player_id, tournament_id),
  constraint players_country_id_fkey foreign KEY (country_id) references countries (id),
  constraint players_tournament_id_fkey foreign KEY (tournament_id) references tournaments (id) on update CASCADE on delete CASCADE
) TABLESPACE pg_default;

alter table public.players enable row level security;
create policy "Authenticated users can view all players"
on public.players
for select
to authenticated
using (
  true
);


create index IF not exists idx_players_country on public.players using btree (country_id) TABLESPACE pg_default;
create index IF not exists idx_players_tournament_name on public.players using btree (tournament_id, lower(name)) TABLESPACE pg_default;
create index IF not exists idx_players_role on public.players using btree (role) TABLESPACE pg_default;

--teams
create table public.teams (
  id uuid not null default extensions.uuid_generate_v4 (),
  user_id uuid not null,
  tournament_id uuid not null,
  team_name text not null,
  logo_url text null,
  created_at timestamp with time zone null default now(),
  subs_used numeric not null default '0'::numeric,
  stage text not null,
  constraint teams_pkey primary key (id),
  constraint teams_user_id_tournament_id_key unique (user_id, tournament_id),
  constraint teams_user_tournament_stage_unique unique (user_id, tournament_id, stage),
  constraint teams_tournament_id_fkey foreign KEY (tournament_id) references tournaments (id),
  constraint teams_user_id_fkey foreign KEY (user_id) references users (id)
) TABLESPACE pg_default;

alter table public.teams enable row level security;

create policy "Authenticated users can view all teams"
ON "public"."teams"
FOR SELECT
TO authenticated
USING (true);

--team_scores
create table public.team_scores (
  id uuid not null default extensions.uuid_generate_v4 (),
  team_id uuid null,
  tournament_id uuid null,
  match_id uuid null,
  total numeric null,
  batting numeric null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone not null default now(),
  bowling numeric null,
  fielding numeric null,
  bonus numeric null,
  constraint team_scores_pkey primary key (id),
  constraint unique_team_match_score unique (team_id, match_id),
  constraint team_scores_match_id_fkey foreign KEY (match_id) references matches (id),
  constraint team_scores_team_id_fkey foreign KEY (team_id) references teams (id),
  constraint team_scores_tournament_id_fkey foreign KEY (tournament_id) references tournaments (id)
) TABLESPACE pg_default;

CREATE INDEX idx_team_scores_tournament ON team_scores(tournament_id);

alter table public.team_scores enable row level security;

create policy "authenticated users can view team scores"
on public.team_scores
for select
to authenticated
using (
  true
);


--team_players
create table public.team_players (
  id uuid not null default extensions.uuid_generate_v4 (),
  team_id uuid null,
  player_id uuid null,
  is_captain boolean null default false,
  is_substituted boolean null default false,
  added_at timestamp with time zone null default now(),
  is_starter boolean not null default true,
  removed_at timestamp with time zone null,
  is_locked boolean not null default false,
  constraint team_players_pkey primary key (id),
  constraint team_players_team_id_player_id_key unique (team_id, player_id),
  constraint team_players_player_id_fkey foreign KEY (player_id) references players (id),
  constraint team_players_team_id_fkey foreign KEY (team_id) references teams (id)

) TABLESPACE pg_default;


create policy "Authenticated users can view all team players"
ON "public"."team_players"
FOR SELECT
TO authenticated
USING (
  true
);



create index IF not exists idx_team_players_team_player on public.team_players using btree (team_id, player_id) TABLESPACE pg_default;
create index IF not exists idx_team_players_player_id on public.team_players using btree (player_id) TABLESPACE pg_default;

--scores
create table public.scores (
  id uuid not null default extensions.uuid_generate_v4 (),
  match_id uuid null,
  player_id uuid null,
  batting numeric null default 0,
  bowling numeric null default 0,
  fielding numeric null default 0,
  bonus numeric null default 0,
  updated_at timestamp with time zone null default now(),
  player_name text null,
  total numeric not null default '0'::numeric,
  constraint scores_pkey primary key (id),
  constraint unique_player_score unique (match_id, player_id),
  constraint scores_match_id_fkey foreign KEY (match_id) references matches (id),
  constraint scores_player_id_fkey foreign KEY (player_id) references players (id)
) TABLESPACE pg_default;

CREATE INDEX idx_scores_player ON scores(player_id);

alter table public.scores enable row level security;
create policy "Authenticated users can view all scores"
on public.scores
for select
to authenticated
using (
  true
);

--score_update_queue
create table public.score_update_queue (
  match_id uuid not null,
  queued_at timestamp with time zone null default now(),
  constraint score_update_queue_pkey primary key (match_id)
) TABLESPACE pg_default;

alter table public.score_update_queue enable row level security;

--score_snapshots
create table public.score_snapshots (
  id uuid not null default extensions.uuid_generate_v4 (),
  team_id uuid null,
  snapshot_date date null,
  total_score numeric null,
  rank numeric null,
  constraint score_snapshots_pkey primary key (id),
  constraint score_snapshots_team_id_fkey foreign KEY (team_id) references teams (id)
) TABLESPACE pg_default;

alter table public.score_snapshots enable row level security;

create policy "Team owners can view their own score snapshots"
on "public"."score_snapshots"
using (
  (auth.uid() = ( SELECT teams.user_id
   FROM teams
  WHERE (teams.id = score_snapshots.team_id)))
);

create policy "Authenticated users can view all score snapshots"
ON "public"."score_snapshots"
FOR SELECT
TO authenticated
USING (true);

--points_config
create table public.points_config (
  id uuid not null default extensions.uuid_generate_v4 (),
  tournament_id uuid null,
  type text null,
  batting_runs numeric null,
  batting_six numeric null,
  batting_duck numeric null,
  batting_30 numeric null,
  batting_50 numeric null,
  batting_100 numeric null,
  batting_200 numeric null,
  batting_slowrr numeric null,
  batting_fastrr numeric null,
  bowling_wicket numeric null,
  bowling_maiden numeric null,
  bowling_six numeric null,
  bowling_lower numeric null,
  bowling_higher numeric null,
  bowling_3wickets numeric null,
  bowling_5wickets numeric null,
  fielding_catch numeric null,
  fielding_runout numeric null,
  fielding_stumping numeric null,
  bonus_potm numeric null,
  bonus_hattrick numeric null,
  created_at timestamp with time zone null default now(),
  batting_balls_faced numeric null,
  bowling_overs numeric not null,
  bowling_noballswides numeric null,
  constraint points_config_pkey primary key (id),
  constraint points_config_tournament_id_fkey foreign KEY (tournament_id) references tournaments (id)
) TABLESPACE pg_default;

alter table public.points_config enable row level security;
create policy "Authenticated users can view points configuration"
on public.points_config
for select
to authenticated
using (
  true
);


--players

-- match_json_archive
create table public.match_json_archive (
  id bigserial not null,
  match_id uuid not null,
  source text not null default 'primary_api'::text,
  snapshot_type text not null,
  snapshot_time timestamp with time zone not null default now(),
  payload jsonb not null,
  checksum text GENERATED ALWAYS as (md5((payload)::text)) STORED null,
  created_at timestamp with time zone not null default now(),
  constraint match_json_archive_pkey primary key (id),
  constraint unique_match_snapshot unique (match_id, snapshot_type),
  constraint match_json_archive_match_id_fkey foreign KEY (match_id) references matches (id) on delete CASCADE
) TABLESPACE pg_default;

alter table public.match_json_archive enable row level security;

-- match_data
create table public.match_data (
  id uuid not null default extensions.uuid_generate_v4 (),
  match_id uuid null,
  tournament_id uuid null,
  player_id uuid null,
  batting_runs numeric null,
  batting_balls_faced numeric null,
  batting_six numeric null,
  bowling_overs numeric null,
  bowling_wickets numeric null,
  bowling_runs_conceded numeric null,
  bowling_sixes_conceded numeric null,
  fielding_catches numeric null,
  fielding_runouts numeric null,
  fielding_stumpings numeric null,
  bonus_potm boolean null default false,
  bonus_hattrick numeric null,
  match_status text null,
  last_updated timestamp with time zone null default now(),
  player_name text null,
  batting_strike_rate numeric null default '0'::numeric,
  bowling_econ_rate numeric null default '0'::numeric,
  bowling_dot_balls numeric null default '0'::numeric,
  bowling_maiden_overs numeric null default '0'::numeric,
  bowling_noballs_wides numeric null,
  batting_outcome text null,
  match_type text null,
  points_allocated boolean not null default false,
  constraint match_data_pkey primary key (id),
  constraint unique_match_player unique (match_id, player_id),
  constraint match_data_match_id_fkey foreign KEY (match_id) references matches (id),
  constraint match_data_player_id_fkey foreign KEY (player_id) references players (id),
  constraint match_data_tournament_id_fkey foreign KEY (tournament_id) references tournaments (id),
  constraint match_data_match_status_check check (
    (
      match_status = any (array['completed'::text, 'live'::text])
    )
  )
) TABLESPACE pg_default;

alter table public.match_data enable row level security;
create policy "Authenticated users can view match data"
on public.match_data
for select
to authenticated
using (
  true
);

--live_scoring
create table public.live_scoring (
  id uuid not null default extensions.uuid_generate_v4 (),
  match_id uuid null,
  player_id uuid null,
  batting numeric null default 0,
  bowling numeric null default 0,
  fielding numeric null default 0,
  bonus numeric null default 0,
  match_status text null,
  updated_at timestamp with time zone null default now(),
  player_name text not null,
  total numeric not null,
  constraint live_scoring_pkey primary key (id),
  constraint unique_live_player_score unique (match_id, player_id),
  constraint live_scoring_match_id_fkey foreign KEY (match_id) references matches (id),
  constraint live_scoring_player_id_fkey foreign KEY (player_id) references players (id),
  constraint live_scoring_match_status_check check (
    (
      match_status = any (
        array['upcoming'::text, 'live'::text, 'completed'::text]
      )
    )
  )
) TABLESPACE pg_default;

alter table public.live_scoring enable row level security;
create policy "Authenticated users can view live scoring"
on public.live_scoring
for select
to authenticated
using (
  true
);


--live_match_data
create table public.live_match_data (
  id uuid not null default extensions.uuid_generate_v4 (),
  match_id uuid null,
  tournament_id uuid null,
  player_id uuid null,
  batting_runs numeric null,
  batting_balls_faced numeric null,
  batting_six numeric null,
  bowling_overs numeric null,
  bowling_wickets numeric null,
  bowling_runs_conceded numeric null,
  bowling_sixes_conceded numeric null,
  fielding_catches numeric null,
  fielding_runouts numeric null,
  fielding_stumpings numeric null,
  bonus_potm boolean null default false,
  bonus_hattrick numeric null,
  match_status text null,
  last_updated timestamp with time zone null default now(),
  player_name text null,
  batting_strike_rate numeric null default '0'::numeric,
  bowling_econ_rate numeric null default '0'::numeric,
  bowling_dot_balls numeric null default '0'::numeric,
  bowling_maiden_overs numeric null default '0'::numeric,
  bowling_noballs_wides numeric null,
  batting_outcome text null,
  match_type text null,
  points_allocated boolean not null default false,
  constraint match_data_duplicate_pkey primary key (id),
  constraint match_data_duplicate_match_id_player_id_key unique (match_id, player_id),
  constraint match_data_duplicate_match_id_fkey foreign KEY (match_id) references matches (id),
  constraint match_data_duplicate_player_id_fkey foreign KEY (player_id) references players (id),
  constraint match_data_duplicate_tournament_id_fkey foreign KEY (tournament_id) references tournaments (id),
  constraint match_data_match_status_check check (
    (
      match_status = any (array['completed'::text, 'live'::text])
    )
  )
) TABLESPACE pg_default;

alter table public.live_match_data enable row level security;
create policy "Authenticated users can view live match data"
on public.live_match_data
for select
to authenticated
using (
  true
);

-- leagues
create table public.leagues (
  id uuid not null default extensions.uuid_generate_v4 (),
  name text not null,
  tournament uuid not null,
  created_by uuid null,
  created_at timestamp with time zone null default now(),
  constraint leagues_pkey primary key (id),
  constraint leagues_created_by_fkey foreign KEY (created_by) references users (id),
  constraint leagues_tournament_fkey foreign KEY (tournament) references tournaments (id) on update CASCADE
) TABLESPACE pg_default;

alter table public.leagues enable row level security;
create policy "Authenticated users can view all leagues"
on public.leagues
for select
to authenticated
using (
  true
);

--league_members
create table public.league_members (
  id uuid not null default extensions.uuid_generate_v4 (),
  user_id uuid null,
  league_id uuid null,
  joined_at timestamp with time zone null default now(),
  constraint league_members_pkey primary key (id),
  constraint league_members_user_id_league_id_key unique (user_id, league_id),
  constraint league_members_league_id_fkey foreign KEY (league_id) references leagues (id),
  constraint league_members_user_id_fkey foreign KEY (user_id) references users (id)
) TABLESPACE pg_default;

alter table public.league_members enable row level security;

create policy "Users can insert their own league membership"
on "public"."league_members"
for insert
to authenticated
with check (
  (auth.uid() = user_id)
);

create policy "Authenticated users can view league members"
on public.league_members 
for select
to authenticated
using (
  true
);

create policy "Users can delete their own league membership"
on public.league_members
for delete
to authenticated
using (
  (auth.uid() = user_id)
);


-- bonus_potm_table
create table public.bonus_potm_table (
  id uuid not null default extensions.uuid_generate_v4 (),
  tournament_id uuid null,
  match_id uuid null,
  player_id uuid null,
  player_name text null,
  potm boolean null default false,
  updated_at timestamp with time zone not null default now(),
  match_name text not null,
  captured boolean not null default false,
  hattrick numeric null default '0'::numeric,
  constraint bonus_potm_table_pkey primary key (id),
  constraint bonus_potm_table_match_id_key unique (match_id),
  constraint single_entry_per_player_match unique (match_id, player_id),
  constraint bonus_potm_table_match_id_fkey foreign KEY (match_id) references matches (id),
  constraint bonus_potm_table_player_id_fkey foreign KEY (player_id) references players (id),
  constraint bonus_potm_table_tournament_id_fkey foreign KEY (tournament_id) references tournaments (id)
) TABLESPACE pg_default;

alter table public.bonus_potm_table enable row level security;

create table public.api_sync_log (
  id uuid not null default gen_random_uuid (),
  sync_run_id uuid not null,
  level character varying(20) not null,
  message text not null,
  metadata jsonb null,
  created_at timestamp with time zone null default now(),
  constraint api_sync_log_pkey primary key (id)
) TABLESPACE pg_default;

alter table public.api_sync_log enable row level security;

create policy "Allow service role to insert logs"
on "public"."api_sync_log"
to service_role
using (
  true
) with check (
  true
);

create index IF not exists idx_api_sync_log_sync_run_id on public.api_sync_log using btree (sync_run_id) TABLESPACE pg_default;
create index IF not exists idx_api_sync_log_created_at on public.api_sync_log using btree (created_at desc) TABLESPACE pg_default;
create index IF not exists idx_api_sync_log_level on public.api_sync_log using btree (level) TABLESPACE pg_default;
create index IF not exists idx_api_sync_log_metadata on public.api_sync_log using gin (metadata) TABLESPACE pg_default;