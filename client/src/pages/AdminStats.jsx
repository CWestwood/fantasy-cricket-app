import React, { useEffect, useState } from 'react';
import { supabase } from '../utils/supabaseClient';

const AdminStats = () => {
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [tournamentName, setTournamentName] = useState('');
  const [stats, setStats] = useState({
    players: [],
    captains: [],
    teams: [],
    userTeams: [],
    substitutions: []
  });

  useEffect(() => {
    const fetchAdminStats = async () => {
      try {
        // 1. Check Authentication & Admin Role
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          setLoading(false);
          return;
        }

        // Verify 'admin' role in the public users table
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('role_level')
          .eq('id', user.id)
          .single();

        if (userError || userData?.role_level !== 'admin') {
          console.warn('User is not admin or error fetching role');
          setLoading(false);
          return;
        }

        setAuthorized(true);

        // 2. Fetch Active Tournament
        const { data: tournament, error: tError } = await supabase
          .from('tournaments')
          .select('id, name')
          .in('status', ['upcoming', 'in progress'])
          .limit(1)
          .maybeSingle();

        if (tError || !tournament) {
          console.error('No active tournament found');
          setLoading(false);
          return;
        }

        setTournamentName(tournament.name);

        // 4.5. Fetch stage names for lookup
        const { data: stagesData } = await supabase
          .from('tournament_stages')
          .select('id, stage_name')
          .eq('tournament_id', tournament.id);
        
        const stageIdToName = {};
        if (stagesData) {
          stagesData.forEach(s => {
            stageIdToName[s.id] = s.stage_name;
          });
        }

        // 3. Fetch Teams & Players
        const { data: teams, error: teamsError } = await supabase
          .from('teams')
          .select(`
            id,
            team_name,
            stage_id,
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
          .eq('tournament_id', tournament.id)
          .eq('stage_id', stageIdToName["Super8s and Knockouts"]); // Only fetch teams from the active stage

        if (teamsError) throw teamsError;

        // 4. Fetch Substitutions
        const { data: subsData, error: subsError } = await supabase
          .from('substitutions')
          .select(`
            id,
            requested_at,
            status,
            stage_id,
            teams (team_name, users (username)),
            player_out:squads!player_out_id (name, role),
            player_in:squads!player_in_id (name, role)
          `)
          .eq('tournament_id', tournament.id)
          .order('requested_at', { ascending: false });

        if (subsError) console.error('Error fetching substitutions:', subsError);

        

        // 5. Process Stats (Logic ported from script)
        const playerPicks = {};
        const captainPicks = {};
        const realTeamPicks = {};
        const userTeamsList = [];

        teams.forEach(team => {
          const username = team.users?.username || 'Unknown User';
          const userTeamName = team.team_name || 'Unnamed Team';
          
          const stage = team.stage_id ? stageIdToName[team.stage_id] : '-';
          const squadNames = [];
          let captainName = 'None';

          if (team.team_players && Array.isArray(team.team_players)) {
            team.team_players.forEach(tp => {
              const player = tp.squads;
              if (!player) return;

              const playerName = player.name;
              const realTeam = player.team_name || 'Unknown Team';

              // Counts
              playerPicks[playerName] = (playerPicks[playerName] || 0) + 1;
              realTeamPicks[realTeam] = (realTeamPicks[realTeam] || 0) + 1;

              if (tp.is_captain) {
                captainName = playerName;
                captainPicks[playerName] = (captainPicks[playerName] || 0) + 1;
                squadNames.push(`${playerName} (C)`);
              } else {
                squadNames.push(playerName);
              }
            });
          }

          userTeamsList.push({
            username,
            userTeamName,
            captain: captainName,
            stageName: stage,
            players: squadNames.sort().join(', ')
          });
        });

        // Map substitutions to include stage names
        const substitutionsWithStageNames = (subsData || []).map(sub => ({
          ...sub,
          stageName: sub.stage_id ? stageIdToName[sub.stage_id] : '-'
        }));

        setStats({
          players: Object.entries(playerPicks).sort((a, b) => b[1] - a[1]),
          captains: Object.entries(captainPicks).sort((a, b) => b[1] - a[1]),
          teams: Object.entries(realTeamPicks).sort((a, b) => b[1] - a[1]),
          userTeams: userTeamsList,
          substitutions: substitutionsWithStageNames
        });

      } catch (error) {
        console.error('Error in AdminStats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAdminStats();
  }, []);

  if (loading) return <div className="min-h-screen bg-dark-500 flex items-center justify-center text-white">Loading Admin Stats...</div>;
  if (!authorized) return <div className="p-10 text-center text-red-600 font-bold">Access Denied: Admins Only</div>;

  return (
    <div className="max-w-7xl mx-auto p-6 bg-white shadow-lg rounded-lg my-10">
      <h1 className="text-3xl font-bold mb-2 text-gray-800">Tournament Report: {tournamentName}</h1>
      <p className="text-gray-500 mb-8">Generated: {new Date().toLocaleString()}</p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 mb-10">
        {/* Most Selected Players */}
        <div>
          <h2 className="text-xl font-semibold mb-4 text-blue-800">Most Selected Players</h2>
          <div className="overflow-auto max-h-96 border rounded">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-100 sticky top-0">
                <tr><th className="p-3 border-b">#</th><th className="p-3 border-b">Player</th><th className="p-3 border-b">Picks</th></tr>
              </thead>
              <tbody>
                {stats.players.map(([name, count], i) => (
                  <tr key={name} className="hover:bg-gray-50 border-b"><td className="p-3 text-gray-500">{i + 1}</td><td className="p-3">{name}</td><td className="p-3 font-semibold">{count}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Most Selected Captains */}
        <div>
          <h2 className="text-xl font-semibold mb-4 text-blue-800">Most Selected Captains</h2>
          <div className="overflow-auto max-h-96 border rounded">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-100 sticky top-0">
                <tr><th className="p-3 border-b">#</th><th className="p-3 border-b">Player</th><th className="p-3 border-b">Captain Picks</th></tr>
              </thead>
              <tbody>
                {stats.captains.map(([name, count], i) => (
                  <tr key={name} className="hover:bg-gray-50 border-b"><td className="p-3 text-gray-500">{i + 1}</td><td className="p-3">{name}</td><td className="p-3 font-semibold">{count}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Most Popular Teams */}
        <div>
          <h2 className="text-xl font-semibold mb-4 text-blue-800">Team Popularity</h2>
          <div className="overflow-auto max-h-96 border rounded">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-100 sticky top-0">
                <tr><th className="p-3 border-b">#</th><th className="p-3 border-b">Team</th><th className="p-3 border-b">Selections</th></tr>
              </thead>
              <tbody>
                {stats.teams.map(([name, count], i) => (
                  <tr key={name} className="hover:bg-gray-50 border-b"><td className="p-3 text-gray-500">{i + 1}</td><td className="p-3">{name}</td><td className="p-3 font-semibold">{count}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Substitutions Log */}
      <div className="mb-10">
        <h2 className="text-xl font-semibold mb-4 text-blue-800">Substitutions Log</h2>
        <div className="overflow-auto max-h-96 border rounded">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-100 sticky top-0">
              <tr>
                <th className="p-3 border-b">Time</th>
                <th className="p-3 border-b">Status</th>
                <th className="p-3 border-b">Stage</th>
                <th className="p-3 border-b">User / Team</th>
                <th className="p-3 border-b">Out</th>
                <th className="p-3 border-b">In</th>
              </tr>
            </thead>
            <tbody>
              {stats.substitutions.length === 0 ? (
                <tr><td colSpan="4" className="p-3 text-center text-gray-500">No substitutions made yet.</td></tr>
              ) : (
                stats.substitutions.map((sub) => (
                  <tr key={sub.id} className="hover:bg-gray-50 border-b">
                    <td className="p-3 text-gray-500 text-sm">{new Date(sub.requested_at).toLocaleString()}</td>
                    <td className="p-3"> {sub.status === 'pending' ? <span className="text-orange-600 font-semibold">[PENDING]</span> : null}</td>
                    <td className="p-3 text-sm text-gray-600">{sub.stageName}</td>
                    <td className="p-3">
                      <div className="font-medium">{sub.teams?.users?.username || 'Unknown'}</div>
                      <div className="text-xs text-gray-500">{sub.teams?.team_name}</div>
                    </td>
                    <td className="p-3 text-red-600">
                      {sub.player_out?.name} <span className="text-xs text-gray-400">({sub.player_out?.role})</span>
                    </td>
                    <td className="p-3 text-green-600">
                      {sub.player_in?.name} <span className="text-xs text-gray-400">({sub.player_in?.role})</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* User Teams Detail */}
      <div>
        <h2 className="text-xl font-semibold mb-4 text-blue-800">User Teams Overview</h2>
        <div className="overflow-auto border rounded">
          <table className="w-full text-left border-collapse text-sm">
            <thead className="bg-gray-100">
              <tr><th className="p-3 border-b">Username</th><th className="p-3 border-b">Team Name</th><th className="p-3 border-b">Stage</th><th className="p-3 border-b">Captain</th><th className="p-3 border-b">Squad</th></tr>
            </thead>
            <tbody>
              {stats.userTeams.map((t, i) => (
                <tr key={i} className="hover:bg-gray-50 border-b">
                  <td className="p-3 font-medium">{t.username}</td>
                  <td className="p-3">{t.userTeamName}</td>
                  <td className="p-3 text-gray-500">{t.stageName}</td>
                  <td className="p-3 text-orange-700 font-medium">{t.captain}</td>
                  <td className="p-3 text-gray-600">{t.players}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminStats;
