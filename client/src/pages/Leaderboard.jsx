import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../utils/supabaseClient";
import { useTeam } from "../context/TeamContext";

export default function Leaderboard() {
  // Only tournamentId and viewStage come from context.
  // viewStage is used only to seed the initial stage selector.
  // activeStage is intentionally NOT used here — it reflects the
  // pickable stage for TeamSelection, which is irrelevant to the leaderboard.
  const { tournamentId } = useTeam();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);
  const [expandedTeam, setExpandedTeam] = useState(null);
  const [isLive, setIsLive] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [liveScores, setLiveScores] = useState({});
  const [liveScoresByUser, setLiveScoresByUser] = useState({});
  const [extraStats, setExtraStats] = useState({});
  const [teamStages, setTeamStages] = useState({});
  const [allStages, setAllStages] = useState([]);

  // Local stage selector — independent of TeamSelection's activeStage.
  const [selectedStage, setSelectedStage] = useState(null);

  // Load all available stages for the stage selector tabs
  useEffect(() => {
    if (!tournamentId) return;
    const loadStages = async () => {
      const { data } = await supabase
        .from("tournament_settings")
        .select("stage_id, stages:stage_id(id, stage_name)")
        .eq("tournament_id", tournamentId)
        .order("stage_id", { ascending: true });

      if (data) {
        const stages = data
          .map((row) => row.stages)
          .filter(Boolean);
        setAllStages(stages);
      }
    };
    loadStages();
  }, [tournamentId]);

  // Fetch leaderboard and live scores when tournament is available
  useEffect(() => {
    if (!tournamentId) return;
    fetchLeaderboard(selectedStage?.id ?? null);
    fetchLiveScores();

    const channel = supabase
      .channel("live_leaderboard_updates")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "live_userteam_points",
          filter: `tournament_id=eq.${tournamentId}`,
        },
        () => fetchLiveScores()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId, selectedStage?.id]);

  // Fetch extra stats — scoped to selectedStage for correct max_subs
  useEffect(() => {
    if (!tournamentId) return;

    async function fetchExtraStats() {
      try {
        // Get max_subs for the selected stage specifically
        const settingsQuery = supabase
          .from("tournament_settings")
          .select("max_subs")
          .eq("tournament_id", tournamentId);

        if (selectedStage?.id) {
          settingsQuery.eq("stage_id", selectedStage.id);
        }

        const { data: settings } = await settingsQuery.maybeSingle();
        const maxSubs = settings?.max_subs || 3;

        const { data: teamsData } = await supabase
          .from("teams")
          .select("id, subs_used, stage_id, user_id")
          .eq("tournament_id", tournamentId);

        const { data: quotasData } = await supabase
          .from("stage_subs_quotas")
          .select("user_id, stage_id, subs_allocated")
          .eq("tournament_id", tournamentId);

        const { data: perfData } = await supabase
          .from("player_performance_summary")
          .select("team_id, stage_id")
          .eq("tournament_id", tournamentId);

        const stats = {};
        const stages = {};

        teamsData?.forEach((t) => {
          const quota = quotasData?.find(q => q.user_id === t.user_id && q.stage_id === t.stage_id);
          const allocated = quota ? quota.subs_allocated : maxSubs;

          stats[t.id] = {
            subsRemaining: Math.max(0, allocated - (t.subs_used || 0)),
            appearances: 0,
          };
          stages[t.id] = t.stage_id;
        });

        perfData?.forEach((row) => {
          if (stats[row.team_id]) {
            stats[row.team_id].appearances += 1;
          }
        });

        setExtraStats(stats);
        setTeamStages(stages);
      } catch (err) {
        console.error("Error fetching extra stats:", err);
      }
    }

    fetchExtraStats();
  }, [tournamentId, selectedStage?.id]);

  async function fetchLeaderboard(stageId = null) {
    setError("");
    setLoading(true);
    try {
      const res = await supabase.rpc("get_leaderboard", {
        p_tournament_id: tournamentId,
        p_stage_id: stageId ?? null,
      });
      if (res.error) {
        setError(String(res.error.message || res.error));
        setRows([]);
      } else {
        setRows(res.data || []);
        setLastUpdated(new Date());
      }
    } catch (e) {
      setError(String(e.message || e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function fetchLiveScores() {
    try {
      const { data, error } = await supabase
        .from("live_userteam_points")
        .select("user_id, team_id, total, batting, bowling, fielding, bonus")
        .eq("tournament_id", tournamentId);

      if (error) { console.error("Error fetching live scores:", error); return; }

      const aggregated = {};
      const aggregatedByUser = {};

      data?.forEach((row) => {
        // by team_id
        if (!aggregated[row.team_id]) {
          aggregated[row.team_id] = { total: 0, batting: 0, bowling: 0, fielding: 0, bonus: 0 };
        }
        aggregated[row.team_id].total   += Number(row.total)    || 0;
        aggregated[row.team_id].batting += Number(row.batting)  || 0;
        aggregated[row.team_id].bowling += Number(row.bowling)  || 0;
        aggregated[row.team_id].fielding+= Number(row.fielding) || 0;
        aggregated[row.team_id].bonus   += Number(row.bonus)    || 0;

        // by user_id (for combined leaderboard view)
        if (!aggregatedByUser[row.user_id]) {
          aggregatedByUser[row.user_id] = { total: 0, batting: 0, bowling: 0, fielding: 0, bonus: 0 };
        }
        aggregatedByUser[row.user_id].total   += Number(row.total)    || 0;
        aggregatedByUser[row.user_id].batting += Number(row.batting)  || 0;
        aggregatedByUser[row.user_id].bowling += Number(row.bowling)  || 0;
        aggregatedByUser[row.user_id].fielding+= Number(row.fielding) || 0;
        aggregatedByUser[row.user_id].bonus   += Number(row.bonus)    || 0;
      });

      setLiveScores(aggregated);
      setLiveScoresByUser(aggregatedByUser);
    } catch (e) {
      console.error("Exception fetching live scores:", e);
    }
  }

  const formatNumber = (v) => {
    if (v === null || v === undefined) return "0";
    const n = Number(v);
    if (Number.isNaN(n)) return String(v);
    return n % 1 === 0 ? String(n) : n.toFixed(1);
  };

  const processedRows = useMemo(() => {
    if (!rows.length) return [];

    // No client-side stage filtering needed — get_leaderboard already returns
    // the correct rows for the selected stage/combined view
    const hasLiveActivity = rows.some((row) => {
      const live = selectedStage ? liveScores[row.team_id] : liveScoresByUser[row.user_id];
      return live && live.total !== 0;
    });

    let data = rows.map((row) => {
      const live = selectedStage
        ? (liveScores[row.team_id] || { total: 0, batting: 0, bowling: 0, fielding: 0, bonus: 0 })
        : (liveScoresByUser[row.user_id] || { total: 0, batting: 0, bowling: 0, fielding: 0, bonus: 0 });

      // extraStats is keyed by team_id — for combined view this may not match,
      // so fall back gracefully
      const extra = extraStats[row.team_id] || { subsRemaining: "-", appearances: 0 };

      if (!isLive) {
        return {
          ...row,
          display_total:    Number(row.total),
          display_batting:  Number(row.batting_total),
          display_bowling:  Number(row.bowling_total),
          display_fielding: Number(row.fielding_total),
          display_bonus:    Number(row.bonus_total),
          live_delta_total: 0, live_delta_batting: 0,
          live_delta_bowling: 0, live_delta_fielding: 0, live_delta_bonus: 0,
          display_rank: row.rank_position,
          display_rank_change: row.rank_change || 0,  // straight from DB
          appearances: extra.appearances,
          subsRemaining: extra.subsRemaining,
        };
      }

      return {
        ...row,
        display_total:    Number(row.total) + live.total,
        display_batting:  Number(row.batting_total) + live.batting,
        display_bowling:  Number(row.bowling_total) + live.bowling,
        display_fielding: Number(row.fielding_total) + live.fielding,
        display_bonus:    Number(row.bonus_total) + live.bonus,
        live_delta_total:    live.total,
        live_delta_batting:  live.batting,
        live_delta_bowling:  live.bowling,
        live_delta_fielding: live.fielding,
        live_delta_bonus:    live.bonus,
        appearances: extra.appearances,
        subsRemaining: extra.subsRemaining,
      };
    });

    if (isLive) {
      data.sort((a, b) => b.display_total - a.display_total);

      let currentRank = 1;
      data = data.map((row, index) => {
        if (index > 0 && row.display_total < data[index - 1].display_total) {
          currentRank = index + 1;
        }

        // If a match is in progress, calculate live rank movement vs start-of-match position.
        // If no live activity, use the DB rank_change which reflects last completed match movement.
        const rankChange = hasLiveActivity
          ? (row.rank_position - currentRank)  // positive = moved up, negative = moved down
          : (row.rank_change || 0);

        return {
          ...row,
          display_rank: currentRank,
          display_rank_change: rankChange,
        };
      });
    } else {
      data.sort((a, b) => a.rank_position - b.rank_position);
    }

    return data;
  }, [rows, liveScores, liveScoresByUser, isLive, extraStats, selectedStage]);

  return (
    <div className="min-h-screen bg-dark-500 text-white py-6">
      <div className="max-w-6xl mx-auto px-4 space-y-6">
        {!tournamentId && (
          <div className="bg-yellow-900/30 border border-yellow-600 rounded-2xl p-4 text-yellow-200 text-sm">
            No tournament selected. Please select a tournament to view the leaderboard.
          </div>
        )}

        <div className="bg-card-light rounded-2xl shadow-card p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-center text-2xl sm:text-3xl font-bold text-primary-500">
                Leaderboard
                
              </h1>
              {lastUpdated && (
                <p className="text-center text-sm text-gray-400 mt-1">
                  Updated {lastUpdated.toLocaleTimeString()}
                </p>
              )}
            </div>

             <div className="flex items-center gap-3 ">
              <div className="flex items-center gap-3 flex-wrap span-auto sm:span-full">
              
                {allStages.length > 1 && (
                  <button
                    onClick={() => setSelectedStage(null)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      selectedStage === null
                        ? "bg-primary-500 text-black"
                        : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                    }`}
                  >
                    Overall
                  </button>
                )}
                 
              
                {/* Dynamic Stage Buttons */}
                {allStages.map((stage) => {
                  // Map 'Super8s' and 'Knockouts' to 'Super8s', otherwise keep the name
                  const displayName = (stage.stage_name === "Super8s and Knockouts" || stage.stage_name === "Knockouts") 
                    ? "Super8s" 
                    : stage.stage_name;

                  return (
                    <button
                      key={stage.id}
                      onClick={() => setSelectedStage(stage)}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                        selectedStage?.id === stage.id
                          ? "bg-primary-500 text-black"
                          : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                      }`}
                    >
                      {displayName}
                    </button>
                  );
                })}

                {/* Live Toggle Button (Now part of the same group) */}
                <button
                  onClick={() => setIsLive(!isLive)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5 ${
                    isLive
                      ? "bg-green-600 text-white" 
                      : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                  }`}
                >
                  {/* Visual indicator for 'Live' status */}
                  <span className={`w-1.5 h-1.5 rounded-full ${isLive ? "bg-white animate-pulse" : "bg-gray-500"}`} />
                  Live
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-card-light rounded-2xl shadow-card p-4 sm:p-6">
          {error && <div className="text-sm text-red-400 mb-3">{error}</div>}

          {processedRows.length === 0 && !loading ? (
            <div className="text-gray-400">No leaderboard data available.</div>
          ) : (
            <div className="space-y-2">
              {/* Mobile card list */}
              <div className="sm:hidden space-y-1">
                {processedRows.map((r) => (
                  <div key={r.team_id} className="bg-dark-500 rounded-lg p-3 cursor-pointer hover:bg-dark-400 transition-colors">
                    <div onClick={() => navigate(`/team/${r.team_id}`)}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex flex-col items-center min-w-[2rem]">
                          <div className="text-primary-500 font-bold text-lg">#{r.display_rank}</div>
                          {r.display_rank_change !== 0 && (
                            <span className={`text-[10px] font-bold ${r.display_rank_change > 0 ? "text-green-400" : "text-red-400"}`}>
                              {r.display_rank_change > 0 ? "▲" : "▼"} {Math.abs(r.display_rank_change)}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 text-center">
                          <div className="font-semibold">{r.team_name}</div>
                          <div className="text-xs text-gray-400">{r.username}</div>
                        </div>
                        <div className="flex items-center gap-5">
                          <div className="text-right">
                            <div className="font-bold text-primary-500">
                              {formatNumber(r.display_total)}
                              {isLive && r.live_delta_total !== 0 && (
                                <span className={`ml-1 text-xs ${r.live_delta_total < 0 ? "text-red-400" : "text-green-400"}`}>
                                  {r.live_delta_total < 0 ? "" : "+"}{formatNumber(r.live_delta_total)}
                                </span>
                              )}
                              {isLive && r.live_delta_total === 0 && (
                                <span className="ml-1 text-xs text-gray-400">+0</span>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedTeam(expandedTeam === r.team_id ? null : r.team_id);
                            }}
                            className="flex items-center justify-center w-3 h-3 rounded-full bg-gray-700 hover:bg-gray-600 transition-colors"
                          >
                            <svg
                              className={`w-2 h-2 text-gray-300 transition-transform ${expandedTeam === r.team_id ? "rotate-180" : ""}`}
                              fill="none" stroke="currentColor" viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>

                    {expandedTeam === r.team_id && (() => {
                      const breakdownSum = r.display_batting + r.display_bowling + r.display_fielding + r.display_bonus;
                      return (
                        <div className="mt-3 grid grid-cols-3 gap-2">
                          <div className="bg-dark-600 p-2 rounded">
                            <div className="text-xs text-gray-400">Batting</div>
                            <div className="font-bold text-primary-500">
                              {formatNumber(r.display_batting)}
                              {isLive && r.live_delta_batting !== 0 && (
                                <span className={`ml-1 text-xs ${r.live_delta_batting < 0 ? "text-red-400" : "text-green-400"}`}>
                                  {r.live_delta_batting < 0 ? "" : "+"}{formatNumber(r.live_delta_batting)}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="bg-dark-600 p-2 rounded">
                            <div className="text-xs text-gray-400">Bowling</div>
                            <div className="font-bold text-primary-500">
                              {formatNumber(r.display_bowling)}
                              {isLive && r.live_delta_bowling !== 0 && (
                                <span className={`ml-1 text-xs ${r.live_delta_bowling < 0 ? "text-red-400" : "text-green-400"}`}>
                                  {r.live_delta_bowling < 0 ? "" : "+"}{formatNumber(r.live_delta_bowling)}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="bg-dark-600 p-2 rounded">
                            <div className="text-xs text-gray-400">Fielding</div>
                            <div className="font-bold text-primary-500">
                              {formatNumber(r.display_fielding)}
                              {isLive && r.live_delta_fielding !== 0 && (
                                <span className={`ml-1 text-xs ${r.live_delta_fielding < 0 ? "text-red-400" : "text-green-400"}`}>
                                  {r.live_delta_fielding < 0 ? "" : "+"}{formatNumber(r.live_delta_fielding)}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="bg-dark-600 p-2 rounded">
                            <div className="text-xs text-gray-400">Bonus</div>
                            <div className="font-bold text-primary-500">
                              {formatNumber(r.display_bonus)}
                              {isLive && r.live_delta_bonus !== 0 && (
                                <span className={`ml-1 text-xs ${r.live_delta_bonus < 0 ? "text-red-400" : "text-green-400"}`}>
                                  {r.live_delta_bonus < 0 ? "" : "+"}{formatNumber(r.live_delta_bonus)}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="bg-dark-600 p-2 rounded">
                            <div className="text-xs text-gray-400">Appearances</div>
                            <div className="font-bold text-primary-500">{r.appearances}</div>
                          </div>
                          <div className="bg-dark-600 p-2 rounded">
                            <div className="text-xs text-gray-400">Subs Left</div>
                            <div className="font-bold text-primary-500">{r.subsRemaining}</div>
                          </div>
                          {Math.abs(breakdownSum - r.display_total) > 0.01 && (
                            <div className="col-span-3 bg-yellow-900/30 border border-yellow-600 rounded p-2">
                              <div className="text-xs text-yellow-300">
                                ⚠ Breakdown sum {formatNumber(breakdownSum)} ≠ Total {formatNumber(r.display_total)}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                ))}
              </div>

              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-center text-gray-300 border-b border-gray-600">
                      <th className="py-3 px-4 w-16">#</th>
                      <th className="py-3 px-4">Team</th>
                      <th className="py-3 px-4">Manager</th>
                      <th className="py-3 px-4 text-right">Total</th>
                      <th className="py-3 px-4">Bat / Bowl / Field / Bonus</th>
                    </tr>
                  </thead>
                  <tbody>
                    {processedRows.map((r) => (
                      <React.Fragment key={r.team_id}>
                        <tr
                          className="border-b border-gray-700 hover:bg-dark-500 transition-colors cursor-pointer"
                          onClick={() => navigate(`/team/${r.team_id}`)}
                        >
                          <td className="py-3 px-4 align-top">
                            <div className="flex flex-col items-center">
                              <span>{r.display_rank}</span>
                              {r.display_rank_change !== 0 && (
                                <span className={`text-xs font-bold ${r.display_rank_change > 0 ? "text-green-400" : "text-red-400"}`}>
                                  {r.display_rank_change > 0 ? "▲" : "▼"} {Math.abs(r.display_rank_change)}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-semibold">{r.team_name}</div>
                          </td>
                          <td className="py-3 px-4 text-gray-300">{r.username}</td>
                          <td className="py-3 px-4 text-right font-bold text-primary-500">
                            {formatNumber(r.display_total)}
                            {isLive && (
                              <span className={`ml-1 text-xs ${r.live_delta_total < 0 ? "text-red-400" : "text-green-400"}`}>
                                {r.live_delta_total >= 0 ? "+" : ""}{formatNumber(r.live_delta_total)}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-300">
                            {formatNumber(r.display_batting)}
                            {isLive && r.live_delta_batting !== 0 && <span className={`text-xs ${r.live_delta_batting < 0 ? "text-red-400" : "text-green-400"}`}>{r.live_delta_batting > 0 ? "+" : ""}{formatNumber(r.live_delta_batting)}</span>}
                            {" / "}
                            {formatNumber(r.display_bowling)}
                            {isLive && r.live_delta_bowling !== 0 && <span className={`text-xs ${r.live_delta_bowling < 0 ? "text-red-400" : "text-green-400"}`}>{r.live_delta_bowling > 0 ? "+" : ""}{formatNumber(r.live_delta_bowling)}</span>}
                            {" / "}
                            {formatNumber(r.display_fielding)}
                            {isLive && r.live_delta_fielding !== 0 && <span className={`text-xs ${r.live_delta_fielding < 0 ? "text-red-400" : "text-green-400"}`}>{r.live_delta_fielding > 0 ? "+" : ""}{formatNumber(r.live_delta_fielding)}</span>}
                            {" / "}
                            {formatNumber(r.display_bonus)}
                            {isLive && r.live_delta_bonus !== 0 && <span className={`text-xs ${r.live_delta_bonus < 0 ? "text-red-400" : "text-green-400"}`}>{r.live_delta_bonus > 0 ? "+" : ""}{formatNumber(r.live_delta_bonus)}</span>}
                          </td>
                        </tr>
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