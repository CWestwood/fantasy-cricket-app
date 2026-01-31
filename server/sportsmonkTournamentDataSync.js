const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');

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

      // Validate tournament has required ID
      if (!tournament.id) {
        console.error(`Tournament missing ID: ${tournament.name}, skipping...`);
        continue;
      }

      try {
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

        // Collect unique teams for batch upsertion
        const teamsMap = new Map();

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

            // Handle case-sensitive property names from API
            const localTeam = match.localTeam || match.localteam;
            const visitorTeam = match.visitorTeam || match.visitorteam;

            // Determine if match is currently live
            const isLive = match.status && match.status !== 'NS' && !match.winner_team_id;
            
            // Determine match status
            const matchStatus = match.status && match.status !== 'NS' 
              ? (match.winner_team_id ? 'Finished' : 'Live')
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
              match_name: localTeam && visitorTeam ? `${localTeam.name} vs ${visitorTeam.name}` : 'Unknown vs Unknown',
              team1: localTeam?.name || 'Unknown',
              team2: visitorTeam?.name || 'Unknown',
              location: match.venue?.name || null,
              status: matchStatus,
              match_note: match.note,
              currently_live: isLive,
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

            // Collect teams for batch upsertion (using team sportsmonk_id as key)
            const now = new Date().toISOString();

            if (localTeam?.id) {
              const teamKey = `${tournament.league_id}-${tournament.stage_id}-${tournament.season_id}-${localTeam.id}`;
              if (!teamsMap.has(teamKey)) {
                teamsMap.set(teamKey, {
                  id: uuidv4(),
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
              const teamKey = `${tournament.league_id}-${tournament.stage_id}-${tournament.season_id}-${visitorTeam.id}`;
              if (!teamsMap.has(teamKey)) {
                teamsMap.set(teamKey, {
                  id: uuidv4(),
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
          } catch (matchError) {
            console.error(`Error processing match ${match.id}:`, matchError);
            continue;
          }
        }

        // Batch upsert all unique teams for this tournament
        if (teamsMap.size > 0) {
          try {
            const teams = Array.from(teamsMap.values());

            // Fetch existing teams to handle NULL stage_id correctly and avoid duplicates
            let existingTeamsQuery = supabase
              .from('tournament_teams')
              .select('id, sportsmonk_id')
              .eq('tournament_league_id', tournament.league_id)
              .eq('tournament_season_id', tournament.season_id);

            if (tournament.stage_id) {
              existingTeamsQuery = existingTeamsQuery.eq('tournament_stage_id', tournament.stage_id);
            } else {
              existingTeamsQuery = existingTeamsQuery.is('tournament_stage_id', null);
            }

            const { data: existingTeams } = await existingTeamsQuery;

            if (existingTeams && existingTeams.length > 0) {
              const existingMap = new Map(existingTeams.map((t) => [t.sportsmonk_id, t.id]));
              for (const team of teams) {
                if (existingMap.has(team.sportsmonk_id)) {
                  const existingId = existingMap.get(team.sportsmonk_id);
                  if (existingId) {
                    team.id = existingId;
                  }
                }
              }
            }

            console.log(`Upserting ${teams.length} unique teams for tournament ${tournament.name}`);

            const { error: teamsError } = await supabase
              .from('tournament_teams')
              .upsert(teams, {
                onConflict: 'tournament_league_id,tournament_season_id,tournament_stage_id,sportsmonk_id'
              });

            if (teamsError) {
              console.error(`Error upserting tournament_teams for tournament ${tournament.id}:`, teamsError);
              // Don't throw - log and continue with next tournament
            } else {
              console.log(`Successfully upserted ${teams.length} teams for tournament ${tournament.name}`);
            }
          } catch (teamsBatchError) {
            console.error(`Exception while batch upserting tournament_teams for tournament ${tournament.id}:`, teamsBatchError);
            // Don't throw - log and continue with next tournament
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
