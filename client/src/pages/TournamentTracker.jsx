import React, { useEffect, useState, useMemo } from "react";
import { supabase } from "../utils/supabaseClient";
import { useTeam } from "../context/TeamContext";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { TEAM_HEX_COLORS } from "../constants/colors";
import { TEAM_ABBREVIATIONS } from "../constants/abbreviations";

export default function TournamentTracker() {
  const { tournamentId, teamName, loading: teamLoading } = useTeam();
  const [loading, setLoading] = useState(true);
  const [historyData, setHistoryData] = useState([]);
  const [matches, setMatches] = useState([]);
  const [allTeams, setAllTeams] = useState([]);
  const [selectedTeamName, setSelectedTeamName] = useState(null);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState(null);

  useEffect(() => {
    if (!tournamentId || teamLoading) return;

    const fetchMetadata = async () => {
      setLoading(true);
      try {
        // 1. Fetch Matches
        const { data: matchesData, error: matchesError } = await supabase
          .from("matches")
          .select("id, match_name, match_date, match_time, team1, team2")
          .eq("tournament_id", tournamentId)
          .order("match_date", { ascending: true })
          .order("match_time", { ascending: true });

        if (matchesError) throw matchesError;
        setMatches(matchesData || []);

        // 2. Fetch Teams List
        const { data: teamsData, error: teamsError } = await supabase
          .from("teams")
          .select("team_name")
          .eq("tournament_id", tournamentId)
          .order("team_name");

        if (teamsError) throw teamsError;

        const uniqueNames = [...new Set((teamsData || []).map(t => t.team_name))];
        const uniqueTeams = uniqueNames.map(name => ({ name }));
        setAllTeams(uniqueTeams);

        // Set default selection
        if (teamName && uniqueTeams.some(t => t.name === teamName)) {
          setSelectedTeamName(teamName);
        } else if (uniqueTeams.length > 0) {
          setSelectedTeamName(uniqueTeams[0].name);
        }

      } catch (err) {
        console.error("Error fetching tracker metadata:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchMetadata();
  }, [tournamentId, teamName, teamLoading]);

  // Fetch history specifically for the selected team
  useEffect(() => {
    if (!tournamentId || !selectedTeamName) return;

    const fetchHistory = async () => {
      setIsHistoryLoading(true);
      try {
        // First get the user_id for this team name
        const { data: teamData } = await supabase
          .from("teams")
          .select("user_id")
          .eq("tournament_id", tournamentId)
          .eq("team_name", selectedTeamName)
          .limit(1)
          .single();

        if (!teamData) return;

        const { data: history, error: historyError } = await supabase
          .from("tournament_leaderboard_history")
          .select("*")
          .eq("tournament_id", tournamentId)
          .eq("user_id", teamData.user_id)  // ← stable identity
          .is("stage_id", null)              // ← combined rows only
          .neq("total", 0);

        if (historyError) throw historyError;
        setHistoryData(history || []);
      } catch (err) {
        console.error("Error fetching team history:", err);
      } finally {
        setIsHistoryLoading(false);
      }
    };

    fetchHistory();
  }, [tournamentId, selectedTeamName]);

  // Process data for the selected team
  const teamStats = useMemo(() => {
    if (!selectedTeamName || !matches.length || !historyData.length) return null;

    // Filter history for selected team
    const teamHistory = historyData.filter(h => h.team_name === selectedTeamName);
    if (!teamHistory.length) return null;

    // Find the last match that has history data to limit the x-axis
    const matchIdsInHistory = new Set(historyData.map(h => h.match_id));
    let lastMatchIndex = -1;
    matches.forEach((m, i) => {
      if (matchIdsInHistory.has(m.id)) lastMatchIndex = i;
    });

    const displayMatches = lastMatchIndex >= 0 ? matches.slice(0, lastMatchIndex + 1) : [];

    let previousTotal = 0;
    let maxMatchPoints = 0;
    let bestRank = 999999;

    const data = displayMatches.map((match, index) => {
      const entry = teamHistory.find(h => h.match_id === match.id);
      
      const currentTotal = entry ? Number(entry.total) : previousTotal;
      const rank = entry ? entry.rank_position : null;

      const dateStr = new Date(match.match_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

      const t1 = match.team1;
      const t2 = match.team2;
      const abbr1 = TEAM_ABBREVIATIONS[t1] || t1;
      const abbr2 = TEAM_ABBREVIATIONS[t2] || t2;
      const shortMatchName = (t1 && t2) ? `${abbr1} vs ${abbr2}` : match.match_name;
      
      // Calculate points scored in this match (delta)
      const matchPoints = entry 
        ? Math.max(0, currentTotal - previousTotal)  // guard against stage boundary artifacts
        : 0;
      
      if (matchPoints > maxMatchPoints) maxMatchPoints = matchPoints;
      if (rank && rank < bestRank) bestRank = rank;

      previousTotal = currentTotal;

      return {
        name: dateStr,
        matchName: shortMatchName,
        date: match.match_date,
        rank: rank,
        totalPoints: currentTotal,
        matchPoints: matchPoints
      };
    });

    const currentRank = data.length > 0 ? data[data.length - 1].rank : '-';

    return {
      data,
      maxMatchPoints,
      bestRank: bestRank === 999999 ? '-' : bestRank,
      currentRank
    };
  }, [selectedTeamName, matches, historyData]);

  const teamColor = TEAM_HEX_COLORS[selectedTeamName || "Team"] || "#3b82f6";

  if (loading) return <div className="min-h-screen bg-dark-500 flex items-center justify-center text-white">Loading Tracker...</div>;

  return (
    <div className="min-h-screen bg-dark-500 text-white py-6">
      <div className="max-w-6xl mx-auto px-4 space-y-6">
        <div className="bg-card-light rounded-2xl shadow-card p-4 sm:p-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-primary-500 mb-2">Tournament Tracker</h1>
          <p className="text-sm text-gray-400">Track team progress throughout the tournament.</p>
        </div>

        {/* Team Selector */}
        <div className="bg-card-light rounded-2xl text-center shadow-card p-4 space-y-4">
          <select 
            value={selectedTeamName || ""} 
            onChange={async (e) => {
              const name = e.target.value;
              setSelectedTeamName(name);
              // user_id will be resolved in the fetchHistory effect
            }}
            className="w-full md:w-1/2 bg-dark-500 text-white  text-center border border-gray-700 rounded-lg px-3 py-2 focus:outline-none focus:border-primary-500"
          >
            {allTeams.map(t => (
              <option key={t.name} value={t.name}>{t.name}</option>
            ))}
          </select>
        </div>

        {teamStats && (
          <div className="space-y-6">
            {/* Summary Table */}
            <div className="bg-card-light rounded-2xl shadow-card p-4">
              <h2 className="text-lg font-bold text-white mb-4 border-b border-gray-700 pb-2">Performance Summary</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
                <div className="bg-dark-500 p-4 rounded-lg">
                  <p className="text-xs text-gray-400 uppercase">Current Rank</p>
                  <p className="text-2xl font-bold text-primary-500">#{teamStats.currentRank}</p>
                </div>
                <div className="bg-dark-500 p-4 rounded-lg">
                  <p className="text-xs text-gray-400 uppercase">Highest Rank</p>
                  <p className="text-2xl font-bold text-green-400">#{teamStats.bestRank}</p>
                </div>
                <div className="bg-dark-500 p-4 rounded-lg">
                  <p className="text-xs text-gray-400 uppercase">Highest Match Points</p>
                  <p className="text-2xl font-bold text-yellow-400">{teamStats.maxMatchPoints}</p>
                </div>
              </div>
            </div>

            {/* Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Rank Chart */}
              <div className="bg-card-light rounded-2xl shadow-card p-4 h-80 flex flex-col relative">
                {isHistoryLoading && <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10 rounded-2xl">Loading...</div>}
                <h3 className="text-sm font-bold text-gray-300 mb-2 text-center">Rank History</h3>
                <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={teamStats.data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="name" stroke="#9ca3af" tick={{fontSize: 10}} />
                    <YAxis stroke="#9ca3af" tick={{fontSize: 10}} reversed={true} domain={['auto', 'auto']} width={30}/>
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#fff' }}
                      itemStyle={{ color: '#fff' }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="rank" 
                      stroke="#10b981" 
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
                </div>
              </div>

              {/* Total Points Chart */}
              <div className="bg-card-light rounded-2xl shadow-card p-4 h-80 flex flex-col relative">
                {isHistoryLoading && <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10 rounded-2xl">Loading...</div>}
                <h3 className="text-sm font-bold text-gray-300 mb-2 text-center">Points Progression</h3>
                <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={teamStats.data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="name" stroke="#9ca3af" tick={{fontSize: 10}} />
                    <YAxis stroke="#9ca3af" tick={{fontSize: 10}} domain={['auto', 'auto']} width={30} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#fff' }}
                      itemStyle={{ color: '#fff' }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="totalPoints" 
                      stroke={teamColor} 
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Detailed Table */}
            <div className="bg-card-light rounded-2xl shadow-card p-4 sm:p-6 overflow-hidden">
              <h3 className="text-m font-bold text-white mb-4">Match Breakdown</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead>
                    <tr className="text-gray-400 border-b border-gray-700">
                      <th className="pb-3 px-2">Match</th>
                      <th className="pb-3 px-2">Date</th>
                      <th className="pb-3 px-2 text-right">Points</th>
                      <th className="pb-3 px-2 text-right">Total Pts</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {teamStats.data.map((row) => (
                      <tr key={row.matchName} className="hover:bg-dark-600 transition-colors">
                        <td className="py-3 px-2 font-medium text-white">{row.matchName}</td>
                        <td className="py-3 px-2 text-gray-400">{row.name}</td>
                        <td className="py-3 px-2 text-right">
                          <span className="text-green-400 font-bold">{row.matchPoints}</span>
                        </td>
                        <td className="py-3 px-2 text-right font-bold text-white">{row.totalPoints}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
