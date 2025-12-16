const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');
const SyncLogger = require('./utils/synclogger');

async function getSquadLists() {
  console.log('🚀 Starting getSquadLists process...');
  try {
    // Initialize Supabase client
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const cricketApiKey = process.env.CRICKET_API_KEY;

    if (!supabaseUrl || !supabaseKey || !cricketApiKey) {
      throw new Error('Missing required environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const logger = new SyncLogger(supabase);
    console.log('✅ Supabase client initialized successfully');

    const stats = {
      tournaments_processed: 0,
      squads_processed: 0,
      players_processed: 0,
      errors: 0
    }

    // Step 1: Query tournaments with status "upcoming" or "in progress"
    console.log('🔍 Querying tournaments with status "upcoming" or "in progress"...');
    
    const { data: tournaments, error: tournamentsError } = await supabase
      .from('tournaments')
      .select('id', 'name')
      .in('status', ['upcoming', 'in progress']);

    if (tournamentsError) {
      console.error('❌ Error fetching tournaments:', tournamentsError);
      await logger.logError('fetch_tournaments', tournamentsError);
      throw tournamentsError;
    }

    if (!tournaments || tournaments.length === 0) {
      console.log('ℹ️ No tournaments found with status "upcoming" or "in progress"');
      await logger.log('info', 'No upcoming or in progress tournaments found.', {});
      return;
    }

    console.log(`✅ Found ${tournaments.length} tournaments to process`);

    // Step 2: Process each tournament
    for (const tournament of tournaments) {
      console.log(`\n🏆 Processing tournament ID: ${tournament.id}`);
      stats.tournaments_processed++;
      
      try {
        // Fetch squad data from Cricket API
        const apiUrl = `https://api.cricapi.com/v1/series_squad?apikey=${cricketApiKey}&id=${tournament.id}`;
        console.log(`📡 Fetching squad data from Cricket API for tournament ${tournament.id}...`);
        
        const response = await fetch(apiUrl);
        
        if (!response.ok) {
          console.error(`❌ Cricket API request failed for tournament ${tournament.id}: ${response.status} ${response.statusText}`);
          await logger.logApiCall(tournament.id, false, response.status);
          stats.errors++;
          continue;
        }

        const apiData = await response.json();
        console.log(`✅ Successfully fetched data from Cricket API for tournament ${tournament.id}`);

        // Check if data exists and has teams with players
        if (!apiData.data || !Array.isArray(apiData.data) || apiData.data.length === 0) {
          console.log(`ℹ️ No squad data found for tournament ${tournament.id}`);
          logger.log('info', `No squad data found for ${tournament.name} ${tournament.id}`)
          continue;
        }

        console.log(`📋 Found ${apiData.data.length} teams for tournament ${tournament.id}`);
        await logger.logSquadSyncStart(apiData.data.length);
        
        // Step 3: Process each team and their players
        for (const team of apiData.data) {
          console.log(`👥 Processing team: ${team.teamName}`);
          stats.squads_processed++;
  
          if (!team.players || team.players.length === 0) {
            console.log(`ℹ️ No players found for team ${team.teamName}`);
            logger.log('info', `No players found for team ${team.teamName}`);
            continue;
          }

          for (const player of team.players) {
            try {
              // Check if player already exists
              const { data: existingPlayer, error: fetchError } = await supabase
                .from('players')
                .select('*')
                .eq('player_id', player.id)
                .eq('tournament_id', tournament.id)
                .single();

              if (fetchError && fetchError.code !== 'PGRST116') {
                console.error(`❌ Error checking existing player ${player.name}:`, fetchError);
                logger.logError('fetch_error', fetchError );
                stats.errors++
                continue;
              }

              let squadData;

              if (existingPlayer) {
                // Player exists - update only missing/changed fields
                console.log(`🔄 Updating existing player: ${player.name} (${team.teamName})`);
                stats.players_processed++;
                
                squadData = {
                  ...existingPlayer,
                  // Update these fields if they're different or missing
                  name: player.name || existingPlayer.name,
                  team_name: team.teamName || existingPlayer.team_name,
                  role: player.role || existingPlayer.role,
                  country_name: player.country || existingPlayer.country_name,
                  updated_at: new Date().toISOString()
                };

                // Only log what's being updated
                const updates = [];
                if (player.name && player.name !== existingPlayer.name) updates.push(`name: ${existingPlayer.name} → ${player.name}`);
                if (team.teamName && team.teamName !== existingPlayer.team_name) updates.push(`team: ${existingPlayer.team_name} → ${team.teamName}`);
                if (player.role && player.role !== existingPlayer.role) updates.push(`role: ${existingPlayer.role} → ${player.role}`);
                if (player.country && player.country !== existingPlayer.country_name) updates.push(`country: ${existingPlayer.country_name} → ${player.country}`);
                
                if (updates.length > 0) {
                  console.log(`   📝 Updates: ${updates.join(', ')}`);
                } else {
                  console.log(`   ℹ️ No changes needed for ${player.name}`);
                }

              } else {
                // New player - create complete record
                console.log(`➕ Creating new player: ${player.name} (${team.teamName})`);
                stats.players_processed++;
                
                squadData = {
                  id: uuidv4(),
                  player_id: player.id,
                  tournament_id: tournament.id,
                  name: player.name,
                  team_name: team.teamName,
                  role: player.role,
                  country_name: player.country,
                  updated_at: new Date().toISOString()
                };
              }

              // Upsert player data
              const { error: upsertError } = await supabase
                .from('players')
                .upsert(squadData, { 
                  onConflict: 'player_id,tournament_id',
                  ignoreDuplicates: false 
                });

              if (upsertError) {
                console.error(`❌ Error upserting player ${player.name} (${player.id}):`, upsertError);
                logger.logError('upsert_error', upsertError);
                stats.errors++;
              } else {
                console.log(`✅ Successfully processed player: ${player.name} - ${team.teamName}`);
              }

            } catch (playerError) {
              console.error(`❌ Error processing player ${player.name}:`, playerError);
              logger.logError('player_error', playerError);
              stats.errors++;
            }
          }
        }

      } catch (tournamentError) {
        console.error(`❌ Error processing tournament ${tournament.id}:`, tournamentError);
        logger.logError('tournament_error', tournamentError);
        stats.errors++;
      }
    }

    console.log('\n🎉 Tournament squad sync completed successfully');
    await logger.logSyncComplete(stats);

  } catch (error) {
    console.error('❌ Fatal error in getSquadLists:', error);
    logger.log('fatal_error', error);
    stats.errors++;
    throw error;
  }
}

// Export the function for GitHub Actions
module.exports = getSquadLists;

// If running directly (for testing)
if (require.main === module) {
  getSquadLists()
    .then(() => {
      console.log('✅ Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Script failed:', error);
      process.exit(1);
    });
}