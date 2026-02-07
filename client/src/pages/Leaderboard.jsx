import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../utils/supabaseClient";
import { useTeam } from "../context/TeamContext";

export default function Leaderboard() {
  const { tournamentId } = useTeam();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);
  const [expandedTeam, setExpandedTeam] = useState(null);
  const [isLive, setIsLive] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [liveScores, setLiveScores] = useState({});

  useEffect(() => {
    console.debug("Leaderboard: useEffect tournamentId ->", tournamentId);
    if (!tournamentId) return;
    fetchLeaderboard();
    fetchLiveScores();

    // Subscribe to live score updates
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
        () => {
          fetchLiveScores();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId]);

  async function fetchLeaderboard() {
    setError("");
    setLoading(true);
    try {
      const res = await supabase.rpc("get_leaderboard", { p_tournament_id: tournamentId });

      console.debug("Leaderboard: rpc response ->", res);

      if (res.error) {
        console.error("RPC error", res.error);
        setError(String(res.error.message || res.error));
        setRows([]);
      } else {
        setRows(res.data || []);
        setLastUpdated(new Date());
      }
    } catch (e) {
      console.error(e);
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
        .select("team_id, total, batting, bowling, fielding, bonus")
        .eq("tournament_id", tournamentId);

      if (error) {
        console.error("Error fetching live scores:", error);
        return;
      }

      const aggregated = {};
      if (data) {
        data.forEach((row) => {
          if (!aggregated[row.team_id]) {
            aggregated[row.team_id] = {
              total: 0,
              batting: 0,
              bowling: 0,
              fielding: 0,
              bonus: 0,
            };
          }
          aggregated[row.team_id].total += Number(row.total) || 0;
          aggregated[row.team_id].batting += Number(row.batting) || 0;
          aggregated[row.team_id].bowling += Number(row.bowling) || 0;
          aggregated[row.team_id].fielding += Number(row.fielding) || 0;
          aggregated[row.team_id].bonus += Number(row.bonus) || 0;
        });
      }
      setLiveScores(aggregated);
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

    let data = rows.map((row) => {
      const live = liveScores[row.team_id] || {
        total: 0,
        batting: 0,
        bowling: 0,
        fielding: 0,
        bonus: 0,
      };

      if (!isLive) {
        return {
          ...row,
          display_total: Number(row.total),
          display_batting: Number(row.batting_total),
          display_bowling: Number(row.bowling_total),
          display_fielding: Number(row.fielding_total),
          display_bonus: Number(row.bonus_total),
          live_delta_total: 0,
          live_delta_batting: 0,
          live_delta_bowling: 0,
          live_delta_fielding: 0,
          live_delta_bonus: 0,
          display_rank: row.rank_position,
        };
      }

      return {
        ...row,
        display_total: Number(row.total) + live.total,
        display_batting: Number(row.batting_total) + live.batting,
        display_bowling: Number(row.bowling_total) + live.bowling,
        display_fielding: Number(row.fielding_total) + live.fielding,
        display_bonus: Number(row.bonus_total) + live.bonus,
        live_delta_total: live.total,
        live_delta_batting: live.batting,
        live_delta_bowling: live.bowling,
        live_delta_fielding: live.fielding,
        live_delta_bonus: live.bonus,
      };
    });

    if (isLive) {
      data.sort((a, b) => b.display_total - a.display_total);
      data = data.map((row, index) => ({
        ...row,
        display_rank: index + 1,
      }));
    } else {
      data.sort((a, b) => a.rank_position - b.rank_position);
    }

    return data;
  }, [rows, liveScores, isLive]);

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
              <h1 className=" text-center text-2xl sm:text-3xl font-bold text-primary-500">Leaderboard</h1>
              {lastUpdated && (
                <p className="text-center text-sm text-gray-400 mt-1">Updated {lastUpdated.toLocaleTimeString()}</p>
              )}
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-300">Live</span>
                <button
                  onClick={() => setIsLive(!isLive)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    isLive ? "bg-primary-500" : "bg-gray-600"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      isLive ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
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
                        <div className="text-primary-500 font-bold text-lg">#{r.display_rank}</div>
                        <div className="flex-1 text-center">
                          <div className="font-semibold">{r.team_name}</div>
                          <div className="text-xs text-gray-400">{r.username}</div>
                        </div>
                        <div className="flex items-center gap-5">
                          <div className="text-right">
                            <div className="font-bold text-primary-500">
                              {formatNumber(r.display_total)}
                              {isLive && r.live_delta_total >= 0 && (
                                <span className="ml-1 text-xs text-green-400">+{formatNumber(r.live_delta_total)}</span>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedTeam(expandedTeam === r.team_id ? null : r.team_id);
                            }}
                            className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-700 hover:bg-gray-600 transition-colors"
                          >
                            <svg
                              className={`w-4 h-4 text-gray-300 transition-transform ${
                                expandedTeam === r.team_id ? "rotate-180" : ""
                              }`}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
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
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <div className="bg-dark-600 p-2 rounded">
                            <div className="text-xs text-gray-400">Batting</div>
                            <div className="font-bold text-primary-500">
                              {formatNumber(r.display_batting)}
                              {isLive && r.live_delta_batting !== 0 && <span className={`ml-1 text-xs ${r.live_delta_batting < 0 ? "text-red-400" : "text-green-400"}`}>{r.live_delta_batting > 0 ? "+" : ""}{formatNumber(r.live_delta_batting)}</span>}
                            </div>
                          </div>
                          <div className="bg-dark-600 p-2 rounded">
                            <div className="text-xs text-gray-400">Bowling</div>
                            <div className="font-bold text-primary-500">
                              {formatNumber(r.display_bowling)}
                              {isLive && r.live_delta_bowling !== 0 && <span className={`ml-1 text-xs ${r.live_delta_bowling < 0 ? "text-red-400" : "text-green-400"}`}>{r.live_delta_bowling > 0 ? "+" : ""}{formatNumber(r.live_delta_bowling)}</span>}
                            </div>
                          </div>
                          <div className="bg-dark-600 p-2 rounded">
                            <div className="text-xs text-gray-400">Fielding</div>
                            <div className="font-bold text-primary-500">
                              {formatNumber(r.display_fielding)}
                              {isLive && r.live_delta_fielding !== 0 && <span className={`ml-1 text-xs ${r.live_delta_fielding < 0 ? "text-red-400" : "text-green-400"}`}>{r.live_delta_fielding > 0 ? "+" : ""}{formatNumber(r.live_delta_fielding)}</span>}
                            </div>
                          </div>
                          <div className="bg-dark-600 p-2 rounded">
                            <div className="text-xs text-gray-400">Bonus</div>
                            <div className="font-bold text-primary-500">
                              {formatNumber(r.display_bonus)}
                              {isLive && r.live_delta_bonus !== 0 && <span className={`ml-1 text-xs ${r.live_delta_bonus < 0 ? "text-red-400" : "text-green-400"}`}>{r.live_delta_bonus > 0 ? "+" : ""}{formatNumber(r.live_delta_bonus)}</span>}
                            </div>
                          </div>
                          {Math.abs(breakdownSum - r.display_total) > 0.01 && (
                            <div className="col-span-2 bg-yellow-900/30 border border-yellow-600 rounded p-2">
                              <div className="text-xs text-yellow-300">⚠ Breakdown sum {formatNumber(breakdownSum)} ≠ Total {formatNumber(r.display_total)}</div>
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
                        <tr className="border-b border-gray-700 hover:bg-dark-500 transition-colors cursor-pointer" onClick={() => navigate(`/team/${r.team_id}`)}>
                          <td className="py-3 px-4 align-top">{r.display_rank}</td>
                          <td className="py-3 px-4">
                            <div className="font-semibold">{r.team_name}</div>
                          </td>
                          <td className="py-3 px-4 text-gray-300">{r.username}</td>
                          <td className="py-3 px-4 text-right font-bold text-primary-500">
                            {formatNumber(r.display_total)}
                            {isLive && <span className={`ml-1 text-xs ${r.live_delta_total < 0 ? "text-red-400" : "text-green-400"}`}>{r.live_delta_total >= 0 ? "+" : ""}{formatNumber(r.live_delta_total)}</span>}
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-300">
                            {formatNumber(r.display_batting)}{isLive && r.live_delta_batting !== 0 && <span className={`text-xs ${r.live_delta_batting < 0 ? "text-red-400" : "text-green-400"}`}>{r.live_delta_batting > 0 ? "+" : ""}{formatNumber(r.live_delta_batting)}</span>} / {formatNumber(r.display_bowling)}{isLive && r.live_delta_bowling !== 0 && <span className={`text-xs ${r.live_delta_bowling < 0 ? "text-red-400" : "text-green-400"}`}>{r.live_delta_bowling > 0 ? "+" : ""}{formatNumber(r.live_delta_bowling)}</span>} / {formatNumber(r.display_fielding)}{isLive && r.live_delta_fielding !== 0 && <span className={`text-xs ${r.live_delta_fielding < 0 ? "text-red-400" : "text-green-400"}`}>{r.live_delta_fielding > 0 ? "+" : ""}{formatNumber(r.live_delta_fielding)}</span>} / {formatNumber(r.display_bonus)}{isLive && r.live_delta_bonus !== 0 && <span className={`text-xs ${r.live_delta_bonus < 0 ? "text-red-400" : "text-green-400"}`}>{r.live_delta_bonus > 0 ? "+" : ""}{formatNumber(r.live_delta_bonus)}</span>}
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
