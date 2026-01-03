const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');
const SyncLogger = require('./utils/synclogger');

async function sportsmonkGetSquadLists() {
  console.log('Starting sportsmonkGetSquadLists process...');

  const stats = {
    tournaments_processed: 0,
    squads_processed: 0,
    players_processed: 0,
    errors: 0
  };

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const sportsmonkApiKey = process.env.SPORTSMONKS_API_KEY;

    if (!supabaseUrl || !supabaseKey || !sportsmonkApiKey) {
      throw new Error('Missing required environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const logger = new SyncLogger(supabase);
    console.log('Supabase client initialized successfully');

    // Get tournaments with status upcoming or in progress
    const { data: tournaments, error: tournamentsError } = await supabase
      .from('tournaments')
      .select('id,league_id, season_id, stage_id, name')
      .in('status', ['upcoming', 'in progress']);

    if (tournamentsError) {
      console.error('Error fetching tournaments:', tournamentsError);
      await logger.logError('fetch_tournaments', tournamentsError);
      throw tournamentsError;
    }

    if (!tournaments || tournaments.length === 0) {
      console.log('No tournaments found with status "upcoming" or "in progress"');
      await logger.log('info', 'No upcoming or in progress tournaments found.', {});
      return;
    }

    console.log(`Found ${tournaments.length} tournaments to process`);

    for (const tournament of tournaments) {
      console.log(` Processing tournament ID: ${tournament.id}`);
      stats.tournaments_processed++;

      try {
        // Fetch teams for this tournament from tournament_teams
        console.log('Querying tournament_teams for tournament', tournament.id);
        const { data: tournamentTeams, error: ttError } = await supabase
          .from('tournament_teams')
          .select('*')
          .eq('tournament_season_id', tournament.season_id)
          .eq('tournament_league_id', tournament.league_id)
          .eq('tournament_stage_id', tournament.stage_id);

        if (ttError) {
          console.error('Error fetching tournament_teams:', ttError);
          await logger.logError('fetch_tournament_teams', ttError);
          stats.errors++;
          continue;
        }

        if (!tournamentTeams || tournamentTeams.length === 0) {
          console.log(`No teams found in tournament_teams for tournament ${tournament.id}`);
          await logger.log('info', `No teams found for tournament ${tournament.id}`, {});
          continue;
        }

        console.log(`Found ${tournamentTeams.length} teams for tournament ${tournament.id}`);
        await logger.logSquadSyncStart(tournamentTeams.length);

        for (const teamRow of tournamentTeams) {
          // Try to resolve probable column names for team id and season id
          const teamId =teamRow.sportsmonk_id;
          const seasonId = teamRow.tournament_season_id;
          const teamName = teamRow.team_name;

          if (!teamId || !seasonId) {
            console.log(`Skipping team row due to missing teamId or seasonId: ${JSON.stringify(teamRow)}`);
            await logger.log('warn', 'missing_team_or_season', { teamRow, tournament: tournament.id });
            continue;
          }

          console.log(`Fetching squad for team ${teamId} season ${seasonId}`);

          const apiUrl = `https://cricket.sportmonks.com/api/v2.0/teams/${teamId}/squad/${seasonId}?api_token=${sportsmonkApiKey}`;
          const response = await fetch(apiUrl);

          if (!response.ok) {
            console.error(`SportsMonk API request failed for team ${teamId}:`, response.status, response.statusText);
            await logger.logApiCall(teamId, false, response.status);
            stats.errors++;
            continue;
          }

          const apiData = await response.json();

          if (!apiData || !apiData.data || !Array.isArray(apiData.data.squad)) {
            console.log(`No squad data found for team ${teamId} season ${seasonId}`);
            await logger.log('info', `No squad data for team ${teamId} season ${seasonId}`);
            continue;
          }

          const players = apiData.data.squad;
          console.log(`Found ${players.length} players for team ${teamId}`);

          for (const player of players) {
            try {
              // Find existing squad record
              const { data: existingPlayer, error: fetchError } = await supabase
                .from('squads')
                .select('*')
                .eq('sportsmonk_id', player.id)
                .eq('tournament_season_id', tournament.season_id)
                .eq('tournament_league_id', tournament.league_id)
                .eq('tournament_stage_id', tournament.stage_id)
                .single();

              if (fetchError && fetchError.code !== 'PGRST116') {
                console.error('Error checking existing squad player:', fetchError);
                await logger.logError('fetch_squad_player_error', fetchError);
                stats.errors++;
                continue;
              }

              stats.players_processed++;

              const playerName = player.fullname || `${player.firstname || ''} ${player.lastname || ''}`.trim();
              const role = player.position && player.position.name ? player.position.name : null;

              let squadData;

              if (existingPlayer) {
                // Update only changed/missing fields, keep existing uuid
                squadData = {
                  ...existingPlayer,
                  id: existingPlayer.uuid,
                  sportsmonk_id: player.id,
                  name: playerName || existingPlayer.name,
                  team_name: teamName || apiData.data.name || existingPlayer.team_name,
                  country_name: existingPlayer.country_name || null,
                  country_id: player.country_id ?? existingPlayer.country_id,
                  role: role || existingPlayer.role,
                  tournament_stage_id: tournament.stage_id,
                  tournament_league_id: tournament.league_id,
                  tournament_season_id: tournament.season_id,
                  tournament_id: tournament.id,
                  updated_at: new Date().toISOString()
                };

              } else {
                squadData = {
                  id: uuidv4(),
                  sportsmonk_id: player.id,
                  name: playerName,
                  team_name: teamName || apiData.data.name || null,
                  country_name: null,
                  country_id: player.country_id ?? null,
                  role: role,
                  tournament_stage_id: tournament.stage_id,
                  tournament_league_id: tournament.league_id,
                  tournament_season_id: tournament.season_id,
                  tournament_id: tournament.id,
                  updated_at: new Date().toISOString()
                };
              }

              const { error: upsertError } = await supabase
                .from('squads')
                .upsert(squadData, { onConflict: 'tournament_league_id,tournament_stage_id,tournament_season_id,sportsmonk_id, team_name' });

              if (upsertError) {
                console.error(`Error upserting squad player ${playerName} (${player.id}):`, upsertError);
                await logger.logError('upsert_squad_error', upsertError);
                stats.errors++;
              } else {
                console.log(`Processed player: ${playerName} (${player.id})`);
                stats.squads_processed++;
              }

            } catch (playerError) {
              console.error(`Error processing squad player:`, playerError);
              await logger.logError('player_processing_error', playerError);
              stats.errors++;
            }
          }
        }

      } catch (tournamentError) {
        console.error(`Error processing tournament ${tournament.id}:`, tournamentError);
        await logger.logError('tournament_error', tournamentError);
        stats.errors++;
      }
    }

    console.log('SportsMonk squad sync completed');
    await logger.logSyncComplete(stats);

  } catch (error) {
    console.error('Fatal error in sportsmonkGetSquadLists:', error);
    // logger may be undefined if client init failed; attempt safe log
    try { if (typeof logger !== 'undefined') await logger.logError('fatal_error', error); } catch (e) {}
    stats.errors++;
    throw error;
  }
}

module.exports = sportsmonkGetSquadLists;

if (require.main === module) {
  sportsmonkGetSquadLists()
    .then(() => {
      console.log('✅ Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Script failed:', error);
      process.exit(1);
    });
}
