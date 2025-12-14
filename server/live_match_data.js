const { createClient } = require('@supabase/supabase-js');

async function liveMatchData() {
  try {
    // Initialize Supabase client
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const cricketApiKey = process.env.CRICKET_API_KEY;

    if (!supabaseUrl || !supabaseKey || !cricketApiKey) {
      throw new Error('Missing required environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    console.log('✅ Supabase client initialized successfully');

    // Step 1: Query matches that need data capture
    console.log('🔍 Querying matches with status != "Match not started" and completed_and_captured = false...');
    
    const { data: matches, error: matchesError } = await supabase
      .from('matches')
      .select('id, tournament_id, match_name, type_match')
      .neq('status', 'Match not started')
      .eq('currently_live', true);

    if (matchesError) {
      console.error('❌ Error fetching matches:', matchesError);
      throw matchesError;
    }

    if (!matches || matches.length === 0) {
      console.log('ℹ️ No matches found that need data capture');
      return;
    }

    console.log(`✅ Found ${matches.length} matches to process`);

    // Step 2: Process each match
    for (const match of matches) {
      console.log(`\n🏏 Processing match: ${match.match_name} (ID: ${match.id})`);
      
      try {
        // Fetch match scorecard from Cricket API
        const apiUrl = `https://api.cricapi.com/v1/match_scorecard?apikey=${cricketApiKey}&id=${match.id}`;
        console.log(`📡 Fetching scorecard data from Cricket API for match ${match.id}...`);
        
        const response = await fetch(apiUrl);
        
        if (!response.ok) {
          console.error(`❌ Cricket API request failed for match ${match.id}: ${response.status} ${response.statusText}`);
          continue;
        }

        const apiData = await response.json();
        console.log(`✅ Successfully fetched scorecard data for ${match.type_match} match ${match.id}`);

        // Check if scorecard data exists
        if (!apiData.data || !apiData.data.scorecard || apiData.data.scorecard.length === 0) {
          console.log(`ℹ️ No scorecard data found for match ${match.id}`);
          continue;
        }

        // Determine match status
        const matchStatus = apiData.data.status && apiData.data.status !== 'Match not started' 
          ? (apiData.data.matchWinner ? 'completed' : 'live')
          : 'live';

        console.log(`📊 Processing scorecard data for match ${match.match_name} (Status: ${matchStatus})`);

        // Step 3: Process each innings
        for (const innings of apiData.data.scorecard) {
          console.log(`⚾ Processing innings data...`);

          // Process batting data
          if (innings.batting && innings.batting.length > 0) {
            for (const battingEntry of innings.batting) {
              if (battingEntry.batsman && battingEntry.batsman.id) {
                try {
                  // Get player_id from players table using the Cricket API player ID
                  const { data: playerData, error: playerError } = await supabase
                    .from('players')
                    .select('id')
                    .eq('player_id', battingEntry.batsman.id)
                    .eq('tournament_id', match.tournament_id)
                    .single();

                  if (playerError || !playerData) {
                    console.log(`⚠️ Player not found in players table: ${battingEntry.batsman.name} (${battingEntry.batsman.id})`);
                    continue;
                  }

                  const matchData = {
                    match_id: match.id,
                    tournament_id: match.tournament_id,
                    match_type: match.type_match,
                    player_id: playerData.id,
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

                  // Upsert batting data
                  const { error: upsertError } = await supabase
                    .from('live_match_data')
                    .upsert(matchData, { 
                      onConflict: 'match_id,player_id',
                      ignoreDuplicates: false 
                    });

                  if (upsertError) {
                    console.error(`❌ Error upserting batting data for ${battingEntry.batsman.name}:`, upsertError);
                  } else {
                    console.log(`✅ Successfully upserted batting data: ${battingEntry.batsman.name} - ${battingEntry.r} runs`);
                  }

                } catch (battingError) {
                  console.error(`❌ Error processing batting data for ${battingEntry.batsman.name}:`, battingError);
                }
              }
            }
          }

          // Process bowling data
          if (innings.bowling && innings.bowling.length > 0) {
            for (const bowlingEntry of innings.bowling) {
              if (bowlingEntry.bowler && bowlingEntry.bowler.id) {
                try {
                  // Get player_id from players table using the Cricket API player ID
                  const { data: playerData, error: playerError } = await supabase
                    .from('players')
                    .select('id')
                    .eq('player_id', bowlingEntry.bowler.id)
                    .eq('tournament_id', match.tournament_id)
                    .single();

                  if (playerError || !playerData) {
                    console.log(`⚠️ Player not found in players table: ${bowlingEntry.bowler.name} (${bowlingEntry.bowler.id})`);
                    continue;
                  }

                 // Check if player already has batting data, update or create new entry
                  const { data: existingData, error: existingError } = await supabase
                    .from('live_match_data')
                    .select('*')
                    .eq('match_id', match.id)
                    .eq('player_id', playerData.id)
                    .single();

                  const noballs_wides = (bowlingEntry.nb || 0) + (bowlingEntry.wd || 0);
                  
                  let matchData;
                  if (existingData) {
                    // Update existing record with bowling data
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
                      match_status: matchStatus
                    };
                  } else {
                    // Create new record with only bowling data
                    matchData = {
                      match_id: match.id,
                      tournament_id: match.tournament_id,
                      match_type: match.type_match,
                      player_id: playerData.id,
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
                    .from('live_match_data')
                    .upsert(matchData, { 
                      onConflict: 'match_id,player_id',
                      ignoreDuplicates: false 
                    });

                  if (upsertError) {
                    console.error(`❌ Error upserting bowling data for ${bowlingEntry.bowler.name}:`, upsertError);
                  } else {
                    console.log(`✅ Successfully upserted bowling data: ${bowlingEntry.bowler.name} - ${bowlingEntry.w} wickets`);
                  }

                } catch (bowlingError) {
                  console.error(`❌ Error processing bowling data for ${bowlingEntry.bowler.name}:`, bowlingError);
                }
              }
            }
          }

          // Process fielding data
          if (innings.catching && innings.catching.length > 0) {
            for (const fieldingEntry of innings.catching) {
              if (fieldingEntry.catcher && fieldingEntry.catcher.id) {
                try {
                  // Get player_id from players table using the Cricket API player ID
                  const { data: playerData, error: playerError } = await supabase
                    .from('players')
                    .select('id')
                    .eq('player_id', fieldingEntry.catcher.id)
                    .eq('tournament_id', match.tournament_id)
                    .single();

                  if (playerError || !playerData) {
                    console.log(`⚠️ Player not found in players table: ${fieldingEntry.catcher.name} (${fieldingEntry.catcher.id})`);
                    continue;
                  }

                  // Check if player already has data, update or create new entry
                  const { data: existingData, error: existingError } = await supabase
                    .from('live_match_data')
                    .select('*')
                    .eq('match_id', match.id)
                    .eq('player_id', playerData.id)
                    .single();

                  let matchData;
                  if (existingData) {
                    // Update existing record with fielding data
                    matchData = {
                      ...existingData,
                      fielding_catches: fieldingEntry.catch || 0,
                      fielding_runouts: fieldingEntry.runout || 0,
                      fielding_stumpings: fieldingEntry.stumped || 0,
                      match_status: matchStatus
                    };
                  } else {
                    // Create new record with only fielding data
                    matchData = {
                      match_id: match.id,
                      tournament_id: match.tournament_id,
                      match_type: match.type_match,
                      player_id: playerData.id,
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
                    .from('live_match_data')
                    .upsert(matchData, { 
                      onConflict: 'match_id,player_id',
                      ignoreDuplicates: false 
                    });

                  if (upsertError) {
                    console.error(`❌ Error upserting fielding data for ${fieldingEntry.catcher.name}:`, upsertError);
                  } else {
                    console.log(`✅ Successfully upserted fielding data: ${fieldingEntry.catcher.name} - ${fieldingEntry.catch} catches`);
                  }

                } catch (fieldingError) {
                  console.error(`❌ Error processing fielding data for ${fieldingEntry.catcher.name}:`, fieldingError);
                }
              }
            }
          }
        }
        
       
      } catch (matchError) {
        console.error(`❌ Error processing match ${match.id}:`, matchError);
      }
    }

    console.log('\n🎉 Match data sync completed successfully');

  } catch (error) {
    console.error('❌ Fatal error in liveMatchData:', error);
    throw error;
  }
}

// Export the function for GitHub Actions
module.exports = liveMatchData;

// If running directly (for testing)
if (require.main === module) {
  liveMatchData()
    .then(() => {
      console.log('✅ Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Script failed:', error);
      process.exit(1);
    });
}