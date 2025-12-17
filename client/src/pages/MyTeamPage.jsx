import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { TEAM_COLORS } from "../constants/colors";
import { useTeam } from "../context/TeamContext";
import { supabase } from "../utils/supabaseClient";
import BatIcon from "../assets/icons/bat_white.svg";
import BallIcon from "../assets/icons/ball_white.svg";
import AllrounderIcon from "../assets/icons/allrounder_white.svg";
import WkglovesIcon from "../assets/icons/wkgloves_white.svg";
import SubstitutionModal from "../components/SubstitutionModal";

export default function MyTeamPage() {
  const {
    selectedPlayers,
    captain,
    teamName,
    username,
    tournamentId,
    teamId,
    substitutionsRemaining,
  } = useTeam();

  const navigate = useNavigate();

  const [leaderboardPosition, setLeaderboardPosition] = useState(null);
  const [expandedPlayerId, setExpandedPlayerId] = useState(null);
  const [playerScores, setPlayerScores] = useState({});
  const [isSubstitutionModalOpen, setIsSubstitutionModalOpen] = useState(false);

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

  // Fetch player performance data from materialized view
  useEffect(() => {
    if (!selectedPlayers || selectedPlayers.length === 0 || !tournamentId || !teamId) return;

    async function fetchPlayerPerformance() {
      try {
        const playerIds = selectedPlayers.map((p) => p.id);
        const { data, error } = await supabase
          .from("player_performance_summary")
          .select("player_id, batting, bowling, fielding, bonus, fantasy_total")
          .in("player_id", playerIds)
          .eq("tournament_id", tournamentId)
          .eq("team_id", teamId);

        if (error) {
          console.error("Error fetching player performance:", error);
          return;
        }

        // Aggregate scores by player_id (sum all matches)
        const scoreMap = {};
        if (data) {
          data.forEach((row) => {
            if (!scoreMap[row.player_id]) {
              scoreMap[row.player_id] = {
                batting: 0,
                bowling: 0,
                fielding: 0,
                bonus: 0,
                total: 0,
              };
            }
            scoreMap[row.player_id].batting += row.batting || 0;
            scoreMap[row.player_id].bowling += row.bowling || 0;
            scoreMap[row.player_id].fielding += row.fielding || 0;
            scoreMap[row.player_id].bonus += row.bonus || 0;
            scoreMap[row.player_id].total += row.fantasy_total || 0;
          });
        }
        setPlayerScores(scoreMap);
      } catch (e) {
        console.error("Exception fetching player performance:", e);
      }
    }

    fetchPlayerPerformance();
  }, [selectedPlayers, tournamentId, teamId]);

  // Fetch leaderboard position
  useEffect(() => {
    if (!teamId || !tournamentId) return;

    async function fetchLeaderboardPosition() {
      try {
        const { data, error } = await supabase
          .from("tournament_leaderboard_cache")
          .select("rank_position")
          .eq("team_id", teamId)
          .eq("tournament_id", tournamentId)
          .single();

        if (error) {
          console.error("Error fetching leaderboard position:", error);
          return;
        }

        if (data) {
          setLeaderboardPosition(data.rank_position);
        }
      } catch (e) {
        console.error("Exception fetching leaderboard position:", e);
      }
    }

    fetchLeaderboardPosition();
  }, [teamId, tournamentId]);

  // Calculate total points from actual player scores
  const totalPoints = selectedPlayers.reduce((sum, p) => {
    return sum + (playerScores[p.id]?.total || 0);
  }, 0);

  // Separate and sort players: active first (sorted by captain), then substituted out
  const activePlayers = selectedPlayers.filter(p => !p.is_substituted);
  const substitutedOutPlayers = selectedPlayers.filter(p => p.is_substituted);

  const sortedActivePlayers = [...activePlayers].sort((a, b) => {
    if (captain?.id === a.id) return -1;
    if (captain?.id === b.id) return 1;
    return 0;
  });

  const sortedPlayers = [...sortedActivePlayers, ...substitutedOutPlayers];

  const goToPlayerProfile = (event, playerId) => {
    event.stopPropagation();
    if (!playerId) return;
    navigate(`/player/${playerId}`);
  };

  return (
    <div className="min-h-screen bg-dark-500 text-white py-4 md:py-8">
      <div className="max-w-6xl mx-auto px-3 sm:px-4 space-y-4 md:space-y-6">
        {/* Header Section */}
        <div className="bg-card-light rounded-2xl shadow-card p-4 sm:p-6">
          {/* Team Info */}
          <div className="mb-4 sm:mb-6">
            <h1 className="text-2xl sm:text-3xl font-bold text-primary-500 mb-1 sm:mb-2">
              {teamName || "Your Team"}
            </h1>
            <p className="text-sm sm:text-base text-gray-300">Manager: {username || "Your Name"}</p>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
            {/* Leaderboard Position */}
            <div className="flex flex-col items-center justify-center bg-dark-500 rounded-lg p-3 sm:p-4">
              <div className="text-3xl sm:text-5xl font-bold text-primary-500 mb-1 sm:mb-2">
                {leaderboardPosition ? `#${leaderboardPosition}` : "—"}
              </div>
              <p className="text-xs sm:text-sm text-gray-400 text-center">Leaderboard</p>
            </div>

            {/* Total Points */}
            <div className="flex flex-col items-center justify-center bg-dark-500 rounded-lg p-3 sm:p-4">
              <div className="text-3xl sm:text-5xl font-bold text-primary-500 mb-1 sm:mb-2">
                {totalPoints}
              </div>
              <p className="text-xs sm:text-sm text-gray-400 text-center">Points</p>
            </div>

            {/* Substitutions Left */}
            <div className="flex flex-col items-center justify-center bg-dark-500 rounded-lg p-3 sm:p-4">
              <p className="text-3xl sm:text-5xl font-bold text-primary-500 mb-1 sm:mb-2">{substitutionsRemaining}</p>
              <p className="text-xs sm:text-sm text-gray-400 text-center">Subs Left</p>
            </div>

            {/* Players Selected */}
            <div className="flex flex-col items-center justify-center bg-dark-500 rounded-lg p-3 sm:p-4">
              <p className="text-3xl sm:text-5xl font-bold text-primary-500 mb-1 sm:mb-2">{selectedPlayers.length}/11</p>
              <p className="text-xs sm:text-sm text-gray-400 text-center">Selected</p>
            </div>
          </div>

        
        </div>

          {/* Selected Players List */}
        <div className="bg-card-light rounded-2xl shadow-card p-4 sm:p-6">
          <h2 className="text-lg sm:text-xl font-bold text-primary-500 mb-3 sm:mb-4">
            Players
          </h2>

          {selectedPlayers.length === 0 ? (
            <div className="text-center py-6 sm:py-8">
              <p className="text-gray-400">No players selected yet</p>
            </div>
          ) : (
            <div className="space-y-2 sm:overflow-x-auto">
              {/* Mobile Card View */}
              <div className="sm:hidden space-y-2">
                {sortedPlayers.map((player) => (
                  <div
                    key={player.id}
                    className={`${player.is_substituted ? "bg-gray-600" : "bg-dark-500"} rounded-lg overflow-hidden`}
                  >
                    <button
                      onClick={() => setExpandedPlayerId(expandedPlayerId === player.id ? null : player.id)}
                      className={`w-full p-3 flex items-center justify-between gap-2 ${player.is_substituted ? "hover:bg-gray-500" : "hover:bg-dark-400"} transition-colors`}
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <div className="flex-shrink-0">
                          {getRoleIcon((player.role || "").toLowerCase()) && (
                            <img
                              src={getRoleIcon((player.role || "").toLowerCase())}
                              alt={player.role}
                              title={player.role}
                              className={`w-8 h-8 object-contain ${player.is_substituted ? "opacity-50" : ""}`}
                            />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={(e) => goToPlayerProfile(e, player.id)}
                              className={`text-sm font-semibold truncate text-left focus:outline-none ${
                                player.is_substituted 
                                  ? "text-gray-400" 
                                  : captain?.id === player.id 
                                    ? "text-yellow-400" 
                                    : "text-white"
                              }`}
                            >
                              {player.name}
                            </button>
                            {!player.is_substituted && (
                              <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M3.293 9.707a1 1 0 010-1.414l6-6a1 1 0 111.414 1.414L5.414 9l5.293 5.293a1 1 0 01-1.414 1.414l-6-6z" clipRule="evenodd" />
                              </svg>
                            )}
                            {player.is_substituted && (
                              <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 10.293a1 1 0 010 1.414l-6 6a1 1 0 11-1.414-1.414L14.586 11l-5.293-5.293a1 1 0 011.414-1.414l6 6z" clipRule="evenodd" />
                              </svg>
                            )}
                          </div>
                          <p className={`text-xs ${player.is_substituted ? "text-gray-500" : "text-gray-400"} truncate`}>
                            {player.team_name || "Unknown"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <p className={`text-sm font-bold ${player.is_substituted ? "text-gray-400" : "text-primary-500"}`}>
                          {playerScores[player.id]?.total || 0}
                        </p>
                        <svg
                          className={`w-4 h-4 ${player.is_substituted ? "text-gray-500" : "text-gray-400"} transition-transform ${
                            expandedPlayerId === player.id ? "rotate-180" : ""
                          }`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                        </svg>
                      </div>
                    </button>

                    {/* Expanded Score Breakdown */}
                    {expandedPlayerId === player.id && (
                      <div className={`border-t ${player.is_substituted ? "border-gray-600 bg-gray-700" : "border-gray-600 bg-dark-600"} p-3 space-y-2`}>
                        <div className="grid grid-cols-2 gap-2">
                          <div className={`${player.is_substituted ? "bg-gray-600" : "bg-dark-500"} rounded p-2`}>
                            <p className={`text-xs ${player.is_substituted ? "text-gray-500" : "text-gray-400"} mb-1`}>Batting</p>
                            <p className={`text-lg font-bold ${player.is_substituted ? "text-gray-400" : "text-primary-500"}`}>
                              {playerScores[player.id]?.batting || 0}
                            </p>
                          </div>
                          <div className={`${player.is_substituted ? "bg-gray-600" : "bg-dark-500"} rounded p-2`}>
                            <p className={`text-xs ${player.is_substituted ? "text-gray-500" : "text-gray-400"} mb-1`}>Bowling</p>
                            <p className={`text-lg font-bold ${player.is_substituted ? "text-gray-400" : "text-primary-500"}`}>
                              {playerScores[player.id]?.bowling || 0}
                            </p>
                          </div>
                          <div className={`${player.is_substituted ? "bg-gray-600" : "bg-dark-500"} rounded p-2`}>
                            <p className={`text-xs ${player.is_substituted ? "text-gray-500" : "text-gray-400"} mb-1`}>Fielding</p>
                            <p className={`text-lg font-bold ${player.is_substituted ? "text-gray-400" : "text-primary-500"}`}>
                              {playerScores[player.id]?.fielding || 0}
                            </p>
                          </div>
                          <div className={`${player.is_substituted ? "bg-gray-600" : "bg-dark-500"} rounded p-2`}>
                            <p className={`text-xs ${player.is_substituted ? "text-gray-500" : "text-gray-400"} mb-1`}>Bonus</p>
                            <p className={`text-lg font-bold ${player.is_substituted ? "text-gray-400" : "text-primary-500"}`}> </p>
                            <p className="text-lg font-bold text-primary-500">
                              {playerScores[player.id]?.bonus || 0}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Desktop Table View */}
              <table className="w-full hidden sm:table">
                <thead>
                  <tr className="border-b border-gray-600">
                    <th className="text-left py-3 px-4 font-semibold text-gray-300">
                      Player
                    </th>
                    <th className="text-center py-3 px-4 font-semibold text-gray-300">
                      Team
                    </th>
                    <th className="text-center py-3 px-4 font-semibold text-gray-300">
                      Points
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPlayers.map((player) => (
                    <React.Fragment key={player.id}>
                      <tr
                        onClick={() => setExpandedPlayerId(expandedPlayerId === player.id ? null : player.id)}
                        className={`border-b ${player.is_substituted ? "bg-gray-700 hover:bg-gray-600" : "border-gray-700 hover:bg-dark-500"} transition-colors cursor-pointer`}
                      >
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="flex items-center justify-center flex-shrink-0">
                              {getRoleIcon((player.role || "").toLowerCase()) && (
                                <img
                                  src={getRoleIcon((player.role || "").toLowerCase())}
                                  alt={player.role}
                                  title={player.role}
                                  className={`w-10 h-10 object-contain ${player.is_substituted ? "opacity-50" : ""}`}
                                />
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={(e) => goToPlayerProfile(e, player.id)}
                                className={`font-semibold focus:outline-none ${
                                  player.is_substituted
                                    ? "text-gray-400"
                                    : captain?.id === player.id
                                      ? "text-yellow-400"
                                      : "text-white"
                                }`}
                              >
                                {player.name}
                              </button>
                              {!player.is_substituted && (
                                <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M3.293 9.707a1 1 0 010-1.414l6-6a1 1 0 111.414 1.414L5.414 9l5.293 5.293a1 1 0 01-1.414 1.414l-6-6z" clipRule="evenodd" />
                                </svg>
                              )}
                              {player.is_substituted && (
                                <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 10.293a1 1 0 010 1.414l-6 6a1 1 0 11-1.414-1.414L14.586 11l-5.293-5.293a1 1 0 011.414-1.414l6 6z" clipRule="evenodd" />
                                </svg>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`text-sm ${player.is_substituted ? "text-gray-500" : "text-gray-300"}`}>
                            {player.team_name || "Unknown"}
                          </span>
                        </td>
                        <td className={`py-3 px-4 text-center text-lg font-bold ${player.is_substituted ? "text-gray-400" : "text-primary-500"}`}>
                          {playerScores[player.id]?.total || 0}
                        </td>
                      </tr>
                      {expandedPlayerId === player.id && (
                        <tr className={`border-b ${player.is_substituted ? "bg-gray-600" : "bg-dark-600"} ${player.is_substituted ? "border-gray-600" : "border-gray-700"}`}>
                          <td colSpan="3" className="py-4 px-4">
                            <div className="grid grid-cols-4 gap-4 max-w-md">
                              <div className={`${player.is_substituted ? "bg-gray-700" : "bg-dark-500"} rounded-lg p-3 text-center`}>
                                <p className={`text-sm mb-2 ${player.is_substituted ? "text-gray-500" : "text-gray-400"}`}>Batting</p>
                                <p className={`text-2xl font-bold ${player.is_substituted ? "text-gray-400" : "text-primary-500"}`}>
                                  {playerScores[player.id]?.batting || 0}
                                </p>
                              </div>
                              <div className={`${player.is_substituted ? "bg-gray-700" : "bg-dark-500"} rounded-lg p-3 text-center`}>
                                <p className={`text-sm mb-2 ${player.is_substituted ? "text-gray-500" : "text-gray-400"}`}>Bowling</p>
                                <p className={`text-2xl font-bold ${player.is_substituted ? "text-gray-400" : "text-primary-500"}`}>
                                  {playerScores[player.id]?.bowling || 0}
                                </p>
                              </div>
                              <div className={`${player.is_substituted ? "bg-gray-700" : "bg-dark-500"} rounded-lg p-3 text-center`}>
                                <p className={`text-sm mb-2 ${player.is_substituted ? "text-gray-500" : "text-gray-400"}`}>Fielding</p>
                                <p className={`text-2xl font-bold ${player.is_substituted ? "text-gray-400" : "text-primary-500"}`}>
                                  {playerScores[player.id]?.fielding || 0}
                                </p>
                              </div>
                              <div className={`${player.is_substituted ? "bg-gray-700" : "bg-dark-500"} rounded-lg p-3 text-center`}>
                                <p className={`text-sm mb-2 ${player.is_substituted ? "text-gray-500" : "text-gray-400"}`}>Bonus</p>
                                <p className={`text-2xl font-bold ${player.is_substituted ? "text-gray-400" : "text-primary-500"}`}>
                                  {playerScores[player.id]?.bonus || 0}
                                </p>
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
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center sm:justify-end">
          <button
            onClick={() => setIsSubstitutionModalOpen(true)}
            disabled={substitutionsRemaining === 0}
            className={`px-4 sm:px-6 py-2 sm:py-3 rounded-full text-black text-sm sm:text-base font-semibold transition-colors ${
              substitutionsRemaining === 0
                ? "bg-gray-500 cursor-not-allowed opacity-50"
                : "bg-primary-500 hover:bg-primary-600"
            }`}
          >
            Make Substitution
          </button>
        </div>

        {/* Substitution Modal */}
        <SubstitutionModal
          isOpen={isSubstitutionModalOpen}
          onClose={() => setIsSubstitutionModalOpen(false)}
          selectedPlayers={selectedPlayers}
          captain={captain}
        />
      </div>
    </div>
  );
}
