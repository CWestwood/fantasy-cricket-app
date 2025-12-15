const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');
const SyncLogger = require('./utils/synclogger');

async function syncMatchData() {
  
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const cricketApiKey = process.env.CRICKET_API_KEY;
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
    console.log('✅ Supabase client initialized successfully');

    // Step 1: Query matches that need data capture
    console.log('🔍 Querying matches with status != "Match not started" and completed_and_captured = false...');

    const { data: matches, error: matchesError } = await supabase
      .from('matches')
      .select('id, tournament_id, match_name, type_match')
      .neq('status', 'Match not started')
      .not('status', 'ilike', 'Match starts at%')
      .eq('completed_and_captured', 'FALSE');

    if (matchesError) {
      console.error('❌ Error fetching matches:', matchesError);
      await logger.logError('fetch_matches', matchesError);
      throw matchesError;
    }

    if (!matches || matches.length === 0) {
      console.log('ℹ️ No matches found that need data capture');
      await logger.log('info', 'No matches found that need data capture', {});
      return;
    }
    await logger.logMatchDataSyncStart(matches.length);
    console.log(`✅ Found ${matches.length} matches to process`);

    // Step 2: Process each match
    for (const match of matches) {
      await logger.logMatchStart(match);
      stats.matches_processed ++;
      console.log(`\n🏏 Processing match: ${match.match_name} (ID: ${match.id})`);

      const playersProcessedThisMatch = new Set();

      try {
        // Fetch match scorecard from Cricket API
        const apiUrl = `https://api.cricapi.com/v1/match_scorecard?apikey=${cricketApiKey}&id=${match.id}`;
        console.log(`📡 Fetching scorecard data from Cricket API for match ${match.id}...`);

        const response = await fetch(apiUrl);

        if (!response.ok) {
          console.error(`❌ Cricket API request failed for match ${match.id}: ${response.status} ${response.statusText}`);
          await logger.logApiCall(match.id, false, response.status);
          stats.errors++;
          continue;
        }
        
        await logger.logApiCall(match.id, true, response.status);
        const apiData = await response.json();
        console.log(`✅ Successfully fetched scorecard data for ${match.type_match} match ${match.id}`);

        // Check if scorecard data exists
        if (!apiData.data || !apiData.data.scorecard || apiData.data.scorecard.length === 0) {
          console.log(`ℹ️ No scorecard data found for match ${match.id}`);
          await logger.logNoScorecard(match.id);
          continue;
        }

        // Determine match status
        const matchStatus = apiData.data.status && apiData.data.status !== 'Match not started' 
          ? (apiData.data.matchWinner ? 'completed' : 'live')
          : 'live';

        console.log(`📊 Processing scorecard data for match ${match.match_name} (Status: ${matchStatus})`);

        const matchStats = {
                  batting: 0,
                  bowling: 0,
                  fielding: 0
                };

        // Step 3: Process each innings
        for (const innings of apiData.data.scorecard) {
          console.log(`⚾ Processing innings data...`);

          // Process batting data
          if (innings.batting && innings.batting.length > 0) {
            for (const battingEntry of innings.batting) {
              if (battingEntry.batsman && battingEntry.batsman.id) {
                try {
                  // Get or create player
                  const currentSupabasePlayerId = await getOrCreatePlayer(
                    battingEntry.batsman.id, 
                    battingEntry.batsman.name, 
                    match.tournament_id, 
                    supabase, 
                    cricketApiKey
                  );

                  if (!currentSupabasePlayerId) {
                    console.error(`Skipping batting data for ${battingEntry.batsman.name} as Supabase player ID could not be determined.`);
                    await logger.logPlayerProcessing(
                      'get batting player', 
                      battingEntry.batsman.name, 
                      battingEntry.batsman.id, 
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
                    .from('match_data')
                    .select('*')
                    .eq('match_id', match.id)
                    .eq('player_id', currentSupabasePlayerId)
                    .single();

                  let matchData;
                  if (existingData) {
                    // Update existing record with batting data - preserve existing bowling/fielding data
                    matchData = {
                      ...existingData,
                      batting_runs: battingEntry.r || 0,
                      batting_balls_faced: battingEntry.b || 0,
                      batting_six: battingEntry['6s'] || 0,
                      batting_strike_rate: battingEntry.sr || 0,
                      batting_outcome: battingEntry['dismissal-text'] || null,
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
                      player_name: battingEntry.batsman.name,
                      batting_runs: battingEntry.r || 0,
                      batting_balls_faced: battingEntry.b || 0,
                      batting_six: battingEntry['6s'] || 0,
                      batting_strike_rate: battingEntry.sr || 0,
                      batting_outcome: battingEntry['dismissal-text'] || null,
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
                    .from('match_data')
                    .upsert(matchData, { 
                      onConflict: 'match_id,player_id',
                      ignoreDuplicates: false 
                    });

                  if (upsertError) {
                    console.error(`❌ Error upserting batting data for ${battingEntry.batsman.name}:`, upsertError);
                    await logger.logPlayerProcessing(
                      'upsert batting data',
                      battingEntry.batsman.name,
                      currentSupabasePlayerId,
                      match.id,
                      false
                    );
                    stats.errors++;
                  } else {
                    console.log(`✅ Successfully upserted batting data: ${battingEntry.batsman.name} - ${battingEntry.r} runs`);
                    await logger.logPlayerProcessing(
                      'upsert batting data',
                      battingEntry.batsman.name,
                      currentSupabasePlayerId,
                      match.id,
                      true,
                      { runs: battingEntry.r }
                    );
                    matchStats.batting++;
                    stats.batting_records++;
                  }

                } catch (battingError) {
                  console.error(`❌ Error processing batting data for ${battingEntry.batsman.name}:`, battingError);
                  await logger.logError('process_batting', battingError, {
                    match_id: match.id,
                    player_name: battingEntry.batsman.name
                  });
                  stats.errors++;
                }
              }
            }
          }

          // Process bowling data
          if (innings.bowling && innings.bowling.length > 0) {
            for (const bowlingEntry of innings.bowling) {
              if (bowlingEntry.bowler && bowlingEntry.bowler.id) {
                try {
                  // Get or create player
                  const currentSupabasePlayerId = await getOrCreatePlayer(
                    bowlingEntry.bowler.id, 
                    bowlingEntry.bowler.name, 
                    match.tournament_id, 
                    supabase, 
                    cricketApiKey
                  );

                  if (!currentSupabasePlayerId) {
                    console.error(`Skipping bowling data for ${bowlingEntry.bowler.name} as Supabase player ID could not be determined.`);
                    await logger.logPlayerProcessing(
                      'get bowling player', 
                      bowlingEntry.bowler.name, 
                      bowlingEntry.bowler.id, 
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
                    .from('match_data')
                    .select('*')
                    .eq('match_id', match.id)
                    .eq('player_id', currentSupabasePlayerId)
                    .single();

                  const noballs_wides = (bowlingEntry.nb || 0) + (bowlingEntry.wd || 0);

                  let matchData;
                  if (existingData) {
                    // Update existing record with bowling data - preserve existing batting/fielding data
                    matchData = {
                      ...existingData,
                      bowling_overs: bowlingEntry.o || 0,
                      bowling_wickets: bowlingEntry.w || 0,
                      bowling_runs_conceded: bowlingEntry.r || 0,
                      bowling_sixes_conceded: bowlingEntry['6s'] || 0,
                      bowling_dot_balls: bowlingEntry.d || 0, 
                      bowling_noballs_wides: parseInt(noballs_wides) || 0,
                      bowling_maiden_overs: bowlingEntry.m || 0,
                      bowling_econ_rate: bowlingEntry.eco || 0,
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
                      player_name: bowlingEntry.bowler.name,
                      batting_runs: 0,
                      batting_balls_faced: 0,
                      batting_six: 0,
                      batting_strike_rate: 0,
                      batting_outcome: null,
                      bowling_overs: bowlingEntry.o || 0,
                      bowling_wickets: bowlingEntry.w || 0,
                      bowling_runs_conceded: bowlingEntry.r || 0,
                      bowling_sixes_conceded: bowlingEntry['6s'] || 0,
                      bowling_dot_balls: bowlingEntry.d || 0,
                      bowling_maiden_overs: bowlingEntry.m || 0,
                      bowling_noballs_wides: parseInt(noballs_wides) || 0,
                      bowling_econ_rate: bowlingEntry.eco || 0,
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
                    .from('match_data')
                    .upsert(matchData, { 
                      onConflict: 'match_id,player_id',
                      ignoreDuplicates: false 
                    });

                  if (upsertError) {
                    console.error(`❌ Error upserting bowling data for ${bowlingEntry.bowler.name}:`, upsertError);
                    await logger.logPlayerProcessing(
                      'upsert bowling data',
                      bowlingEntry.bowler.name,
                      currentSupabasePlayerId,
                      match.id,
                      false
                    );
                    stats.errors++;
                  } else {
                    console.log(`✅ Successfully upserted bowling data: ${bowlingEntry.bowler.name} - ${bowlingEntry.w} wickets`);
                     await logger.logPlayerProcessing(
                      'upsert bowling data',
                      bowlingEntry.bowler.name,
                      currentSupabasePlayerId,
                      match.id,
                      true,
                      { wickets: bowlingEntry.w }
                    );
                    matchStats.bowling++;
                    stats.bowling_records++;
                    }

                } catch (bowlingError) {
                  console.error(`❌ Error processing bowling data for ${bowlingEntry.bowler.name}:`, bowlingError);
                  await logger.logError('process_bowling', bowlingError, {
                    match_id: match.id,
                    player_name: bowlingEntry.bowler.name
                  });
                }
              }
            }
          }

          // Process fielding data
          if (innings.catching && innings.catching.length > 0) {
            for (const fieldingEntry of innings.catching) {
              if (fieldingEntry.catcher && fieldingEntry.catcher.id) {
                try {
                  // Get or create player
                  const currentSupabasePlayerId = await getOrCreatePlayer(
                    fieldingEntry.catcher.id, 
                    fieldingEntry.catcher.name, 
                    match.tournament_id, 
                    supabase, 
                    cricketApiKey
                  );

                  if (!currentSupabasePlayerId) {
                    console.error(`Skipping fielding data for ${fieldingEntry.catcher.name} as Supabase player ID could not be determined.`);
                    await logger.logPlayerProcessing(
                      'get fielding player', 
                      fieldingEntry.catcher.name, 
                      fieldingEntry.catcher.id, 
                      match.id, 
                      false
                    );; 
                    continue;
                  }

                  if (!playersProcessedThisMatch.has(currentSupabasePlayerId)) {
                    playersProcessedThisMatch.add(currentSupabasePlayerId);
                    stats.players_processed++;
                  }

                 // Check if player already has data, update or create new entry
                  const { data: existingData, error: existingError } = await supabase
                    .from('match_data')
                    .select('*')
                    .eq('match_id', match.id)
                    .eq('player_id', currentSupabasePlayerId)
                    .single();

                  let matchData;
                  if (existingData) {
                    // Update existing record with fielding data - preserve existing batting/bowling data
                    matchData = {
                      ...existingData,
                      fielding_catches: (existingData.fielding_catches || 0) + (fieldingEntry.catch || 0),
                      fielding_runouts: (existingData.fielding_runouts || 0) + (fieldingEntry.runout || 0),
                      fielding_stumpings: (existingData.fielding_stumpings || 0) + (fieldingEntry.stumped || 0),
                      match_status: matchStatus,
                      last_updated: new Date().toISOString()
                    };
                  } else {
                    // Create new record with only fielding data
                    matchData = {
                      match_id: match.id,
                      tournament_id: match.tournament_id,
                      match_type: match.type_match,
                      player_id: currentSupabasePlayerId,
                      player_name: fieldingEntry.catcher.name,
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
                      fielding_catches: fieldingEntry.catch || 0,
                      fielding_runouts: fieldingEntry.runout || 0,
                      fielding_stumpings: fieldingEntry.stumped || 0,
                      bonus_potm: false,
                      bonus_hattrick: 0,
                      match_status: matchStatus,
                      points_allocated: false, 
                      last_updated: new Date().toISOString()
                    };
                  }

                  const { error: upsertError } = await supabase
                    .from('match_data')
                    .upsert(matchData, { 
                      onConflict: 'match_id,player_id',
                      ignoreDuplicates: false 
                    });

                  if (upsertError) {
                    console.error(`❌ Error upserting fielding data for ${fieldingEntry.catcher.name}:`, upsertError);
                    await logger.logPlayerProcessing(
                      'upsert fielding data',
                      fieldingEntry.catcher.name,
                      fieldingEntry.catcher.id,
                      match.id,
                      false
                    );
                  } else {
                    console.log(`✅ Successfully upserted fielding data: ${fieldingEntry.catcher.name} - ${fieldingEntry.catch} catches`);
                    await logger.logPlayerProcessing(
                      'upsert fielding data',
                      fieldingEntry.catcher.name,
                      fieldingEntry.catcher.id,
                      match.id,
                      true,
                      { catches: fieldingEntry.catch }  
                    );
                    matchStats.fielding++;
                    stats.fielding_records++;
                  }

                } catch (fieldingError) {
                  console.error(`❌ Error processing fielding data for ${fieldingEntry.catcher.name}:`, fieldingError);
                  await logger.logError('process_fielding', fieldingError, {
                    match_id: match.id,
                    player_name: fieldingEntry.catcher.name
                  });
                }
              }
            }
          }
        }

        // Mark match as completed and captured if it's a completed match
        if (matchStatus === 'completed') {
          stats.matches_completed++; 
          const { error: updateError } = await supabase
            .from('matches')
            .update({ completed_and_captured: true })
            .eq('id', match.id);

          const { error: deleteError1 } = await supabase
            .from('live_scoring')
            .delete()
            .eq('match_id', match.id);

          const { error: deleteError2 } = await supabase
            .from('live_match_data')
            .delete()
            .eq('match_id', match.id);

          const { error: potmUpsertError } = await supabase
            .from('bonus_potm_table')
            .upsert({
              tournament_id: match.tournament_id,
              match_id: match.id,
              match_name: match.match_name, 
              player_id: null,
              player_name: null,
              potm: false,
              hattrick: 0,
              captured: false,
              updated_at: new Date().toISOString()
            }, 
            { 
              onConflict: 'match_id',
              ignoreDuplicates: false 
            });
            
          if (updateError) {
            console.error(`❌ Error updating match completion status:`, updateError);
          } else {
            console.log(`✅ Marked match as completed and captured: ${match.match_name}`);
          }

          if (deleteError1) {
            console.error('Error deleting live scoring:', deleteError1);
          } else {
            console.log('Deleted live scoring data');
          }

          if (deleteError2) {
            console.error('Error deleting live match data:', deleteError2);
          } else {
            console.log('Deleted live match data');
          }

          if (potmUpsertError) {
            console.error('Error updating bonus table:', potmUpsertError);
          } else {
            console.log('Updated bonus table with entry for match');
          }
          await saveMatchJson(supabase, match, apiData)
          
        }
        await logger.logMatchComplete(match, matchStatus, matchStats);

      } catch (matchError) {
        console.error(`❌ Error processing match ${match.id}:`, matchError);
        await logger.logError('process_match', matchError, {
          match_id: match.id,
          match_name: match.match_name
        });
        stats.errors++;
      }
    }

    console.log('\n🎉 Match data sync completed successfully');
    await logger.logSyncComplete(stats);

  } catch (error) {
    console.error('❌ Fatal error in syncMatchData:', error);
    await logger.logError('sync_match_data', error);
    throw error;
  }
}

// Helper function to get or create player
async function getOrCreatePlayer(playerId, playerName, tournamentId, supabase, cricketApiKey) {
  // First try to find existing player
  const { data: playerData, error: playerError } = await supabase
    .from('players')
    .select('id')
    .eq('player_id', playerId)
    .eq('tournament_id', tournamentId)
    .single();

  if (!playerError && playerData) {
    return playerData.id;
  }

  // Player not found, create new one
  console.log(`⚠️ Player not found in players table: ${playerName} (${playerId}). Creating new player...`);
  
  const playerUrl = `https://api.cricapi.com/v1/players_info?apikey=${cricketApiKey}&id=${playerId}`;
  const playerResponse = await fetch(playerUrl);

  if (!playerResponse.ok) {
    console.log(`❌ Cricket API request failed for player ${playerName}: ${playerId}`);
    return null;
  }

  const playerInfo = await playerResponse.json();
  const newPlayerId = uuidv4();
  const playerInformation = {
    id: newPlayerId,
    name: playerInfo.data.name,
    role: playerInfo.data.role,
    team_name: playerInfo.data.team_name,
    country_name: playerInfo.data.country,
    player_id: playerInfo.data.id,
    tournament_id: tournamentId,
    updated_at: new Date().toISOString()
  };

  const { error: upsertError } = await supabase
    .from('players')
    .upsert(playerInformation, { 
      onConflict: 'player_id,tournament_id',
      ignoreDuplicates: false 
    });

  if (upsertError) {
    console.error(`❌ Error upserting player ${playerInformation.name} (${playerInformation.id}):`, upsertError);
    return null;
  } else {
    console.log(`✅ Successfully upserted player: ${playerInformation.name}`);
    return newPlayerId;
  }
}


async function saveMatchJson(supabase, match, apiData) {
  try {
    const { error } = await supabase
      .from('match_json_archive')
      .insert([
        {
          match_id: match.id,
          source: 'cricapi',
          snapshot_type: 'post_match',
          payload: apiData
        }
      ]);

    if (error) {
      // Catch unique violation (duplicate insert)
      if (error.code === '23505') {
        console.log(`ℹ️ JSON archive already exists for match ${match.id}, skipping insert.`);
      } else {
        console.error(`❌ Failed to archive JSON for match ${match.id}:`, error);
      }
    } else {
      console.log(`✅ JSON archive saved for match ${match.id}`);
    }
  } catch (err) {
    console.error(`💥 Unexpected error archiving match ${match.id}:`, err);
  }
}

// Export the function for GitHub Actions
module.exports = syncMatchData;

// If running directly (for testing)
if (require.main === module) {
  syncMatchData()
    .then(() => {
      console.log('✅ Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Script failed:', error);
      process.exit(1);
    });
}