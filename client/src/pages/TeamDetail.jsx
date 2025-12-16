import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../utils/supabaseClient";
import { useTeam } from "../context/TeamContext";
import BatIcon from "../assets/icons/bat_white.svg";
import BallIcon from "../assets/icons/ball_white.svg";
import AllrounderIcon from "../assets/icons/allrounder_white.svg";
import WkglovesIcon from "../assets/icons/wkgloves_white.svg";

export default function TeamDetail() {
  const { teamId } = useParams();
  const { tournamentId } = useTeam();
  const navigate = useNavigate();
  const goToPlayerProfile = (event, playerId) => {
    event.stopPropagation();
    if (!playerId) return;
    navigate(`/player/${playerId}`);
  };
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [team, setTeam] = useState(null);
  const [players, setPlayers] = useState([]);
  const [expandedPlayer, setExpandedPlayer] = useState(null);
  const [username, setUsername] = useState(null);
  const [leaderboardPosition, setLeaderboardPosition] = useState(null);
  const [teamTotals, setTeamTotals] = useState({
    batting: 0,
    bowling: 0,
    fielding: 0,
    bonus: 0,
    total: 0,
  });

  // Map roles to their icons
  const roleIconMap = {
    batter: BatIcon,
    bowler: BallIcon,
    allrounder: AllrounderIcon,
    wicketkeeper: WkglovesIcon,
  };

  const getRoleIcon = (role) => {
    const normalizedRole = (role || "").toLowerCase();
    return roleIconMap[normalizedRole] || null;
  };

  useEffect(() => {
    if (!teamId) {
      setError("No team selected.");
      setLoading(false);
      return;
    }
    if (!tournamentId) {
      setError("No tournament selected.");
      setLoading(false);
      return;
    }
    fetchTeamDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, tournamentId]);

  async function fetchTeamDetail() {
    setError("");
    setLoading(true);
    try {
      // Fetch team info - filter by both id and tournament_id to get the right team
      const teamRes = await supabase
        .from("teams")
        .select("id, team_name, user_id, tournament_id")
        .eq("id", teamId)
        .eq("tournament_id", tournamentId)
        .single();

      console.debug("TeamDetail: team ->", teamRes);

      if (teamRes.error) {
        setError(`Team not found: ${teamRes.error.message}`);
        setTeam(null);
        setPlayers([]);
        setLoading(false);
        return;
      }

      setTeam(teamRes.data);

      // Fetch username from users table
      const { data: userData } = await supabase
        .from("public_user_profiles")
        .select("username")
        .eq("id", teamRes.data.user_id)
        .single();

      if (userData) {
        setUsername(userData.username);
      }

      // Fetch leaderboard position
      const { data: leaderboardData } = await supabase
        .from("tournament_leaderboard_cache")
        .select("rank_position")
        .eq("team_id", teamId)
        .eq("tournament_id", tournamentId)
        .single();

      if (leaderboardData) {
        setLeaderboardPosition(leaderboardData.rank_position);
      }

      // 1. Fetch all team players from team_players table
      const teamPlayersRes = await supabase
        .from("team_players")
        .select(`
          id,
          player_id,
          is_captain,
          is_starter,
          is_substituted,
          players (
            id,
            name,
            role,
            team_name
          )
        `)
        .eq("team_id", teamId);

      console.debug("TeamDetail: team_players ->", teamPlayersRes);

      if (teamPlayersRes.error) {
        console.debug("team_players error:", teamPlayersRes.error);
        setPlayers([]);
        setLoading(false);
        return;
      }

      // 2. Fetch performance data from materialized view (only for players who have played)
      const performanceRes = await supabase
        .from("player_performance_summary")
        .select(`
          player_id,
          batting,
          bowling,
          fielding,
          bonus,
          fantasy_total,
          match_id,
          match_name,
          match_date,
          match_status
        `)
        .eq("team_id", teamId)
        .eq("tournament_id", tournamentId);

      console.debug("TeamDetail: player_performance_summary ->", performanceRes);

      // 3. Build performance map by player_id
      const performanceMap = {};
      if (performanceRes.data) {
        performanceRes.data.forEach((row) => {
          if (!performanceMap[row.player_id]) {
            performanceMap[row.player_id] = [];
          }
          performanceMap[row.player_id].push({
            match_id: row.match_id,
            match_name: row.match_name,
            match_date: row.match_date,
            match_status: row.match_status,
            batting_points: row.batting || 0,
            bowling_points: row.bowling || 0,
            fielding_points: row.fielding || 0,
            bonus_points: row.bonus || 0,
            total_points: row.fantasy_total || 0,
          });
        });
      }

      // 4. Merge team_players with performance data
      const enrichedPlayers = teamPlayersRes.data.map((tp) => ({
        id: tp.id,
        player_id: tp.player_id,
        is_captain: tp.is_captain,
        is_starter: tp.is_starter,
        is_substituted: tp.is_substituted,
        players: {
          id: tp.players.id,
          name: tp.players.name,
          role: tp.players.role,
          team_name: tp.players.team_name,
        },
        scores: performanceMap[tp.player_id] || [],
      }));

      // Calculate team totals from performance data
      let battingTotal = 0;
      let bowlingTotal = 0;
      let fieldingTotal = 0;
      let bonusTotal = 0;
      
      if (performanceRes.data) {
        performanceRes.data.forEach((row) => {
          battingTotal += Number(row.batting) || 0;
          bowlingTotal += Number(row.bowling) || 0;
          fieldingTotal += Number(row.fielding) || 0;
          bonusTotal += Number(row.bonus) || 0;
        });
      }

      setTeamTotals({
        batting: battingTotal,
        bowling: bowlingTotal,
        fielding: fieldingTotal,
        bonus: bonusTotal,
        total: battingTotal + bowlingTotal + fieldingTotal + bonusTotal,
      });

      setPlayers(enrichedPlayers);
    } catch (e) {
      console.error(e);
      setError(String(e.message || e));
      setTeam(null);
      setPlayers([]);
    } finally {
      setLoading(false);
    }
  }

  const formatNumber = (v) => {
    if (v === null || v === undefined) return "0";
    const n = Number(v);
    if (Number.isNaN(n)) return String(v);
    return n % 1 === 0 ? String(n) : n.toFixed(1);
  };

  const playerTotalScore = (scores) => {
    if (!scores || scores.length === 0) return 0;
    return scores.reduce((sum, s) => sum + (Number(s.total_points) || 0), 0);
  };

  // Sort players with captain first
  const sortedPlayers = [...players].sort((a, b) => {
    if (a.is_captain) return -1;
    if (b.is_captain) return 1;
    return 0;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-500 text-white py-6 flex items-center justify-center">
        <div className="text-gray-300">Loading team details...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-500 text-white py-6">
      <div className="max-w-6xl mx-auto px-4 space-y-6">
        {/* Header */}
        <div className="bg-card-light rounded-2xl shadow-card p-4 sm:p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="text-3xl sm:text-4xl font-bold text-primary-500">
              {leaderboardPosition ? `#${leaderboardPosition}` : ""}
            </div>
            <button
              onClick={() => navigate(-1)}
              className="px-3 py-1 rounded-full bg-gray-700 text-sm hover:bg-gray-600"
            >
              ← Back
            </button>
          </div>
          <div className="space-y-4">
            {/* Team Info */}
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-primary-500">{team?.team_name || "Team"}</h1>
              <p className="text-sm text-gray-300 mt-1">
                Manager: {username || "Unknown"}
              </p>
              <p className="text-sm text-gray-400 mt-1">
                {players.length} {players.length === 1 ? "player" : "players"}
              </p>
            </div>
            {/* Team Totals and Breakdown */}
            <div className="grid grid-cols-1 sm:grid-cols-1 gap-2 sm:gap-4">
              <div className="bg-dark-500 rounded-lg p-3">
                <div className="text-2xl sm:text-3xl font-bold text-primary-500">
                  {formatNumber(teamTotals.total)}
                </div>
                <div className="text-lg font-bold text-primary-500">
                  {formatNumber(teamTotals.batting)}  - {formatNumber(teamTotals.bowling)}  - {formatNumber(teamTotals.fielding)}  -  {formatNumber(teamTotals.bonus)}
                </div>
              </div>
                          
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-600 rounded-2xl p-4 text-red-200 text-sm">
            {error}
          </div>
        )}

        {/* Players List */}
        <div className="bg-card-light rounded-2xl shadow-card p-4 sm:p-6">
          {players.length === 0 ? (
            <div className="text-gray-400">No players found for this team.</div>
          ) : (
            <div className="space-y-2">
              {/* Mobile card list */}
              <div className="sm:hidden space-y-2">
                {sortedPlayers.map((p) => (
                  <div
                    key={p.id}
                    className="bg-dark-500 rounded-lg overflow-hidden"
                  >
                    <button
                      onClick={() => setExpandedPlayer(expandedPlayer === p.id ? null : p.id)}
                      className="w-full p-3 flex items-center justify-between gap-2 hover:bg-dark-400 transition-colors"
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <div className="flex-shrink-0">
                          {getRoleIcon(p.players?.role) && (
                            <img
                              src={getRoleIcon(p.players?.role)}
                              alt={p.players?.role}
                              title={p.players?.role}
                              className="w-8 h-8 object-contain"
                            />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <button
                            type="button"
                            onClick={(e) => goToPlayerProfile(e, p.players?.id)}
                            className={`text-sm font-semibold truncate text-left focus:outline-none ${
                              p.is_captain ? "text-yellow-400" : "text-white"
                            }`}
                          >
                            {p.players?.name || "Unknown"}
                            {p.is_captain && " (C)"}
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <p className="text-sm font-bold text-primary-500">
                          {formatNumber(playerTotalScore(p.scores))}
                        </p>
                        <svg
                          className={`w-4 h-4 text-gray-400 transition-transform ${
                            expandedPlayer === p.id ? "rotate-180" : ""
                          }`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </button>

                    {/* Expanded Score Breakdown */}
                    {expandedPlayer === p.id && p.scores && p.scores.length > 0 && (
                      <div className="border-t border-gray-600 bg-dark-600 p-3 space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="bg-dark-500 rounded p-2">
                            <p className="text-xs text-gray-400 mb-1">Batting</p>
                            <p className="text-lg font-bold text-primary-500">
                              {formatNumber(p.scores.reduce((sum, s) => sum + (Number(s.batting_points) || 0), 0))}
                            </p>
                          </div>
                          <div className="bg-dark-500 rounded p-2">
                            <p className="text-xs text-gray-400 mb-1">Bowling</p>
                            <p className="text-lg font-bold text-primary-500">
                              {formatNumber(p.scores.reduce((sum, s) => sum + (Number(s.bowling_points) || 0), 0))}
                            </p>
                          </div>
                          <div className="bg-dark-500 rounded p-2">
                            <p className="text-xs text-gray-400 mb-1">Fielding</p>
                            <p className="text-lg font-bold text-primary-500">
                              {formatNumber(p.scores.reduce((sum, s) => sum + (Number(s.fielding_points) || 0), 0))}
                            </p>
                          </div>
                          <div className="bg-dark-500 rounded p-2">
                            <p className="text-xs text-gray-400 mb-1">Bonus</p>
                            <p className="text-lg font-bold text-primary-500">
                              {formatNumber(p.scores.reduce((sum, s) => sum + (Number(s.bonus_points) || 0), 0))}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-gray-300 border-b border-gray-600">
                      <th className="py-3 px-4">Player</th>
                      <th className="py-3 px-4">Role</th>
                      <th className="py-3 px-4 text-right">Matches</th>
                      <th className="py-3 px-4 text-right">Total</th>
                      <th className="py-3 px-4">&nbsp;</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedPlayers.map((p) => (
                      <React.Fragment key={p.id}>
                        <tr
                          className="border-b border-gray-700 hover:bg-dark-500 transition-colors cursor-pointer"
                          onClick={() => setExpandedPlayer(expandedPlayer === p.id ? null : p.id)}
                        >
                          <td className="py-3 px-4 font-semibold">
                            <div className="flex items-center gap-2">
                              {getRoleIcon(p.players?.role) && (
                                <img
                                  src={getRoleIcon(p.players?.role)}
                                  alt={p.players?.role}
                                  title={p.players?.role}
                                  className="w-5 h-5 object-contain flex-shrink-0"
                                />
                              )}
                              <button
                                type="button"
                                onClick={(e) => goToPlayerProfile(e, p.players?.id)}
                                className={`focus:outline-none font-semibold ${p.is_captain ? "text-yellow-400" : "text-white"}`}
                              >
                                {p.players?.name || "Unknown"}
                                {p.is_captain && " (C)"}
                              </button>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-gray-300 capitalize">{p.players?.role || "Unknown"}</td>
                          <td className="py-3 px-4 text-right text-gray-400">{p.scores?.length || 0}</td>
                          <td className="py-3 px-4 text-right font-bold text-primary-500">
                            {formatNumber(playerTotalScore(p.scores))}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <span className="text-sm text-gray-400">
                              {expandedPlayer === p.id ? "▼" : "▶"}
                            </span>
                          </td>
                        </tr>

                        {expandedPlayer === p.id && p.scores.length > 0 && (
                          <tr className="bg-dark-600">
                            <td colSpan="5" className="py-4 px-4">
                              <div className="space-y-3">
                                {/* Summary */}
                                <div className="bg-dark-500 rounded-lg p-3 border border-primary-500/30">
                                  <div className="flex items-center justify-between mb-2">
                                    <div className="font-semibold text-sm">Total Across All Matches</div>
                                    <div className="font-bold text-primary-500 text-lg">
                                      {formatNumber(playerTotalScore(p.scores))}
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div>
                                      <span className="text-gray-400">Batting:</span>{" "}
                                      <span className="text-primary-400">
                                        {formatNumber(p.scores.reduce((sum, s) => sum + (Number(s.batting_points) || 0), 0))}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-gray-400">Bowling:</span>{" "}
                                      <span className="text-primary-400">
                                        {formatNumber(p.scores.reduce((sum, s) => sum + (Number(s.bowling_points) || 0), 0))}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-gray-400">Fielding:</span>{" "}
                                      <span className="text-primary-400">
                                        {formatNumber(p.scores.reduce((sum, s) => sum + (Number(s.fielding_points) || 0), 0))}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-gray-400">Bonus:</span>{" "}
                                      <span className="text-primary-400">
                                        {formatNumber(p.scores.reduce((sum, s) => sum + (Number(s.bonus_points) || 0), 0))}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                {/* Individual Matches */}
                                <div className="space-y-2">
                                  <h4 className="text-xs font-semibold text-gray-400 uppercase">Match Breakdown</h4>
                                  {p.scores.map((s, idx) => (
                                    <div key={idx} className="bg-dark-500 rounded-lg p-3">
                                      <div className="flex items-center justify-between mb-2">
                                        <div className="font-semibold text-sm">{s.match_name || `Match ${idx + 1}`}</div>
                                        <div className="font-bold text-primary-500">
                                          {formatNumber(s.total_points)}
                                        </div>
                                      </div>
                                      <div className="grid grid-cols-2 gap-2 text-xs">
                                        <div>
                                          <span className="text-gray-400">Batting:</span>{" "}
                                          <span className="text-primary-400">{formatNumber(s.batting_points)}</span>
                                        </div>
                                        <div>
                                          <span className="text-gray-400">Bowling:</span>{" "}
                                          <span className="text-primary-400">{formatNumber(s.bowling_points)}</span>
                                        </div>
                                        <div>
                                          <span className="text-gray-400">Fielding:</span>{" "}
                                          <span className="text-primary-400">{formatNumber(s.fielding_points)}</span>
                                        </div>
                                        <div>
                                          <span className="text-gray-400">Bonus:</span>{" "}
                                          <span className="text-primary-400">{formatNumber(s.bonus_points)}</span>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
