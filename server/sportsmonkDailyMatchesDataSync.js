const { createClient } = require('@supabase/supabase-js');

async function sportsmonkDailyMatchesDataSync() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const sportsmonkApiKey = process.env.SPORTSMONKS_API_KEY;

  if (!supabaseUrl || !supabaseKey || !sportsmonkApiKey) {
    throw new Error('Missing required environment variables');
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  console.log('Supabase client initialized successfully for Sportsmonk sync');

  const today = new Date().toISOString().split('T')[0];

  try {
    const { data: matches, error: matchesError } = await supabase
      .from('matches')
      .select('id, tournament_id, sportsmonk_id, match_name, status')
      .eq('match_date', today)
      .neq('status', 'Finished');

    if (matchesError) {
      console.error('Error fetching matches:', matchesError);
      throw matchesError;
    }

    console.log(`Found ${matches?.length || 0} matches to process from Sportsmonk`);

    if (!matches || matches.length === 0) {
      console.log('No matches found for today that are not finished');
      return;
    }

    for (const match of matches) {
      console.log(
        `Processing match: ${match.match_name} - Sportsmonk ID: ${match.sportsmonk_id}`
      );

      try {
        // FIX: Use actual tournament IDs from the database
        const apiUrl = `https://cricket.sportmonks.com/api/v2.0/fixtures/${match.sportsmonk_id}?api_token=${sportsmonkApiKey}`;

        const response = await fetch(apiUrl);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }

        const apiData = await response.json();
        
        if (!apiData || !apiData.data || apiData.data.length === 0) {
          console.log(
            `No match data found for match Sportsmonk ID: ${match.sportsmonk_id}`
          );
          continue;
        }

        try {           
            const matchStatus = apiData.data.status && apiData.data.status !== 'NS' 
              ? (apiData.data.winner_team_id ? 'Finished' : 'live')
              : 'live';

            const matchRecord = {
              id: match.id,
              sportsmonk_id: match.sportsmonk_id,          
              status: matchStatus,
              currently_live: matchStatus === 'live' ? true : false,
              updated_at: new Date().toISOString()
            };

            const { error: upsertError } = await supabase.from('matches').upsert(matchRecord, {
              onConflict: 'sportsmonk_id'
            });

            if (upsertError) {
              console.error(`Error upserting match ${match.id}:`, upsertError);
              continue;
            }

            console.log(`Successfully upserted match: ${match.id}`);
                    
          } catch (matchError) {
            console.error(`Error processing match ${match.id}:`, matchError);
            continue;
          }
        } catch (error) {
          console.error(`Error fetching data for match ${match.id}:`, error);
          continue;
        }
      }

    console.log('Sportsmonk daily matches data synchronization completed successfully.');
  } catch (error) {
    console.error('Fatal error in sportsmonkDailyMatchesDataSync:', error);
    throw error;
  }
}

// Export the function for GitHub Actions
module.exports = sportsmonkDailyMatchesDataSync;

if (require.main === module) {
  sportsmonkDailyMatchesDataSync().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
  });
}
