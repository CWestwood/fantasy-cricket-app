import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../utils/supabaseClient";
import { useTeam } from "../context/TeamContext";
import BatIcon from "../assets/icons/bat_white.svg";
import BallIcon from "../assets/icons/ball_white.svg";
import AllrounderIcon from "../assets/icons/allrounder_white.svg";
import WkglovesIcon from "../assets/icons/wkgloves_white.svg";

const formatNumber = (value) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "0";
  }
  const num = Number(value);
  return Number.isInteger(num) ? String(num) : num.toFixed(1);
};

export default function PlayerProfile() {
  const { playerId } = useParams();
  const { tournamentId } = useTeam();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [player, setPlayer] = useState(null);
  const [performances, setPerformances] = useState([]);

  const roleIconMap = {
    batter: BatIcon,
    bowler: BallIcon,
    allrounder: AllrounderIcon,
    wicketkeeper: WkglovesIcon,
  };

  const getRoleIcon = (role) => {
    if (!role) return null;
    const normalized = role.toLowerCase();
    return roleIconMap[normalized] || null;
  };

  useEffect(() => {
    if (!playerId) {
      setError("No player selected.");
      setLoading(false);
      return;
    }
    if (!tournamentId) {
      setLoading(true);
      return;
    }

    async function load() {
      setLoading(true);
      setError("");
      try {
        const { data: playerData, error: playerError } = await supabase
          .from("players")
          .select("id, name, role, team_name")
          .eq("id", playerId)
          .single();

        if (playerError) {
          throw playerError;
        }

        setPlayer(playerData);

        const { data: performanceData, error: performanceError } = await supabase
          .from("player_performance_summary")
          .select(
            "match_id, match_name, match_date, match_status, batting, bowling, fielding, bonus, fantasy_total"
          )
          .eq("player_id", playerId)
          .eq("tournament_id", tournamentId)
          .order("match_date", { ascending: true });
        const uniqueData = performanceData?.filter((item, index, self) =>
          index === self.findIndex((t) => t.match_id === item.match_id)
        );

        if (performanceError) {
          throw performanceError;
        }

        setPerformances(uniqueData || []);
      } catch (err) {
        console.error(err);
        setError(err?.message || "Failed to load player data.");
        setPlayer(null);
        setPerformances([]);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [playerId, tournamentId]);

  const summary = useMemo(() => {
    return performances.reduce(
      (acc, entry) => {
        acc.matches += 1;
        acc.batting += Number(entry.batting) || 0;
        acc.bowling += Number(entry.bowling) || 0;
        acc.fielding += Number(entry.fielding) || 0;
        acc.bonus += Number(entry.bonus) || 0;
        acc.total += Number(entry.fantasy_total) || 0;
        return acc;
      },
      { matches: 0, batting: 0, bowling: 0, fielding: 0, bonus: 0, total: 0 }
    );
  }, [performances]);

  if (!tournamentId) {
    return (
      <div className="min-h-screen bg-dark-500 text-white flex items-center justify-center px-4">
        <div className="text-center space-y-2">
          <p className="text-lg text-gray-300">Select a tournament to view player data.</p>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="px-4 py-2 bg-primary-500 text-black rounded-full"
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-500 text-white pb-20">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <div className="bg-card-light rounded-2xl shadow-card p-4 sm:p-6 space-y-4">
          <div className="relative pt-1 pb-4">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="absolute left-0 top-0 px-3 py-1 rounded-full bg-gray-700 text-sm hover:bg-gray-600"
            >
              ←
            </button>
            <div className="flex flex-col items-center text-center space-y-3">
              <h1 className="text-2xl sm:text-3xl font-bold text-primary-500">
                {player?.name || "Unknown Player"}
              </h1>
              {getRoleIcon(player?.role) ? (
                <div className="flex items-center justify-center gap-0">
                  <img
                    src={getRoleIcon(player?.role)}
                    alt={player?.role || "role"}
                    className="w-8 h-8"
                  />
                  <span className="sr-only">{player?.role || "role"}</span>
                </div>
              ) : null}
            </div>
          </div>
          {error && (
            <div className="text-sm text-red-400">{error}</div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-dark-500 rounded-xl p-4 text-center">
            <div>
              <p className="text-xs text-gray-400">Team</p>
              <p className="font-semibold text-lg">{player?.team_name || "Unknown"}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Matches</p>
              <p className="font-semibold text-lg">{summary.matches}</p>
            </div>         
             
          </div>
          <div className="bg-dark-500 rounded-xl p-4 text-center">
            <p className="text-xs text-gray-400 uppercase tracking-widest">Total Points</p>
            <p className="text-2xl font-bold text-primary-500">{formatNumber(summary.total)}</p>
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-4 gap-3">
            <div className="bg-dark-500 rounded-xl p-3 text-center">
              <p className="text-xs text-gray-400">Batting</p>
              <p className="text-l font-bold text-primary-500">{formatNumber(summary.batting)}</p>
            </div>
            <div className="bg-dark-500 rounded-xl p-3 text-center">
              <p className="text-xs text-gray-400">Bowling</p>
              <p className="text-l font-bold text-primary-500">{formatNumber(summary.bowling)}</p>
            </div>
            <div className="bg-dark-500 rounded-xl p-3 text-center">
              <p className="text-xs text-gray-400">Fielding</p>
              <p className="text-l font-bold text-primary-500">{formatNumber(summary.fielding)}</p>
            </div>
            <div className="bg-dark-500 rounded-xl p-3 text-center">
              <p className="text-xs text-gray-400">Bonus</p>
              <p className="text-l font-bold text-primary-500">{formatNumber(summary.bonus)}</p>
            </div>
          </div>
        </div>

        <div className="bg-card-light rounded-2xl shadow-card p-4 sm:p-6">
          <div className="flex items-center text-center justify-center mb-4">
            <h2 className="text-lg text-center font-bold text-white">Match Scores</h2>
          </div>

          {loading ? (
            <div className="text-center py-8">
              <p className="text-gray-400">Loading performances...</p>
            </div>
          ) : performances.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              No performance data available yet.
            </div>
          ) : (
            <div className="space-y-3">
              {performances.map((match, index) => (
                <div key={`${match.match_id}-${index}`} className="bg-dark-500 rounded-xl p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">{match.match_name || `Match ${index + 1}`}</p>
                      
                    </div>
                    <div className="text-right">
                      <p className="text-xl text-center font-bold text-primary-500">
                        {formatNumber(match.fantasy_total)} pts
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 sm:grid-cols-4 gap-3 mt-3 text-xs">
                    <div className="bg-dark-600 rounded-xl p-2 text-center">
                      <p className="text-gray-400">Batting</p>
                      <p className="text-white font-semibold">{formatNumber(match.batting)}</p>
                    </div>
                    <div className="bg-dark-600 rounded-xl p-2 text-center">
                      <p className="text-gray-400">Bowling</p>
                      <p className="text-white font-semibold">{formatNumber(match.bowling)}</p>
                    </div>
                    <div className="bg-dark-600 rounded-xl p-2 text-center">
                      <p className="text-gray-400">Fielding</p>
                      <p className="text-white font-semibold">{formatNumber(match.fielding)}</p>
                    </div>
                    <div className="bg-dark-600 rounded-xl p-2 text-center">
                      <p className="text-gray-400">Bonus</p>
                      <p className="text-white font-semibold">{formatNumber(match.bonus)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
