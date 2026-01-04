const { createClient } = require('@supabase/supabase-js');

// --- Setup Supabase client
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function applyBonuses() {
  console.log("Checking for pending bonus updates...");

  // 1️⃣ Get pending bonus rows
  const { data: bonuses, error: fetchError } = await supabase
    .from('bonus_potm_table')
    .select('*')
    .eq('captured', false)
    .not('player_id', 'is', null);

  if (fetchError) {
    console.error("Failed to fetch bonuses:", fetchError);
    return;
  }
  if (!bonuses.length) {
    console.log("No pending bonuses found.");
    return;
  }

  console.log(`Found ${bonuses.length} pending bonuses to apply...`);

  for (const bonus of bonuses) {
    try {
      console.log(`Processing bonus for match ${bonus.match_id}, player ${bonus.player_id}`);

      // Update match_data 
      const { error: updateMatchError } = await supabase
        .from('match_data')
        .update({
          potm: bonus.potm,
          hattrick: bonus.hattrick
        })
        .eq('match_id', bonus.match_id)
        .eq('player_id', bonus.player_id);

      if (updateMatchError) {
        console.error(`Failed to update match_data for match ${bonus.match_id}:`, updateMatchError);
        continue;
      }

      // Recalculate points for this player in this match
      const { data: pointsConfig, error: configError } = await supabase
        .from('points_config')
        .select('*')
        .eq('tournament_id', performance.tournament_id) 
        .single();

      let bonusPoints = 0;
      bonusPoints += bonus.potm ? (pointsConfig.bonus_potm || 0) : 0; 
      bonusPoints += (bonus.hattrick || 0) * (pointsConfig.bonus_hattrick || 0); 

      if (bonusPoints > 0) {
  // Fetch current scores for this player in the match
  const { data: current, error: fetchError } = await supabase
    .from('scores')
    .select('batting, bowling, fielding, bonus')
    .eq('match_id', bonus.match_id)
    .eq('player_id', bonus.player_id)
    .single();

  if (fetchError) {
    console.error(`Failed to fetch current scores for match ${bonus.match_id}, player ${bonus.player_id}:`, fetchError);
    continue;
  }

  // Compute new total
  const total =
    (current.batting || 0) +
    (current.bowling || 0) +
    (current.fielding || 0) +
    bonusPoints;

  // Update bonus and total
  const { error: updateError } = await supabase
    .from('scores')
    .update({
      bonus: bonusPoints,
      total: total,
    })
    .eq('match_id', bonus.match_id)
    .eq('player_id', bonus.player_id);

  if (updateError) {
    console.error(`Failed to update points for match ${bonus.match_id}, player ${bonus.player_id}:`, updateError);
    continue;
  }
}


      // Mark bonus as captured
      const { error: captureError } = await supabase
        .from('bonus_potm_table')
        .update({ captured: true })
        .eq('id', bonus.id);

      if (captureError) {
        console.error(`Failed to mark bonus as captured for row ${bonus.id}:`, captureError);
        continue;
      }

      console.log(`Bonus applied for player ${bonus.player_id} in match ${bonus.match_id}`);
    } catch (err) {
      console.error(`Unexpected error processing bonus row ${bonus.id}:`, err);
    }
  }

  console.log("Bonus sync complete.");
}

applyBonuses();