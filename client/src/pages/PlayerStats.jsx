import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiChevronDown } from "react-icons/fi";
import { supabase } from "../utils/supabaseClient";
import { useTeam } from "../contexts/TeamContext";
import BatIcon from "../assets/icons/bat_white.svg";
import BallIcon from "../assets/icons/ball_white.svg";
import AllrounderIcon from "../assets/icons/allrounder_white.svg";
import WkglovesIcon from "../assets/icons/wkgloves_white.svg";

const roleIconMap = {
  batter: BatIcon,
  bowler: BallIcon,
  allrounder: AllrounderIcon,
  wicketkeeper: WkglovesIcon,
};

const getRoleIcon = (role) => {
  if (!role) return null;
  return roleIconMap[role.toLowerCase()] || null;
};

const formatScore = (value) => {
  if (value === null || value === undefined) return "0";
  const number = Number(value);
  if (Number.isNaN(number)) return "0";
  return Math.round(number).toLocaleString();
};


const PlayerStats = () => {
  const { tournamentId } = useTeam();
  const navigate = useNavigate();
  const [playerRows, setPlayerRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedPlayerId, setExpandedPlayerId] = useState(null);
  const [selectedRoles, setSelectedRoles] = useState(new Set());

  const roles = ["batter", "bowler", "allrounder", "wicketkeeper"];

  const toggleRole = (role) => {
    setSelectedRoles((prev) => {
      const updated = new Set(prev);
      if (updated.has(role)) {
        updated.delete(role);
      } else {
        updated.add(role);
      }
      return updated;
    });
  };

  const filteredPlayerRows = selectedRoles.size === 0
    ? playerRows
    : playerRows.filter((row) => selectedRoles.has(row.role.toLowerCase()));

  useEffect(() => {
    let mounted = true;

    const fetchStats = async () => {
      if (!tournamentId) {
        setLoading(true);
        setPlayerRows([]);
        return;
      }

      setLoading(true);
      setError("");

      try {
        const playersRes = await supabase
          .from("players")
          .select("id, name, role, team_name")
          .eq("tournament_id", tournamentId)
          .order("name", { ascending: true });

        if (playersRes.error) {
          throw playersRes.error;
        }

        const perfRes = await supabase
          .from("player_performance_summary")
          .select(
            "player_id, team_id, match_id, match_name, match_date, match_status, batting, bowling, fielding, bonus, fantasy_total"
          )
          .eq("tournament_id", tournamentId);

        if (perfRes.error) {
          throw perfRes.error;
        }

        if (!mounted) return;

        const aggregate = {};
        perfRes.data?.forEach((row) => {
          if (!row?.player_id) return;

          if (!aggregate[row.player_id]) {
            aggregate[row.player_id] = {
              matches: new Set(),
              matchIds: new Set(),
              matchLog: [],
              teams: new Set(),
              batting: 0,
              bowling: 0,
              fielding: 0,
              bonus: 0,
              total: 0,
            };
          }

          const stats = aggregate[row.player_id];
          const isNewMatch = row.match_id && !stats.matchIds.has(row.match_id);

          if (row.match_id) {
            stats.matches.add(row.match_id);
            if (isNewMatch) {
              stats.matchIds.add(row.match_id);
              stats.matchLog.push({
                matchId: row.match_id,
                matchName: row.match_name,
                matchDate: row.match_date,
                matchStatus: row.match_status,
                batting: row.batting,
                bowling: row.bowling,
                fielding: row.fielding,
                bonus: row.bonus,
                score: row.fantasy_total,
              });
              // Only count scores once per match, not once per team the player is in
              stats.batting += Number(row.batting) || 0;
              stats.bowling += Number(row.bowling) || 0;
              stats.fielding += Number(row.fielding) || 0;
              stats.bonus += Number(row.bonus) || 0;
              stats.total += Number(row.fantasy_total) || 0;
            }
          }

          if (row.team_id) stats.teams.add(row.team_id);
        });

        const rows = (playersRes.data || []).map((player) => {
          const stats = aggregate[player.id] || {
            matches: new Set(),
            matchLog: [],
            matchIds: new Set(),
            teams: new Set(),
            batting: 0,
            bowling: 0,
            fielding: 0,
            bonus: 0,
            total: 0,
          };

          const orderedMatchLog = (stats.matchLog || []).slice();
          orderedMatchLog.sort((a, b) => {
            const da = a.matchDate ? new Date(a.matchDate).getTime() : 0;
            const db = b.matchDate ? new Date(b.matchDate).getTime() : 0;
            return da - db;
          });

          return {
            playerId: player.id,
            playerName: player.name || "Unknown",
            teamName: player.team_name || "Unknown",
            role: player.role || "batter",
            matchesPlayed: stats.matches.size,
            batting: stats.batting,
            bowling: stats.bowling,
            fielding: stats.fielding,
            bonus: stats.bonus,
            totalScore: stats.total,
            teamsPicked: stats.teams.size,
            matchLog: orderedMatchLog,
          };
        });

        rows.sort((a, b) => b.totalScore - a.totalScore);
        setPlayerRows(rows);
      } catch (err) {
        console.error("PlayerStats: fetch error", err);
        if (!mounted) return;
        setError(err?.message || "Unable to load player stats.");
        setPlayerRows([]);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchStats();

    return () => {
      mounted = false;
    };
  }, [tournamentId]);

  const statsWithMatchData = playerRows.filter((row) => (row.matchLog || []).length > 0).length;

  if (!tournamentId) {
    return (
      <div className="min-h-screen bg-dark-500 text-white flex items-center justify-center px-4">
        <div className="text-center space-y-3">
          <p className="text-lg text-gray-300">Waiting for a tournament to be selected.</p>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="px-4 py-2 rounded-full bg-primary-500 text-black text-sm font-semibold"
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-500 text-white pb-20">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div className="bg-card-light rounded-2xl shadow-card p-5 space-y-3">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-gray-400">Insights</p>
              <h1 className="text-2xl sm:text-3xl font-bold text-primary-500">Player Stats</h1>
            </div>
            <div className="text-sm text-gray-300">
              <p>{filteredPlayerRows.length} player{filteredPlayerRows.length === 1 ? "" : "s"}</p>
              <p>{statsWithMatchData} with match data</p>
            </div>
          </div>

          {/* Role Filter with icons */}
            <div className="flex justify-center gap-5 flex-wrap items-center pt-2">
            {roles.map((role) => {
                const iconSrc = roleIconMap[role];
                const isSelected = selectedRoles.has(role);
                
                return (
                <button
                    key={role}
                    onClick={() => toggleRole(role)}
                    className={`relative p-3 rounded-lg items-center transition-all transform hover:scale-105 ${
                    isSelected
                        ? "bg-primary-500 border-2 border-primary-400 shadow-lg"
                        : "bg-dark-700/50 border-2 border-gray-600 hover:border-gray-400 hover:bg-dark-600"
                    }`}
                    title={role.charAt(0).toUpperCase() + role.slice(1)}
                >
                    <img 
                    src={iconSrc} 
                    alt={role}
                    className={`w-7 h-7 transition-all ${
                        isSelected ? "opacity-100 brightness-110" : "opacity-50 brightness-75"
                    }`}
                    />
                    {isSelected && (
                    <div className="absolute -top-1 -right-1 bg-green-500 rounded-full w-4 h-4 flex items-center justify-center">
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    )}
                </button>
                );
            })}
            </div>
        </div>

        <div className="bg-card-light rounded-2xl shadow-card p-4 space-y-4">
          {error && (
            <div className="rounded-xl bg-red-500/20 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}

          <div className="text-xs text-gray-400">Tap a player name to open their profile.</div>

          <div className="space-y-3 sm:hidden">
            {filteredPlayerRows.length === 0 && !loading && (
              <div className="py-6 text-center text-sm text-gray-400">No players available yet.</div>
            )}

            {filteredPlayerRows.map((row) => {
              const isExpanded = expandedPlayerId === row.playerId;
              return (
                <div
                  key={`${row.playerId}-mobile`}
                  className="bg-dark-600 rounded-2xl border border-gray-800 p-3 space-y-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex-shrink-0">
                    {(() => {
                        const iconSrc = getRoleIcon(row.role);
                        return iconSrc ? (
                        <img src={iconSrc} alt={row.role} className="h-8 w-8" />
                        ) : (
                        <span className="text-xs uppercase tracking-[0.3em] text-gray-400">
                            {row.role?.slice(0, 3) || "—"}
                        </span>
                        );
                    })()}
                    </div>
                    <div className="flex-1">
                      <button
                        type="button"
                        onClick={() => navigate(`/player/${row.playerId}`)}
                        className="text-sm font-semibold text-white hover:text-primary-400"
                      >
                        {row.playerName}
                      </button>
                      <p className="text-xs text-gray-400 truncate">{row.teamName}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-center text-primary-500">{formatScore(row.totalScore)}</p>
                      <p className="text-[10px] uppercase tracking-[0.3em] text-gray-400">points</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setExpandedPlayerId((prev) => (prev === row.playerId ? null : row.playerId))}
                      className="p-1"
                      aria-label={isExpanded ? "Collapse" : "Expand"}
                    >
                      <FiChevronDown
                        size={20}
                        className={`text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      />
                    </button>
                  </div>
                  {isExpanded && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-dark-500 rounded-xl p-2 text-center">
                          <p className="text-gray-400">Batting</p>
                          <p className="font-semibold text-primary-500">{formatScore(row.batting)}</p>
                        </div>
                        <div className="bg-dark-500 rounded-xl p-2 text-center">
                          <p className="text-gray-400">Bowling</p>
                          <p className="font-semibold text-primary-500">{formatScore(row.bowling)}</p>
                        </div>
                        <div className="bg-dark-500 rounded-xl p-2 text-center">
                          <p className="text-gray-400">Fielding</p>
                          <p className="font-semibold text-primary-500">{formatScore(row.fielding)}</p>
                        </div>
                        <div className="bg-dark-500 rounded-xl p-2 text-center">
                          <p className="text-gray-400">Bonus</p>
                          <p className="font-semibold text-primary-500">{formatScore(row.bonus)}</p>
                        </div>
                      </div>
                      <div className="space-y-2">
                        {(row.matchLog || []).length === 0 ? (
                          <div className="text-xs text-gray-400">No match data yet.</div>
                        ) : (
                          row.matchLog.map((match, idx) => (
                            <div
                              key={`${row.playerId}-${match.matchId ?? idx}`}
                              className="bg-dark-700 rounded-xl border border-gray-800 p-2"
                            >
                              <div className="text-center text-xs font-semibold text-white">
                                <span>{match.matchName || "Match"}</span>
                              </div>
                              <span className="text-primary-500">{formatScore(match.score)} pts</span>
                              <div className="grid grid-cols-4 gap-2 text-[11px] text-gray-300 mt-2">
                                <span className="text-center">
                                  <span className="block text-gray-400">Bat</span>
                                  {formatScore(match.batting)}
                                </span>
                                <span className="text-center">
                                  <span className="block text-gray-400">Bowl</span>
                                  {formatScore(match.bowling)}
                                </span>
                                <span className="text-center">
                                  <span className="block text-gray-400">Field</span>
                                  {formatScore(match.fielding)}
                                </span>
                                <span className="text-center">
                                  <span className="block text-gray-400">Bonus</span>
                                  {formatScore(match.bonus)}
                                </span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {loading && (
              <div className="py-6 text-center text-sm text-gray-400">Loading player stats...</div>
            )}
          </div>

          <div className="hidden sm:block overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-[0.2em] text-gray-400">
                  <th className="px-3 py-2 w-32">Player</th>
                  <th className="px-3 py-2 text-center"></th>
                  <th className="px-3 py-2">Team</th>
                  <th className="px-3 py-2 text-center">Matches</th>
                  <th className="px-3 py-2 text-center">Total</th>
                  <th className="px-3 py-2 text-center">Batting</th>
                  <th className="px-3 py-2 text-center">Bowling</th>
                  <th className="px-3 py-2 text-center">Fielding</th>
                  <th className="px-3 py-2 text-center">Bonus</th>
                  <th className="px-3 py-2 text-center">Teams Picked</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {loading ? (
                  <tr>
                    <td colSpan="10" className="py-12 text-center text-sm text-gray-400">
                      Loading player stats...
                    </td>
                  </tr>
                ) : filteredPlayerRows.length === 0 ? (
                  <tr>
                    <td colSpan="10" className="py-12 text-center text-sm text-gray-400">
                      No players available yet.
                    </td>
                  </tr>
                ) : (
                  filteredPlayerRows.map((row) => (
                    <tr key={row.playerId} className="hover:bg-dark-600 transition-colors cursor-pointer">
                      <td className="px-3 py-3 w-48">
                        <button
                          type="button"
                          onClick={() => navigate(`/player/${row.playerId}`)}
                          className="text-left text-sm font-semibold text-white hover:text-primary-400"
                        >
                          {row.playerName}
                        </button>
                        <p className="text-xs text-gray-500">{row.teamName}</p>
                      </td>
                      <td className="px-3 py-3 text-center">
                        {(() => {
                            const iconSrc = getRoleIcon(row.role);
                            return iconSrc ? (
                            <img src={iconSrc} alt={row.role} className="mx-auto h-6 w-6" />
                            ) : (
                            <span className="text-xs uppercase tracking-[0.3em] text-gray-400">
                                {row.role?.slice(0, 3) || "—"}
                            </span>
                            );
                        })()}
                        </td>
                      <td className="px-3 py-3 max-w-[120px] text-sm text-gray-300 truncate">
                        {row.teamName}
                      </td>
                      <td className="px-3 py-3 text-center">{row.matchesPlayed}</td>
                      <td className="px-3 py-3 text-center text-primary-500 font-bold">
                        {formatScore(row.totalScore)}
                      </td>
                      <td className="px-3 py-3 text-center text-gray-200">
                        {formatScore(row.batting)}
                      </td>
                      <td className="px-3 py-3 text-center text-gray-200">
                        {formatScore(row.bowling)}
                      </td>
                      <td className="px-3 py-3 text-center text-gray-200">
                        {formatScore(row.fielding)}
                      </td>
                      <td className="px-3 py-3 text-center text-gray-200">
                        {formatScore(row.bonus)}
                      </td>
                      <td className="px-3 py-3 text-center text-gray-300 text-sm">
                        {row.teamsPicked}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlayerStats;
