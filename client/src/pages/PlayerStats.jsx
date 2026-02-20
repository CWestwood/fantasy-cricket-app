import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { FiChevronDown, FiSearch } from "react-icons/fi";
import { supabase } from "../utils/supabaseClient";
import { useTeam } from "../context/TeamContext";
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
  const [searchTerm, setSearchTerm] = useState("");
  
  // Stages state
  const [stages, setStages] = useState([]);
  const [selectedStage, setSelectedStage] = useState("combined");

  const roles = ["batter", "bowler", "allrounder", "wicketkeeper"];

  // Simple in-memory cache
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  if (!window.__playerStatsCache) window.__playerStatsCache = new Map();
  const statsCache = window.__playerStatsCache;

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

  // 1. Fetch Stages separately so the dropdown populates even on a cache hit
  useEffect(() => {
    if (!tournamentId) return;
    const fetchStages = async () => {
      const { data } = await supabase
        .from("tournament_stages")
        .select("*")
        .eq("tournament_id", tournamentId)
        .order("id", { ascending: true });
      if (data) setStages(data);
    };
    fetchStages();
  }, [tournamentId]);

  // 2. Fetch Player Stats
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

      const cacheKey = `playerStats_v2:${tournamentId}`;

      // Try cache first (in-memory)
      try {
        const cacheEntry = statsCache.get(cacheKey);
        if (cacheEntry && Date.now() - cacheEntry.timestamp < CACHE_TTL) {
          setPlayerRows(cacheEntry.rows);
          setLoading(false);
          return;
        }

        // Try sessionStorage fallback
        const ssRaw = sessionStorage.getItem(cacheKey);
        if (ssRaw) {
          const parsed = JSON.parse(ssRaw);
          if (parsed?.timestamp && Date.now() - parsed.timestamp < CACHE_TTL && parsed.rows) {
            statsCache.set(cacheKey, { timestamp: parsed.timestamp, rows: parsed.rows });
            setPlayerRows(parsed.rows);
            setLoading(false);
            return;
          }
        }
      } catch (e) {
        console.warn("PlayerStats cache read error", e);
      }

      try {
        // Fetch players
        const playersRes = await supabase
          .from("squads")
          .select("id, name, role, team_name")
          .eq("tournament_id", tournamentId)
          .order("name", { ascending: true });

        if (playersRes.error) throw playersRes.error;

        // Map Match IDs to Stage IDs (fallback in case the view lacks stage_id)
        const matchesRes = await supabase
          .from("matches")
          .select("id, stage_id")
          .eq("tournament_id", tournamentId);
        
        const matchStageMap = {};
        matchesRes.data?.forEach(m => {
          matchStageMap[m.id] = m.stage_id;
        });

        // Fetch Pick Counts
        const { data: teamsData } = await supabase
          .from("teams")
          .select("id")
          .eq("tournament_id", tournamentId);
        
        const teamIds = (teamsData || []).map(t => t.id);
        const pickCounts = {};
        if (teamIds.length > 0) {
          const { data: tpData } = await supabase
            .from("team_players")
            .select("player_id")
            .in("team_id", teamIds)
            .eq("is_substituted", false);
          tpData?.forEach(tp => {
            pickCounts[tp.player_id] = (pickCounts[tp.player_id] || 0) + 1;
          });
        }

        // Fetch Performance
        const perfRes = await supabase
          .from("tournament_player_performance")
          .select(
            "player_id, match_id, match_name, match_date, match_status, batting, bowling, fielding, bonus, fantasy_total, stage_id"
          )
          .eq("tournament_id", tournamentId);

        if (perfRes.error) throw perfRes.error;

        if (!mounted) return;

        const aggregate = {};
        perfRes.data?.forEach((row) => {
          if (!row?.player_id) return;

          if (!aggregate[row.player_id]) {
            aggregate[row.player_id] = {
              matches: new Set(),
              matchIds: new Set(),
              matchLog: [],
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
                stageId: row.stage_id || matchStageMap[row.match_id], // Inject Stage ID
                batting: row.batting,
                bowling: row.bowling,
                fielding: row.fielding,
                bonus: row.bonus,
                score: row.fantasy_total,
              });
              
              stats.batting += Number(row.batting) || 0;
              stats.bowling += Number(row.bowling) || 0;
              stats.fielding += Number(row.fielding) || 0;
              stats.bonus += Number(row.bonus) || 0;
              stats.total += Number(row.fantasy_total) || 0;
            }
          }
        });

        const rows = (playersRes.data || []).map((player) => {
          const stats = aggregate[player.id] || {
            matches: new Set(),
            matchLog: [],
            matchIds: new Set(),
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
            teamsPicked: pickCounts[player.id] || 0,
            matchLog: orderedMatchLog,
          };
        });

        rows.sort((a, b) => b.totalScore - a.totalScore);
        
        try {
          statsCache.set(cacheKey, { timestamp: Date.now(), rows });
          sessionStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), rows }));
        } catch (e) {
          // ignore
        }

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

  // 3. Dynamically Calculate Stats based on Selected Stage
  const computedPlayerRows = useMemo(() => {
    const rows = playerRows.map(row => {
      if (selectedStage === "combined") {
        return row; 
      }
      
      let batting = 0, bowling = 0, fielding = 0, bonus = 0, totalScore = 0;
      let matchesPlayed = 0;
      
      (row.matchLog || []).forEach(m => {
        if (String(m.stageId) === String(selectedStage)) {
          batting += Number(m.batting) || 0;
          bowling += Number(m.bowling) || 0;
          fielding += Number(m.fielding) || 0;
          bonus += Number(m.bonus) || 0;
          totalScore += Number(m.score) || 0;
          matchesPlayed++;
        }
      });
      
      return {
        ...row,
        batting, bowling, fielding, bonus, totalScore, matchesPlayed
      };
    });

    return rows.sort((a, b) => b.totalScore - a.totalScore);
  }, [playerRows, selectedStage]);

  // 4. Filter for Search & Roles
  const filteredPlayerRows = computedPlayerRows.filter((row) => {
    const matchesRole = selectedRoles.size === 0 || selectedRoles.has(row.role.toLowerCase());
    const matchesSearch = !searchTerm.trim() || 
      (row.playerName || "").toLowerCase().includes(searchTerm.toLowerCase()) || 
      (row.teamName || "").toLowerCase().includes(searchTerm.toLowerCase());
    return matchesRole && matchesSearch;
  });

  const statsWithMatchData = computedPlayerRows.filter((row) => row.matchesPlayed > 0).length;

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
        <div className="bg-card-light rounded-2xl shadow-card p-5 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-gray-400">Insights</p>
              <h1 className="text-2xl sm:text-3xl font-bold text-primary-500">Player Stats</h1>
            </div>
            
            {/* Stage Selector and Meta Counts */}
            <div className="flex flex-col sm:items-end gap-2">
              <select
                value={selectedStage}
                onChange={(e) => setSelectedStage(e.target.value)}
                className="bg-dark-600 text-gray-400 text-center rounded-lg px-3 py-1.5 text-sm font-medium border border-gray-600 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
              >
                <option value="combined">Combined View</option>
                {stages.map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.stage_name}
                  </option>
                ))}
              </select>
              <div className="text-sm text-gray-300 flex sm:flex-col justify-between sm:justify-end gap-4 sm:gap-0">
                <p>{filteredPlayerRows.length} player{filteredPlayerRows.length === 1 ? "" : "s"}</p>
                <p>{statsWithMatchData} with match data</p>
              </div>
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

          {/* Search Bar */}
          <div className="pt-2 max-w-md mx-auto w-full">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <FiSearch className="text-gray-400" />
              </div>
              <input
                type="text"
                placeholder="Search player or team..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className=" text-sm text-center w-full pl-10 pr-4 py-2 rounded-lg bg-dark-700 border border-gray-600 text-white placeholder-gray-400 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
              />
            </div>
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
              const visibleMatchLog = selectedStage === "combined" 
                ? row.matchLog 
                : (row.matchLog || []).filter(m => String(m.stageId) === String(selectedStage));

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
                    <div className="flex-1 min-w-0">
                      <button
                        type="button"
                        onClick={() => navigate(`/player/${row.playerId}`)}
                        className="text-sm font-semibold text-white hover:text-primary-400 truncate w-full text-left"
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
                        <div className="bg-dark-500 rounded-xl p-2 text-center col-span-2">
                          <p className="text-gray-400">Picked by:</p>
                          <p className="font-semibold text-primary-500">{row.teamsPicked}</p>
                        </div>
                      </div>
                      <div className="space-y-2">
                        {visibleMatchLog.length === 0 ? (
                          <div className="text-xs text-gray-400">No match data for this view.</div>
                        ) : (
                          visibleMatchLog.map((match, idx) => (
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
                <tr className="text-xs uppercase tracking-[0.2em] text-gray-400 border-b border-gray-700">
                  <th className="px-3 py-3 w-48">Player</th>
                  <th className="px-3 py-3 text-center"></th>
                  <th className="px-3 py-3">Team</th>
                  <th className="px-3 py-3 text-center">Matches</th>
                  <th className="px-3 py-3 text-center">Total</th>
                  <th className="px-3 py-3 text-center">Batting</th>
                  <th className="px-3 py-3 text-center">Bowling</th>
                  <th className="px-3 py-3 text-center">Fielding</th>
                  <th className="px-3 py-3 text-center">Bonus</th>
                  <th className="px-3 py-3 text-center">Teams Picked</th>
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
                    <tr key={row.playerId} className="hover:bg-dark-600 transition-colors">
                      <td className="px-3 py-3 w-48">
                        <button
                          type="button"
                          onClick={() => navigate(`/player/${row.playerId}`)}
                          className="text-left text-sm font-semibold text-white hover:text-primary-400 w-full truncate"
                        >
                          {row.playerName}
                        </button>
                        <p className="text-xs text-gray-500 truncate">{row.teamName}</p>
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