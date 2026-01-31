const { createClient } = require('@supabase/supabase-js');

async function sportsmonkTournamentDataSync() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const sportsmonkApiKey = process.env.SPORTSMONKS_API_KEY;

  if (!supabaseUrl || !supabaseKey || !sportsmonkApiKey) {
    throw new Error('Missing required environment variables');
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  console.log('Supabase client initialized successfully for Sportsmonk sync');

  try {
    const { data: tournaments, error: tournamentsError } = await supabase
      .from('tournaments')
      .select('id, league_id, stage_id, season_id, name, status')
      .in('status', ['upcoming', 'in progress']);

    if (tournamentsError) throw tournamentsError;
    if (!tournaments || tournaments.length === 0) return;

    for (const tournament of tournaments) {
      console.log(`Processing tournament: ${tournament.name}`);

      try {
        const apiUrl =
          `https://cricket.sportmonks.com/api/v2.0/fixtures` +
          `?api_token=${encodeURIComponent(sportsmonkApiKey)}` +
          `&filter[league_id]=${tournament.league_id}` +
          `&filter[season_id]=${tournament.season_id}` +
          `&include=localTeam,visitorTeam,venue`;

        const response = await fetch(apiUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const apiData = await response.json();
        if (!apiData?.data?.length) continue;

        const teamsMap = new Map();

        for (const match of apiData.data) {
          const localTeam = match.localTeam || match.localteam;
          const visitorTeam = match.visitorTeam || match.visitorteam;

          const matchDateTime = new Date(match.starting_at);
          const matchDate = matchDateTime.toISOString().split('T')[0];

          const isLive =
            match.status && match.status !== 'NS' && !match.winner_team_id;

          const matchStatus =
            match.status && match.status !== 'NS'
              ? match.winner_team_id ? 'Finished' : 'Live'
              : 'Scheduled';

          const matchRecord = {
            sportsmonk_id: match.id,
            tournament_id: tournament.id,
            tournament_league_id: tournament.league_id,
            tournament_stage_id: tournament.stage_id,
            tournament_season_id: tournament.season_id,
            type_match: match.type,
            match_date: matchDate,
            match_time: matchDateTime.toISOString(),
            match_name: localTeam && visitorTeam
              ? `${localTeam.name} vs ${visitorTeam.name}`
              : 'Unknown vs Unknown',
            team1: localTeam?.name || 'Unknown',
            team2: visitorTeam?.name || 'Unknown',
            location: match.venue?.name || null,
            status: matchStatus,
            match_note: match.note,
            currently_live: isLive,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };

          await supabase
            .from('matches')
            .upsert(matchRecord, { onConflict: 'sportsmonk_id' });

          const now = new Date().toISOString();

          if (localTeam?.id) {
            const key = `${tournament.id}-${localTeam.id}`;
            if (!teamsMap.has(key)) {
              teamsMap.set(key, {
                tournament_id: tournament.id,
                tournament_league_id: tournament.league_id,
                tournament_stage_id: tournament.stage_id,
                tournament_season_id: tournament.season_id,
                sportsmonk_id: localTeam.id,
                team_name: localTeam.name || null,
                created_at: now,
                updated_at: now
              });
            }
          }

          if (visitorTeam?.id) {
            const key = `${tournament.id}-${visitorTeam.id}`;
            if (!teamsMap.has(key)) {
              teamsMap.set(key, {
                tournament_id: tournament.id,
                tournament_league_id: tournament.league_id,
                tournament_stage_id: tournament.stage_id,
                tournament_season_id: tournament.season_id,
                sportsmonk_id: visitorTeam.id,
                team_name: visitorTeam.name || null,
                created_at: now,
                updated_at: now
              });
            }
          }
        }

        if (teamsMap.size > 0) {
          const teams = Array.from(teamsMap.values());
          console.log(`Upserting ${teams.length} teams`);

          const { error: teamsError } = await supabase
            .from('tournament_teams')
            .upsert(teams, {
              onConflict: 'tournament_id,sportsmonk_id'
            });

          if (teamsError) console.error(teamsError);
        }

      } catch (tournamentError) {
        console.error(`Tournament failed: ${tournament.name}`, tournamentError);
        continue;
      }
    }

    console.log('Sportsmonk sync completed.');
  } catch (error) {
    console.error('Fatal error:', error);
    throw error;
  }
}

module.exports = sportsmonkTournamentDataSync;

if (require.main === module) {
  sportsmonkTournamentDataSync().catch(() => process.exit(1));
}
