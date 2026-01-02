const { createClient } = require('@supabase/supabase-js');

async function sportsmonkTournamentDataSync() {
  // Placeholder function for Sportsmonk tournament data synchronization
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
      .select('league_id', 'stage_id', 'season_id', 'name')
      .in('status', ['upcoming', 'in progress']);

    if (tournamentsError) {
      console.error('Error fetching tournaments:', tournamentsError);
      logger.logError('tournaments_error', tournamentsError);
      stats.errors++;
      throw tournamentsError;
    }

    console.log(`Found ${tournaments?.length || 0} tournaments to process from Sportsmonk`);

    for (const tournament of tournaments || []) {
      console.log(
        `Processing tournament League ID: ${tournament.name} - ${tournament.league_id}, Season ID: ${tournament.season_id}`
      );

      try {
        const apiUrl = `https://cricket.sportmonks.com/api/v2.0/fixtures?api_token=${encodeURIComponent(
          sportsmonkApiKey
        )}&filter[league_id]=5&filter[season_id]=1730&include=localTeam,visitorTeam`;

        const response = await fetch(apiUrl);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }

        const apiData = await response.json();
        console.log('Data fetched successfully');

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

            const matchRecord = {
              sportsmonk_id: match.id,
              tournament_league_id: tournament.league_id,
              tournament_stage_id: tournament.stage_id,
              tournament_season_id: tournament.season_id,
              type_match: match.type,
              match_date: matchDate,
              match_time: matchDateTime,
              team1: match.localteam.name,
              team2: match.visitorteam.name,
              location: match.venue ? match.venue.name : null,
              match_status: match.status,
              match_note: match.note,
              currently_live: false,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            };

            // preserve completed_and_captured if present
            matchRecord.completed_and_captured = existingMatch
              ? existingMatch.completed_and_captured
              : false;

            // Upsert match data
            const { error: upsertError } = await supabase.from('matches').upsert(matchRecord, {
              onConflict: 'sportsmonk_id'
            });

            if (upsertError) {
              console.error(`Error upserting match ${match.id}:`, upsertError);
              continue;
            } else {
              console.log(`Successfully upserted match: ${match.id} ${matchRecord.team1} vs ${matchRecord.team2}`);

              // --- new: ensure teams are recorded in tournament_teams ---
              try {
                const now = new Date().toISOString();
                const teams = [];

                if (match.localteam && match.localteam.id) {
                  teams.push({
                    tournament_league_id: tournament.league_id,
                    tournament_stage_id: tournament.stage_id,
                    tournament_season_id: tournament.season_id,
                    team_id: match.localteam.id,
                    team_name: match.localteam.name || null,
                    created_at: now,
                    updated_at: now
                  });
                }

                if (match.visitorteam && match.visitorteam.id) {
                  teams.push({
                    tournament_league_id: tournament.league_id,
                    tournament_stage_id: tournament.stage_id,
                    tournament_season_id: tournament.season_id,
                    team_id: match.visitorteam.id,
                    team_name: match.visitorteam.name || null,
                    created_at: now,
                    updated_at: now
                  });
                }

                if (teams.length > 0) {
                  // Upsert by composite key to avoid duplicate entries if table has a matching unique constraint
                  const { error: teamsError } = await supabase
                    .from('tournament_teams')
                    .upsert(teams, {
                      onConflict: 'tournament_league_id,tournament_stage_id,tournament_season_id,team_id'
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
              // --- end new ---
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
      }
    }

    console.log('Sportsmonk tournament data synchronization completed.');
  } catch (error) {
    console.error('Fatal error in sportsmonkTournamentDataSync:', error);
    throw error;
  }
}

// Export the function for GitHub Actions
module.exports = sportsmonkTournamentDataSync;

