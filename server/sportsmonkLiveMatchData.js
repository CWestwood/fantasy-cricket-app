const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');
const SyncLogger = require('./utils/synclogger');

async function syncLiveMatchData() {
  // Initialize Supabase client
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const cricketApiKey = process.env.SPORTSMONKS_API_KEY;

    if (!supabaseUrl || !supabaseKey || !cricketApiKey) {
      throw new Error('Missing required environment variables');
    };

    const supabase = createClient(supabaseUrl, supabaseKey);
    const logger = new SyncLogger(supabase);

    const stats = {
      matches_processed: 0,
      matches_completed: 0,
      players_processed: 0,
      batting_records: 0,
      bowling_records: 0,
      fielding_records: 0,
      errors: 0
    };

    try {
    console.log('Supabase client initialized successfully');

    // Step 1: Query matches that need data capture
    console.log('Querying matches with status = Live or In Progress ....');

    const { data: matches, error: matchesError } = await supabase
      .from('matches')
      .select('id, sportsmonk_id, match_name, type_match, tournament_id')
      .eq('currently_live', true);

    if (matchesError) {
      console.error('Error fetching matches:', matchesError);
      await logger.logError('fetch_matches', matchesError);
      throw matchesError;
    }

    if (!matches || matches.length === 0) {
      console.log('No matches found that need data capture');
      await logger.log('info', 'No matches found that need data capture', {});
      return;
    }
    await logger.logMatchDataSyncStart(matches.length);
    console.log(`Found ${matches.length} matches to process`);

    // Step 2: Process each match
    for (const match of matches) {
      await logger.logMatchStart(match);
      stats.matches_processed ++;
      console.log(`Processing match: ${match.match_name} (ID: ${match.id})`);

      const playersProcessedThisMatch = new Set();

      try {
        // Fetch match scorecard from Cricket API
        const apiUrl = `https://cricket.sportmonks.com/api/v2.0/fixtures/${match.sportsmonk_id}?api_token=${cricketApiKey}&include=bowling,batting`;
        console.log(`Fetching scorecard data from Cricket API for match ${match.match_name}...`);
        
        const response = await fetch(apiUrl);

        if (!response.ok) {
          console.error(`Cricket API request failed for match ${match.id}: ${response.status} ${response.statusText}`);
          await logger.logApiCall(match.id, false, response.status);
          stats.errors++;
          continue;
        }
        
        await logger.logApiCall(match.id, true, response.status);

        const apiData = await response.json();
        console.log(`Successfully fetched scorecard data for ${match.type_match} match ${match.id}`);

        // Check if scorecard data exists
        if (!apiData.data || !apiData.data.batting || apiData.data.batting.length === 0 || !apiData.data.bowling || apiData.data.bowling.length === 0) {
          console.log(`No scorecard data found for match ${match.id}`);
          await logger.logNoScorecard(match.id);
          continue;
        }

        // Determine match status
        const matchStatus = apiData.data.status && apiData.data.status !== 'NS' 
          ? (apiData.data.winner_team_id ? 'Finished' : 'live')
          : 'live';

        console.log(`Processing scorecard data for match ${match.match_name} (Status: ${matchStatus})`);

        const matchStats = {
                  batting: 0,
                  bowling: 0,
                  fielding: 0
                };
        
        // Step 3: Process each innings
        // Process batting data
        if (apiData.data.batting && apiData.data.batting.length > 0) {
        console.log(`Processing batting data...`);
        
        for (const battingEntry of apiData.data.batting) {
            if (battingEntry.player_id) {
            try {
                // Get or create player
                const currentSupabasePlayerId = await getOrCreatePlayer(
                battingEntry.player_id, 
                match.tournament_id, 
                supabase, 
                cricketApiKey,
                battingEntry.team_id
                );

                if (!currentSupabasePlayerId) {
                console.error(`Skipping batting data for player ${battingEntry.player_id} as Supabase player ID could not be determined.`);
                await logger.logPlayerProcessing(
                    'get batting player', 
                    `Player ${battingEntry.player_id}`, 
                    battingEntry.player_id, 
                    match.id, 
                    false
                );
                continue;
                }

                if (!playersProcessedThisMatch.has(currentSupabasePlayerId)) {
                playersProcessedThisMatch.add(currentSupabasePlayerId);
                stats.players_processed++;
                }

                // Check if player already has data, update or create new entry
                const { data: existingData, error: existingError } = await supabase
                .from('live_match_data')
                .select('*')
                .eq('match_id', match.id)
                .eq('player_id', currentSupabasePlayerId)
                .single();

                // Determine dismissal text from wicket_id
                let dismissalText = null;
                if (battingEntry.wicket_id === 54) { // Caught
                dismissalText = 'Caught';
                } else if (battingEntry.wicket_id === 63) { // Run out
                dismissalText = 'Run Out';
                } else if (battingEntry.wicket_id === 56) { // Stumped
                dismissalText = 'Stumped';
                } else if (battingEntry.wicket_id === 84) { // Not out
                dismissalText = 'Not Out';
                } else if (battingEntry.wicket_id === 79) { // Bowled
                dismissalText = 'Bowled';
                } else if (battingEntry.wicket_id === 55) { // Caught by substitute fielder
                dismissalText = 'Caught by substitute fielder';
                } else if (battingEntry.wicket_id === 83) { // LBW
                dismissalText = 'LBW';
                } else if (battingEntry.wicket_id === 85) { // Retired Hurt
                dismissalText = 'Retired Hurt';
                } else dismissalText = 'Other';

               let matchData;
                if (existingData) {
                // Update existing record with batting data - preserve existing bowling/fielding data
                matchData = {
                    ...existingData,
                    batting_runs: battingEntry.score || 0,
                    batting_balls_faced: battingEntry.ball || 0,
                    batting_six: battingEntry.six_x || 0,
                    batting_strike_rate: battingEntry.rate || 0,
                    batting_outcome: dismissalText,
                    match_status: matchStatus,
                    last_updated: new Date().toISOString(),
                };
                } else {
                // Create new record with batting data
                matchData = {
                    match_id: match.id,
                    tournament_id: match.tournament_id,
                    match_type: match.type_match,
                    player_id: currentSupabasePlayerId,
                    player_name: null, // May need separate lookup
                    batting_runs: battingEntry.score || 0,
                    batting_balls_faced: battingEntry.ball || 0,
                    batting_six: battingEntry.six_x || 0,
                    batting_strike_rate: battingEntry.rate || 0,
                    batting_outcome: dismissalText,
                    bowling_overs: 0,
                    bowling_wickets: 0,
                    bowling_runs_conceded: 0,
                    bowling_sixes_conceded: 0,
                    bowling_dot_balls: 0,
                    bowling_noballs_wides: 0,
                    bowling_maiden_overs: 0,
                    bowling_econ_rate: 0,
                    fielding_catches: 0,
                    fielding_runouts: 0,
                    fielding_stumpings: 0,
                    bonus_potm: false,
                    bonus_hattrick: 0,
                    match_status: matchStatus,
                    points_allocated: false, 
                    last_updated: new Date().toISOString(),
                };
                }

                // Upsert batting data
                const { error: upsertError } = await supabase
                .from('live_match_data')
                .upsert(matchData, { 
                    onConflict: 'match_id,player_id',
                    ignoreDuplicates: false 
                });

                if (upsertError) {
                console.error(`Error upserting batting data for player ${battingEntry.player_id}:`, upsertError);
                await logger.logPlayerProcessing(
                    'upsert batting data',
                    `Player ${battingEntry.player_id}`,
                    currentSupabasePlayerId,
                    match.id,
                    false
                );
                stats.errors++;
                } else {
                console.log(`Successfully upserted batting data: Player ${battingEntry.player_id} - ${battingEntry.score} runs`);
                await logger.logPlayerProcessing(
                    'upsert batting data',
                    `Player ${battingEntry.player_id}`,
                    currentSupabasePlayerId,
                    match.id,
                    true,
                    { runs: battingEntry.score }
                );
                matchStats.batting++;
                stats.batting_records++;
                }

            } catch (battingError) {
                console.error(`Error processing batting data for player ${battingEntry.player_id}:`, battingError);
                await logger.logError('process_batting', battingError, {
                match_id: match.id,
                player_id: battingEntry.player_id
                });
                stats.errors++;
            }
            }
        }
        }

        // Process bowling data
        if (apiData.data.bowling && apiData.data.bowling.length > 0) {
        console.log(`Processing bowling data...`);
        
        for (const bowlingEntry of apiData.data.bowling) {
            if (bowlingEntry.player_id) {
            try {
                // Get or create player
                const currentSupabasePlayerId = await getOrCreatePlayer(
                bowlingEntry.player_id, 
                match.tournament_id, 
                supabase, 
                cricketApiKey,
                bowlingEntry.team_id
                );

                if (!currentSupabasePlayerId) {
                console.error(`Skipping bowling data for player ${bowlingEntry.player_id} as Supabase player ID could not be determined.`);
                await logger.logPlayerProcessing(
                    'get bowling player', 
                    `Player ${bowlingEntry.player_id}`, 
                    bowlingEntry.player_id, 
                    match.id, 
                    false
                );
                continue;
                }

                if (!playersProcessedThisMatch.has(currentSupabasePlayerId)) {
                playersProcessedThisMatch.add(currentSupabasePlayerId);
                stats.players_processed++;
                }

                // Check if player already has batting data, update or create new entry
                const { data: existingData, error: existingError } = await supabase
                .from('live_match_data')
                .select('*')
                .eq('match_id', match.id)
                .eq('player_id', currentSupabasePlayerId)
                .single();

                const noballs_wides = (bowlingEntry.noball || 0) + (bowlingEntry.wide || 0);

                let matchData;
                if (existingData) {
                // Update existing record with bowling data - preserve existing batting/fielding data
                matchData = {
                    ...existingData,
                    bowling_overs: bowlingEntry.overs || 0,
                    bowling_wickets: bowlingEntry.wickets || 0,
                    bowling_runs_conceded: bowlingEntry.runs || 0,
                    bowling_sixes_conceded: 0, // Not available in new API format
                    bowling_dot_balls: 0, // Not available in new API format
                    bowling_noballs_wides: parseInt(noballs_wides) || 0,
                    bowling_maiden_overs: bowlingEntry.medians || 0,
                    bowling_econ_rate: bowlingEntry.rate || 0,
                    match_status: matchStatus,
                    last_updated: new Date().toISOString()
                };
                } else {
                // Create new record with only bowling data
                matchData = {
                    match_id: match.id,
                    tournament_id: match.tournament_id,
                    match_type: match.type_match,
                    player_id: currentSupabasePlayerId,
                    player_name: null, // May need separate lookup
                    batting_runs: 0,
                    batting_balls_faced: 0,
                    batting_six: 0,
                    batting_strike_rate: 0,
                    batting_outcome: null,
                    bowling_overs: bowlingEntry.overs || 0,
                    bowling_wickets: bowlingEntry.wickets || 0,
                    bowling_runs_conceded: bowlingEntry.runs || 0,
                    bowling_sixes_conceded: 0, // Not available in new API format
                    bowling_dot_balls: 0, // Not available in new API format
                    bowling_maiden_overs: bowlingEntry.medians || 0,
                    bowling_noballs_wides: parseInt(noballs_wides) || 0,
                    bowling_econ_rate: bowlingEntry.rate || 0,
                    fielding_catches: 0,
                    fielding_runouts: 0,
                    fielding_stumpings: 0,
                    bonus_potm: false,
                    bonus_hattrick: 0,
                    match_status: matchStatus,
                    points_allocated: false, 
                    last_updated: new Date().toISOString()
                };
                }

                const { error: upsertError } = await supabase
                .from('live_match_data')
                .upsert(matchData, { 
                    onConflict: 'match_id,player_id',
                    ignoreDuplicates: false 
                });

                if (upsertError) {
                console.error(`Error upserting bowling data for player ${bowlingEntry.player_id}:`, upsertError);
                await logger.logPlayerProcessing(
                    'upsert bowling data',
                    `Player ${bowlingEntry.player_id}`,
                    currentSupabasePlayerId,
                    match.id,
                    false
                );
                stats.errors++;
                } else {
                console.log(`Successfully upserted bowling data: Player ${bowlingEntry.player_id} - ${bowlingEntry.wickets} wickets`);
                await logger.logPlayerProcessing(
                    'upsert bowling data',
                    `Player ${bowlingEntry.player_id}`,
                    currentSupabasePlayerId,
                    match.id,
                    true,
                    { wickets: bowlingEntry.wickets }
                );
                matchStats.bowling++;
                stats.bowling_records++;
                }

            } catch (bowlingError) {
                console.error(`Error processing bowling data for player ${bowlingEntry.player_id}:`, bowlingError);
                await logger.logError('process_bowling', bowlingError, {
                match_id: match.id,
                player_id: bowlingEntry.player_id
                });
                stats.errors++;
            }
            }
        }
        }
   
        
        // Process fielding data
        // Derive fielding stats from batting data dismissals
        console.log(`Processing fielding data from batting dismissals...`);

        if (apiData.data.batting && apiData.data.batting.length > 0) {
        for (const battingEntry of apiData.data.batting) {
            try {
            let fielderId = null;
            let fieldingType = null;

            // Determine fielding type and fielder ID
            if (battingEntry.wicket_id === 54 && battingEntry.catch_stump_player_id) {
                // Caught
                fielderId = battingEntry.catch_stump_player_id;
                fieldingType = 'catch';
            } else if (battingEntry.wicket_id === 79) {
                // Run out - check both runout_by_id and catch_stump_player_id
                fielderId = battingEntry.runout_by_id || battingEntry.catch_stump_player_id;
                fieldingType = 'runout';
            } else if (battingEntry.wicket_id === 56 && battingEntry.catch_stump_player_id) {
                // Stumped
                fielderId = battingEntry.catch_stump_player_id;
                fieldingType = 'stumping';
            }

            // Process the fielding credit if we have a fielder
            if (fielderId && fieldingType) {
                const currentSupabasePlayerId = await getOrCreatePlayer(
                fielderId, 
                match.tournament_id, 
                supabase, 
                cricketApiKey,
                battingEntry.team_id
                );

                if (!currentSupabasePlayerId) {
                console.error(`Skipping fielding data for player ${fielderId}`);
                continue;
                }

                if (!playersProcessedThisMatch.has(currentSupabasePlayerId)) {
                playersProcessedThisMatch.add(currentSupabasePlayerId);
                stats.players_processed++;
                }

                // Check if player already has data
                const { data: existingData } = await supabase
                .from('live_match_data')
                .select('*')
                .eq('match_id', match.id)
                .eq('player_id', currentSupabasePlayerId)
                .single();

                let matchData;
                if (existingData) {
                matchData = {
                    ...existingData,
                    fielding_catches: fieldingType === 'catch' 
                    ? (existingData.fielding_catches || 0) + 1 
                    : existingData.fielding_catches,
                    fielding_runouts: fieldingType === 'runout' 
                    ? (existingData.fielding_runouts || 0) + 1 
                    : existingData.fielding_runouts,
                    fielding_stumpings: fieldingType === 'stumping' 
                    ? (existingData.fielding_stumpings || 0) + 1 
                    : existingData.fielding_stumpings,
                    match_status: matchStatus,
                    last_updated: new Date().toISOString()
                };
                } else {
                matchData = {
                    match_id: match.id,
                    tournament_id: match.tournament_id,
                    match_type: match.type_match,
                    player_id: currentSupabasePlayerId,
                    player_name: null,
                    batting_runs: 0,
                    batting_balls_faced: 0,
                    batting_six: 0,
                    batting_strike_rate: 0,
                    batting_outcome: null,
                    bowling_overs: 0,
                    bowling_wickets: 0,
                    bowling_runs_conceded: 0,
                    bowling_sixes_conceded: 0,
                    bowling_noballs_wides: 0,
                    bowling_maiden_overs: 0,
                    bowling_dot_balls: 0,
                    bowling_econ_rate: 0,
                    fielding_catches: fieldingType === 'catch' ? 1 : 0,
                    fielding_runouts: fieldingType === 'runout' ? 1 : 0,
                    fielding_stumpings: fieldingType === 'stumping' ? 1 : 0,
                    bonus_potm: false,
                    bonus_hattrick: 0,
                    match_status: matchStatus,
                    points_allocated: false, 
                    last_updated: new Date().toISOString()
                };
                }

                const { error: upsertError } = await supabase
                .from('live_match_data')
                .upsert(matchData, { 
                    onConflict: 'match_id,player_id',
                    ignoreDuplicates: false 
                });

                if (upsertError) {
                console.error(`Error upserting ${fieldingType} for player ${fielderId}:`, upsertError);
                await logger.logPlayerProcessing(
                    `upsert ${fieldingType}`,
                    `Player ${fielderId}`,
                    currentSupabasePlayerId,
                    match.id,
                    false
                );
                stats.errors++;
                } else {
                console.log(`Successfully upserted ${fieldingType}: Player ${fielderId}`);
                await logger.logPlayerProcessing(
                    `upsert ${fieldingType}`,
                    `Player ${fielderId}`,
                    currentSupabasePlayerId,
                    match.id,
                    true,
                    { fieldingType }
                );
                matchStats.fielding++;
                stats.fielding_records++;
                }
            }

            } catch (fieldingError) {
            console.error(`Error processing fielding data:`, fieldingError);
            await logger.logError('process_fielding', fieldingError, {
                match_id: match.id,
                player_id: battingEntry.player_id
            });
            stats.errors++;
            }
        }
    }

          } catch (matchError) {
        console.error(`Error processing match ${match.id}:`, matchError);
        await logger.logError('process_match', matchError, {
          match_id: match.id,
          match_name: match.match_name
        });
        stats.errors++;
      }
    }

    console.log('Live match data sync completed successfully');
    await logger.logSyncComplete(stats);

  } catch (error) {
    console.error('Fatal error in syncLiveMatchData:', error);
    await logger.logError('sync_live_match_data', error);
    throw error;
  }
}

// Helper function to get or create player
async function getOrCreatePlayer(playerId, tournamentId, supabase, cricketApiKey, teamID) {
  // First try to find existing player
  const { data: playerData, error: playerError } = await supabase
    .from('squads')
    .select('id')
    .eq('sportsmonk_id', playerId)
    .eq('tournament_id', tournamentId)
    .single();

  if (!playerError && playerData) {
    return playerData.id;
  }

  // Player not found, create new one
  console.log(`Player not found in squads table:(${playerId}). Creating new player...`);
  
  const playerUrl = `https://cricket.sportmonks.com/api/v2.0/players/${playerId}?api_token=${cricketApiKey}`;
  const playerResponse = await fetch(playerUrl);

  if (!playerResponse.ok) {
    console.log(`Cricket API request failed for player ${playerId}`);
    return null;
  }

  const playerInfo = await playerResponse.json();
  const newPlayerId = uuidv4();
  const playerInformation = {
    id: newPlayerId,
    name: playerInfo.data.fullname,
    role: playerInfo?.data?.position?.name || null,
    team_name: playerInfo.data.team_name,
    country_id: playerInfo.data.country_id,
    sportsmonk_id: playerInfo.data.id,
    tournament_id: tournamentId,
    team_id: teamID,
    updated_at: new Date().toISOString()
  };

  const { error: upsertError } = await supabase
    .from('squads')
    .upsert(playerInformation, { 
      onConflict: 'sportsmonk_id,tournament_id',
      ignoreDuplicates: false 
    });

  if (upsertError) {
    console.error(`Error upserting player ${playerInformation.name} (${playerInformation.id}):`, upsertError);
    return null;
  } else {
    console.log(`Successfully upserted player: ${playerInformation.name}`);
    return newPlayerId;
  }
}


module.exports = { syncLiveMatchData };

if (require.main === module) {
  syncLiveMatchData()
    .then(() => {
      console.log('✓ Sync completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('✗ Sync failed:', error);
      console.error(error.stack);
      process.exit(1);
    });
}