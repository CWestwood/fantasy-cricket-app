const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');

async function liveAllocatePoints() {
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

    // Step 1: Query performances that need points allocated
    console.log('🔍 Querying performances with status = "live" ....');
    
    const { data: performances, error: performanceError } = await supabase
      .from('live_match_data')
      .select('*')
      .eq('match_status', 'live');
      

    if (performanceError) {
      console.error('❌ Error fetching match data:', performanceError);
      throw performanceError;
    }

    if (!performances || performances.length === 0) {
      console.log('ℹ️ No players found that need points allocated');
      return;
    }

    console.log(`✅ Found ${performances.length} performances to process`);

    // Step 2: Process each performance
    for (const performance of performances) {
      console.log(`\n🎯 Processing performance for ${performance.player_name}`);
      
      // Get points config for this tournament
      const { data: pointsConfig, error: configError } = await supabase
        .from('points_config')
        .select('*')
        .eq('tournament_id', performance.tournament_id) 
        .single();

      if (configError) {
        console.error('❌ Error fetching points config:', configError);
        continue; 
      }

      if (!pointsConfig) {
        console.log('ℹ️ No points config found for this tournament');
        continue;
      }

      console.log('✅ Points config found for tournament');

      // Calculate derived values
      const runs = performance.batting_runs || 0;
      const ballsFaced = performance.batting_balls_faced || 0;
      const sixesHit = performance.batting_six || 0;
      const strikeRate = performance.batting_strike_rate || 0;
      const wickets = performance.bowling_wickets || 0;
      const overs = performance.bowling_overs || 0;
      const runsConced = performance.bowling_runs_conceded || 0;
      const noBallsWides = performance.bowling_noballs_wides || 0;
      const maidens = performance.bowling_maiden_overs || 0;
      const economyRate = performance.bowling_econ_rate || 0;
      const catches = performance.fielding_catches || 0;
      const runouts = performance.fielding_runouts || 0;
      const stumpings = performance.fielding_stumpings || 0;

      // Calculate derived boolean values
      const out = performance.batting_outcome !== null;
      const isDuck = runs === 0 && out === true; 
      const is30Plus = runs >= 30;
      const is50Plus = runs >= 50;
      const is100Plus = runs >= 100;
      const is200Plus = runs >= 200;
      const ishighRR = strikeRate >= 150 && ballsFaced >= 10;
      const islowRR = strikeRate <= 90 && ballsFaced >= 10;
      const ishighER = economyRate >= 9 && overs >= 2;
      const islowER = economyRate <= 7 && overs >= 2;
      const is3Wickets = wickets >= 3;
      const is5Wickets = wickets >= 5;
    
      // Calculate points per category
      let battingScore = 0; 
      battingScore += (runs || 0) * (pointsConfig.batting_runs || 0);
      battingScore += (sixesHit || 0) * (pointsConfig.batting_six || 0);
      battingScore += isDuck ? (pointsConfig.batting_duck || 0) : 0;
      battingScore += ishighRR ? (pointsConfig.batting_fastrr || 0) : 0;
      battingScore += islowRR ? (pointsConfig.batting_slowrr || 0) : 0;
      
      if (is200Plus) {
        battingScore += pointsConfig.batting_200 || 0;
      } else if (is100Plus) {
        battingScore += pointsConfig.batting_100 || 0;
      } else if (is50Plus) {
        battingScore += pointsConfig.batting_50 || 0;
      } else if (is30Plus) {
        battingScore += pointsConfig.batting_30 || 0;
      }    

      let bowlingScore = 0;
      bowlingScore += (wickets || 0) * (pointsConfig.bowling_wicket || 0);
      bowlingScore += (maidens || 0) * (pointsConfig.bowling_maiden || 0);
      bowlingScore += (noBallsWides || 0) * (pointsConfig.bowling_noballswides || 0); 
      bowlingScore += islowER ? (pointsConfig.bowling_lower || 0) : 0; 
      bowlingScore += ishighER ? (pointsConfig.bowling_higher || 0) : 0;
      
      if (is5Wickets) { // Fixed: was is5wickets
        bowlingScore += pointsConfig.bowling_5wickets || 0;
      } else if (is3Wickets) { 
        bowlingScore += pointsConfig.bowling_3wickets || 0; 
      }

      let fieldingScore = 0;
      fieldingScore += (catches || 0) * (pointsConfig.fielding_catch || 0);
      fieldingScore += (runouts || 0) * (pointsConfig.fielding_runout || 0);
      fieldingScore += (stumpings || 0) * (pointsConfig.fielding_stumping || 0);

      let bonusScore = 0;
      bonusScore += performance.bonus_potm ? (pointsConfig.bonus_potm || 0) : 0; // Fixed: missing : 0
      bonusScore += performance.bonus_hattrick ? (pointsConfig.bonus_hattrick || 0) : 0; // Fixed: missing : 0
      
      let totalScore = 0;
      totalScore += battingScore;
      totalScore += bowlingScore;
      totalScore += fieldingScore;
      totalScore += bonusScore;
      
      const pointsData = {
        id: uuidv4(),
        match_id: performance.match_id, 
        player_id: performance.player_id,
        player_name: performance.player_name,
        batting: battingScore,
        bowling: bowlingScore,
        fielding: fieldingScore,
        bonus: bonusScore,
        total: totalScore,
        updated_at: new Date().toISOString()
      };

      // Upsert score to database
      const { error: upsertError } = await supabase
        .from('live_scoring')
        .upsert(pointsData, { 
          onConflict: 'player_id,match_id',
          ignoreDuplicates: false 
        });

      if (upsertError) {
        console.error(`❌ Error upserting player ${performance.player_name} (${performance.id}):`, upsertError);
      } else {
        console.log(`✅ Successfully upserted player: ${performance.player_name} - ${performance.match_id}`);
        
        }
    }

    console.log('\n🎉 Points allocation completed successfully');

  } catch (error) {
    console.error('❌ Fatal error in liveAllocatePoints:', error);
    throw error;
  }
}

module.exports = liveAllocatePoints;

// If running directly (for testing)
if (require.main === module) {
  liveAllocatePoints()
    .then(() => {
      console.log('✅ Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Script failed:', error);
      process.exit(1);
    });
}