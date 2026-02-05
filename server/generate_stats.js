/*
  Fantasy Cricket Stats Generator
  
  Usage:
  1. Ensure dependencies are installed: npm install @supabase/supabase-js dotenv
  2. Run: node scripts/generate_stats.js
  3. Open 'fantasy_stats.html'
*/

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Try to resolve Supabase credentials from various common env var names
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: Supabase credentials not found.');
  console.error('Please ensure VITE_SUPABASE_URL and VITE_SUPABASE_SERVICE_ROLE_KEY are set in your .env file.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('Connecting to Supabase...');

  // 1. Find the active tournament
  const { data: tournament, error: tError } = await supabase
    .from('tournaments')
    .select('id, name')
    .in('status', 'upcoming')
    .limit(1)
    .maybeSingle();

  if (tError) {
    console.error('Error fetching tournament:', tError.message);
    return;
  }

  if (!tournament) {
    console.error('No active (upcoming or in progress) tournament found.');
    return;
  }

  console.log(`Fetching data for tournament: ${tournament.name} (${tournament.id})`);

  // 2. Fetch all teams, users, and players for this tournament
  // We use a deep select to get the user info and the players (via team_players -> squads)
  const { data: teams, error: teamsError } = await supabase
    .from('teams')
    .select(`
      id,
      team_name,
      users (username),
      team_players (
        is_captain,
        squads (
          id,
          name,
          team_name,
          role
        )
      )
    `)
    .eq('tournament_id', tournament.id);

  if (teamsError) {
    console.error('Error fetching teams:', teamsError.message);
    return;
  }

  console.log(`Found ${teams.length} user teams. Processing stats...`);

  // 3. Process Data
  const playerPicks = {};
  const captainPicks = {};
  const realTeamPicks = {}; // Counts for real-world teams (e.g., "India", "Australia")
  const userTeamsList = [];

  teams.forEach(team => {
    const username = team.users?.username || 'Unknown User';
    const userTeamName = team.team_name || 'Unnamed Team';
    
    const squadList = [];
    let captainName = 'None';

    if (team.team_players && Array.isArray(team.team_players)) {
      team.team_players.forEach(tp => {
        const player = tp.squads;
        if (!player) return; // Skip if player record missing

        const playerName = player.name;
        const realTeam = player.team_name || 'Unknown Team';

        // Track Stats
        playerPicks[playerName] = (playerPicks[playerName] || 0) + 1;
        realTeamPicks[realTeam] = (realTeamPicks[realTeam] || 0) + 1;

        if (tp.is_captain) {
          captainName = playerName;
          captainPicks[playerName] = (captainPicks[playerName] || 0) + 1;
          squadList.push(`<strong>${playerName} (C)</strong>`);
        } else {
          squadList.push(playerName);
        }
      });
    }

    userTeamsList.push({
      username,
      userTeamName,
      captain: captainName,
      players: squadList.sort().join(', ')
    });
  });

  // Sort Aggregates
  const sortedPlayers = Object.entries(playerPicks).sort((a, b) => b[1] - a[1]);
  const sortedCaptains = Object.entries(captainPicks).sort((a, b) => b[1] - a[1]);
  const sortedRealTeams = Object.entries(realTeamPicks).sort((a, b) => b[1] - a[1]);

  // 4. Generate HTML
  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Fantasy Stats - ${tournament.name}</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 20px; background-color: #f4f4f9; color: #333; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
        h1 { border-bottom: 2px solid #eee; padding-bottom: 10px; margin-bottom: 30px; }
        h2 { color: #2c3e50; margin-top: 40px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px; }
        th, td { padding: 12px 15px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #f8f9fa; font-weight: 600; color: #555; }
        tr:hover { background-color: #f1f1f1; }
        .rank-col { width: 60px; text-align: center; color: #888; }
        strong { color: #d35400; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Tournament Report: ${tournament.name}</h1>
        <p>Generated on: ${new Date().toLocaleString()}</p>

        <h2>Most Selected Players</h2>
        <table>
            <thead><tr><th class="rank-col">#</th><th>Player Name</th><th>Selections</th></tr></thead>
            <tbody>
                ${sortedPlayers.map(([name, count], i) => `<tr><td class="rank-col">${i + 1}</td><td>${name}</td><td>${count}</td></tr>`).join('')}
            </tbody>
        </table>

        <h2>Most Selected Captains</h2>
        <table>
            <thead><tr><th class="rank-col">#</th><th>Player Name</th><th>Captain Picks</th></tr></thead>
            <tbody>
                ${sortedCaptains.map(([name, count], i) => `<tr><td class="rank-col">${i + 1}</td><td>${name}</td><td>${count}</td></tr>`).join('')}
            </tbody>
        </table>

        <h2>Most Popular Teams (Player Origin)</h2>
        <table>
            <thead><tr><th class="rank-col">#</th><th>Team / Country</th><th>Total Players Selected</th></tr></thead>
            <tbody>
                ${sortedRealTeams.map(([name, count], i) => `<tr><td class="rank-col">${i + 1}</td><td>${name}</td><td>${count}</td></tr>`).join('')}
            </tbody>
        </table>

        <h2>User Teams Overview</h2>
        <table>
            <thead><tr><th>Username</th><th>Team Name</th><th>Captain</th><th>Full Squad</th></tr></thead>
            <tbody>
                ${userTeamsList.map(t => `<tr><td>${t.username}</td><td>${t.userTeamName}</td><td>${t.captain}</td><td>${t.players}</td></tr>`).join('')}
            </tbody>
        </table>
    </div>
</body>
</html>`;

  const outputPath = path.join(process.cwd(), 'fantasy_stats.html');
  fs.writeFileSync(outputPath, htmlContent);
  
  console.log(`Success! Stats saved to: ${outputPath}`);
}

main().catch(err => console.error('Unexpected error:', err));
