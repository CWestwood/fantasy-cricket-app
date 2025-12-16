const { createClient } = require('@supabase/supabase-js');
const SyncLogger = require('./utils/synclogger');

async function cricketDataSync() {
  let logger = null;
  let stats = { tournaments_found: 0, matches_added: 0, errors: 0};
  try {
    // Initialize Supabase client
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const cricketApiKey = process.env.CRICKET_API_KEY;

    if (!supabaseUrl || !supabaseKey || !cricketApiKey) {
      throw new Error('Missing required environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    logger = new SyncLogger(supabase);
    console.log('✅ Supabase client initialized successfully');

    const stats = {
      tournaments_found: 0,
      matches_added: 0,
      errors: 0
    };

    // Step 1: Query tournaments with status "upcoming" or "in progress"
    console.log('🔍 Querying tournaments with status "upcoming" or "in progress"...');
    
    const { data: tournaments, error: tournamentsError } = await supabase
      .from('tournaments')
      .select('id', 'name')
      .in('status', ['upcoming', 'in progress']);

    if (tournamentsError) {
      console.error('❌ Error fetching tournaments:', tournamentsError);
      logger.logError('tournaments_error', tournamentsError);
      stats.errors++;
      throw tournamentsError;
    }

    if (!tournaments || tournaments.length === 0) {
      console.log('ℹ️ No tournaments found with status "upcoming" or "in progress"');
      logger.log('info', 'No upcoming or current tournaments found', {});
      return;
    }

    console.log(`✅ Found ${tournaments.length} tournaments to process`);

    // Step 2: Process each tournament
    for (const tournament of tournaments) {
      console.log(`\n🏆 Processing tournament ID: ${tournament.id}`);
      stats.tournaments_found++
      
      try {
        // Fetch match data from Cricket API
        const apiUrl = `https://api.cricapi.com/v1/series_info?apikey=${cricketApiKey}&id=${tournament.id}`;
        console.log(`📡 Fetching data from Cricket API for tournament ${tournament.id}...`);
        
        const response = await fetch(apiUrl);
        
        if (!response.ok) {
          console.error(`❌ Cricket API request failed for tournament ${tournament.id}: ${response.status} ${response.statusText}`);
          logger.logApiCall(tournament.id, false, response.status );
          stats.errors++;
          continue;
        }

        const apiData = await response.json();
        console.log(`✅ Successfully fetched data from Cricket API for tournament ${tournament.id}`);

        // Check if matchList exists and has matches
        if (!apiData.data || !apiData.data.matchList || apiData.data.matchList.length === 0) {
          console.log(`ℹ️ No matches found for tournament ${tournament.id}`);
          logger.log('info', `No matches found for ${tournament.name} ${tournament.id}`, {});
          continue;
        }

        console.log(`📋 Found ${apiData.data.matchList.length} matches for tournament ${tournament.id}`);

        // Step 3: Process each match and upsert to Supabase
        for (const match of apiData.data.matchList) {
          stats.matches_added++;
          try {
            // Parse datetime
            const matchDateTime = new Date(match.dateTimeGMT);
            const matchDate = matchDateTime.toISOString().split('T')[0];

            // Check if match already exists to preserve completed_and_captured field
            const { data: existingMatch, error: fetchError } = await supabase
              .from('matches')
              .select('completed_and_captured')
              .eq('id', match.id)
              .single();

            if (fetchError && fetchError.code !== 'PGRST116') {
              console.error(`❌ Error checking existing match ${match.id}:`, fetchError);
              logger.logError('fetch_error', fetchError);
              stats.errors++;
              continue;
            }

            // Prepare match data for upsert
            const matchData = {
              tournament_id: tournament.id,
              id: match.id,
              match_name: match.name,
              type_match: match.matchType,
              match_date: matchDate,
              match_time: matchDateTime,
              team1: match.teams && match.teams[0] ? match.teams[0] : null,
              team2: match.teams && match.teams[1] ? match.teams[1] : null,
              location: match.venue,
              status: match.status,
              currently_live: false,
              updated_at: new Date().toISOString()
            };

            // If match exists, preserve the completed_and_captured field
            if (existingMatch) {
              matchData.completed_and_captured = existingMatch.completed_and_captured;
              console.log(`🔄 Updating existing match: ${match.name} (preserving completed_and_captured: ${existingMatch.completed_and_captured})`);
            } else {
              // For new matches, set completed_and_captured to false
              matchData.completed_and_captured = false;
              console.log(`➕ Creating new match: ${match.name}`);
            }

            // Upsert match data
            const { error: upsertError } = await supabase
              .from('matches')
              .upsert(matchData, { 
                onConflict: 'id',
                ignoreDuplicates: false 
              });

            if (upsertError) {
              console.error(`❌ Error upserting match ${match.id}:`, upsertError);
              logger.logError('upsert_error', upsertError);
              stats.errors++;
            } else {
              console.log(`✅ Successfully upserted match: ${match.name} (ID: ${match.id})`);
            }

          } catch (matchError) {
            console.error(`❌ Error processing match ${match.id}:`, matchError);
            logger.logError('match_error', matchError);
            stats.errors++;
          }
        }

      } catch (tournamentError) {
        console.error(`❌ Error processing tournament ${tournament.id}:`, tournamentError);
        logger.logError('tournament_error', tournamentError);
        stats.errors++;
      }
    }

    console.log('\n🎉 Tournament match sync completed successfully');
    await logger.logSyncComplete(stats);

  } catch (error) {
    console.error('❌ Fatal error in cricketDataSync:', error);
    if (logger) {
      await logger.logError('fatal_error', error);
    }
    stats.errors++;
    throw error;
  }
}

// Export the function for GitHub Actions
module.exports = cricketDataSync;

// If running directly (for testing)
if (require.main === module) {
  cricketDataSync()
    .then(() => {
      console.log('✅ Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Script failed:', error);
      process.exit(1);
    });
}