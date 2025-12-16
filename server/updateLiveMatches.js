// scripts/updateLiveMatches.js
const { createClient } = require('@supabase/supabase-js');

async function updateLiveMatches() {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const cricketApiKey = process.env.CRICKET_API_KEY;

    if (!supabaseUrl || !supabaseKey || !cricketApiKey) {
      throw new Error('Missing required environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1️⃣ Get today’s matches from Supabase
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    console.log(`📅 Checking matches scheduled for today: ${today}`);

    const { data: matches, error: matchesError } = await supabase
      .from('matches')
      .select('id, match_name, currently_live, status')
      .eq('match_date', today); // adjust column if different

    if (matchesError) throw matchesError;
    if (!matches || matches.length === 0) {
      console.log('ℹ️ No matches found for today.');
      return;
    }

    console.log(`✅ Found ${matches.length} matches scheduled today.`);

    // 2️⃣ Fetch API live data
    const apiUrl = `https://api.cricapi.com/v1/currentMatches?apikey=${cricketApiKey}`;
    const response = await fetch(apiUrl);

    if (!response.ok) {
      throw new Error(`Cricket API failed: ${response.status} ${response.statusText}`);
    }

    const apiData = await response.json();
    const liveMatches = apiData.data || [];

    console.log(`📡 API returned ${liveMatches.length} matches`);

    // 3️⃣ Update Supabase matches
    for (const match of matches) {
      const apiMatch = liveMatches.find(m => m.id === match.id);

      if (!apiMatch) {
        // If match is marked live in DB but not in API → turn off
        if (match.currently_live) {
          console.log(`🔄 Match ${match.match_name} not in API → marking not live`);
          await supabase
            .from('matches')
            .update({ currently_live: false })
            .eq('id', match.id);
        }
        continue;
      }

      // --- Now we have a match from API ---
      const isLive =
        apiMatch.matchStarted && !apiMatch.matchEnded ;

      const isCompleted =
        apiMatch.matchEnded

      let newStatus = apiMatch.status;
      let newLiveFlag = isLive;

      // If completed, override
      if (isCompleted) {
        newStatus = 'Completed';
        newLiveFlag = false;
      }

      if (match.currently_live !== newLiveFlag) {
        console.log(`🔄 Updating match ${match.match_name}: live=${newLiveFlag}, status=${newStatus}`);
        await supabase
          .from('matches')
          .update({
            currently_live: newLiveFlag,
            status: newStatus
          })
          .eq('id', match.id);
      } else {
        console.log(`✅ No change for match ${match.match_name}`);
      }
    }

    console.log('🎉 Match status sync finished.');

  } catch (error) {
    console.error('❌ Error in updateLiveMatches:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  updateLiveMatches();
}

module.exports = updateLiveMatches;