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

    if (tournamentsError) {
      console.error('Error fetching tournaments:', tournamentsError);
      throw tournamentsError;
    }

    console.log(`Found ${tournaments?.length || 0} tournaments to process from Sportsmonk`);

    if (!tournaments || tournaments.length === 0) {
      console.log('No tournaments found with status "upcoming" or "in progress"');
      return;
    }

    for (const tournament of tournaments) {
      console.log(
        `Processing tournament: ${tournament.name} - League ID: ${tournament.league_id}, Season ID: ${tournament.season_id}`
      );

      try {
        // FIX: Use actual tournament IDs from the database
        const apiUrl = `https://cricket.sportmonks.com/api/v2.0/fixtures?api_token=${encodeURIComponent(
          sportsmonkApiKey
        )}&filter[league_id]=${tournament.league_id}&filter[season_id]=${tournament.season_id}&include=localTeam,visitorTeam,venue`;

        console.log(`Fetching data from: ${apiUrl.replace(sportsmonkApiKey, '***')}`);

        const response = await fetch(apiUrl);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }

        const apiData = await response.json();
        console.log(`API Response received. Match count: ${apiData?.data?.length || 0}`);

        if (!apiData || !apiData.data || apiData.data.length === 0) {
          console.log(
            `No match data found for tournament League ID: ${tournament.league_id}, Season ID: ${tournament.season_id}`
          );
          continue;
        }

        for (const match of apiData.data) {
          try {
            const matchDateTime = new Date(match.starting_at);
            const matchDate = matchDateTime.toISOString().split('T')[0];

            // Check if match already exists
            const { data: existingMatch, error: existingMatchError } = await supabase
              .from('matches')
              .select('id, completed_and_captured')
              .eq('sportsmonk_id', match.id)
              .single();

            if (existingMatchError && existingMatchError.code !== 'PGRST116') {
              console.error('Error checking existing match:', existingMatchError);
              throw existingMatchError;
            }

            // FIX: Case-sensitive property names from API
            const localTeam = match.localTeam || match.localteam;
            const visitorTeam = match.visitorTeam || match.visitorteam;

            // Check if live match currently
            const matchStatus = apiData.data.status && apiData.data.status !== 'NS' 
          ? (apiData.data.winner_team_id ? 'Finished' : 'live')
          : 'live';

            const matchRecord = {
              sportsmonk_id: match.id,
              // ensure DB tournament id is included
              tournament_id: tournament.id || null,
              tournament_league_id: tournament.league_id,
              tournament_stage_id: tournament.stage_id,
              tournament_season_id: tournament.season_id,
              type_match: match.type,
              match_date: matchDate,
              match_time: matchDateTime.toISOString(),
              match_name: localTeam && visitorTeam ? `${localTeam.name} vs ${visitorTeam.name}` : 'Unknown vs Unknown',
              team1: localTeam?.name || 'Unknown',
              team2: visitorTeam?.name || 'Unknown',
              location: match.venue?.name || null,
              status: match.status,
              match_note: match.note,
              currently_live: matchStatus === 'live' ? true : false,
              completed_and_captured: existingMatch?.completed_and_captured || false,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            };

            // Upsert match data
            const { error: upsertError } = await supabase.from('matches').upsert(matchRecord, {
              onConflict: 'sportsmonk_id'
            });

            if (upsertError) {
              console.error(`Error upserting match ${match.id}:`, upsertError);
              continue;
            }

            console.log(`Successfully upserted match: ${match.id} - ${matchRecord.team1} vs ${matchRecord.team2}`);

            // Ensure teams are recorded in tournament_teams
            try {
              const now = new Date().toISOString();
              const teams = [];

              if (localTeam?.id) {
                teams.push({
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

              if (visitorTeam?.id) {
                teams.push({
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

              if (teams.length > 0) {
                const { error: teamsError } = await supabase
                  .from('tournament_teams')
                  .upsert(teams, {
                    onConflict: 'tournament_league_id,tournament_stage_id,tournament_season_id,sportsmonk_id'
                  });

                if (teamsError) {
                  console.error(`Error upserting tournament_teams for match ${match.id}:`, teamsError);
                } else {
                  console.log(`Tournament teams upserted for match ${match.id}`);
                }
              }
            } catch (teamsCatch) {
              console.error(`Exception while upserting tournament_teams for match ${match.id}:`, teamsCatch);
            }
          } catch (matchError) {
            console.error(`Error processing match ${match.id}:`, matchError);
            continue;
          }
        }
      } catch (tournamentError) {
        console.error(
          `Error processing tournament League ID: ${tournament.league_id}, Season ID: ${tournament.season_id}:`,
          tournamentError
        );
        continue;
      }
    }

    console.log('Sportsmonk tournament data synchronization completed successfully.');
  } catch (error) {
    console.error('Fatal error in sportsmonkTournamentDataSync:', error);
    throw error;
  }
}

// Export the function for GitHub Actions
module.exports = sportsmonkTournamentDataSync;

if (require.main === module) {
  sportsmonkTournamentDataSync().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
  });
}
