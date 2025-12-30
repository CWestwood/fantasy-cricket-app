import React, { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../utils/supabaseClient";
import { useTeam } from "../context/TeamContext";
import { TEAM_COLORS } from "../constants/colors";
import BatIcon from "../assets/icons/bat_white.svg";
import BallIcon from "../assets/icons/ball_white.svg";
import AllrounderIcon from "../assets/icons/allrounder_white.svg";
import WkglovesIcon from "../assets/icons/wkgloves_white.svg";

export default function SubstitutionModal({ isOpen, onClose, selectedPlayers, captain }) {
  const {
    validateTeamComposition,
    validateTeamLimit,
    tournamentId,
    user,
    teamId,
    substitutionsRemaining,
  } = useTeam();

  // For tracking pending substitution
  const [pendingSubstitutionId, setPendingSubstitutionId] = useState(null);

  const [playerToRemove, setPlayerToRemove] = useState(null);
  const [availablePlayers, setAvailablePlayers] = useState([]);
  const [displayedPlayers, setDisplayedPlayers] = useState([]);
  const [playerScores, setPlayerScores] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [displayedCount, setDisplayedCount] = useState(30);
  const [playerToAdd, setPlayerToAdd] = useState(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const scrollContainerRef = useRef(null);

  const playersPerPage = 30;
  const roles = ["Batter", "Bowler", "Allrounder", "Wicketkeeper"];
  const dropdownRef = useRef(null);

  const [filters, setFilters] = useState({
    roles: [],
    search: "",
  });

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

  // Load available players and their performance scores
  useEffect(() => {
    if (!isOpen || !tournamentId || !user?.id) return;

    const loadAvailablePlayers = async () => {
      setLoading(true);
      try {
        // Get all players for the tournament
        const { data: allPlayers, error: playersError } = await supabase
          .from("players")
          .select("*")
          .eq("tournament_id", tournamentId);

        if (playersError) throw playersError;

        // Filter out players already in the team
        const selectedPlayerIds = new Set(selectedPlayers.map((p) => p.id));
        const available = (allPlayers || []).filter(
          (p) => !selectedPlayerIds.has(p.id)
        );

        setAvailablePlayers(available);
        setDisplayedCount(30);
        setError("");

        // Load player performance scores
        if (available.length > 0) {
          const playerIds = available.map((p) => p.id);
          const { data: performanceData, error: perfError } = await supabase
            .from("player_performance_summary")
            .select("player_id, fantasy_total")
            .in("player_id", playerIds)
            .eq("tournament_id", tournamentId);

          if (perfError) console.error("Error loading performance:", perfError);

          const scoreMap = {};
          if (performanceData) {
            performanceData.forEach((row) => {
              if (!scoreMap[row.player_id]) scoreMap[row.player_id] = 0;
              scoreMap[row.player_id] += row.fantasy_total || 0;
            });
          }
          setPlayerScores(scoreMap);
        }
      } catch (err) {
        console.error("Error loading available players:", err);
        setError("Failed to load available players");
      } finally {
        setLoading(false);
      }
    };

    loadAvailablePlayers();
  }, [isOpen, tournamentId, user?.id, selectedPlayers]);

  // Load scores for selected players (player to remove)
  useEffect(() => {
    if (!selectedPlayers.length || !tournamentId) return;

    const loadSelectedPlayerScores = async () => {
      const playerIds = selectedPlayers.map((p) => p.id);
      const { data: performanceData, error: perfError } = await supabase
        .from("player_performance_summary")
        .select("player_id, fantasy_total")
        .in("player_id", playerIds)
        .eq("tournament_id", tournamentId);

      if (perfError) console.error("Error loading selected player scores:", perfError);

      const scoreMap = {};
      if (performanceData) {
        performanceData.forEach((row) => {
          if (!scoreMap[row.player_id]) scoreMap[row.player_id] = 0;
          scoreMap[row.player_id] += row.fantasy_total || 0;
        });
      }
      setPlayerScores((prev) => ({ ...prev, ...scoreMap }));
    };

    loadSelectedPlayerScores();
  }, [selectedPlayers, tournamentId]);

  // Apply filters and infinite scroll
  useEffect(() => {
    let filtered = availablePlayers;

    // Apply role filter
    if (filters.roles.length > 0) {
      filtered = filtered.filter((p) =>
        filters.roles.includes((p.role || "").toLowerCase())
      );
    }

    // Apply search filter
    if (filters.search.trim()) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          (p.name || "").toLowerCase().includes(searchLower) ||
          (p.team_name || "").toLowerCase().includes(searchLower)
      );
    }

    // Show first N players based on displayedCount
    setDisplayedPlayers(filtered.slice(0, displayedCount));
  }, [availablePlayers, filters, displayedCount]);

  // Infinite scroll handler
  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const isNearBottom = scrollHeight - (scrollTop + clientHeight) < 100;

    if (isNearBottom && displayedCount < availablePlayers.length) {
      setDisplayedCount((prev) => Math.min(prev + playersPerPage, availablePlayers.length));
    }
  }, [displayedCount, availablePlayers.length]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showDropdown) return;

    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showDropdown]);

  const handleToggleFilter = (type, value) => {
    setFilters((prev) => {
      if (type === "roles") {
        const updated = prev.roles.includes(value)
          ? prev.roles.filter((r) => r !== value)
          : [...prev.roles, value];
        return { ...prev, roles: updated };
      }
      return prev;
    });
    setDisplayedCount(30);
  };

  const getTeamColor = (teamName) => {
    return TEAM_COLORS[teamName] || "bg-gray-600/70";
  };

  const handleRemovePlayer = (player) => {
    setPlayerToRemove(player);
  };

  const handleAddPlayer = async (newPlayer) => {
    if (!playerToRemove) {
      setError("Please select a player to remove");
      return;
    }

    setError("");

    try {
      // Check if new player is already in the team
      if (selectedPlayers.some((p) => p.id === newPlayer.id)) {
        setError("Player is already in the team");
        return;
      }

      // Build the potential team by removing the old player and adding the new one
      // Note: selectedPlayers may include substituted players, so we just need to ensure
      // the new player isn't already there and the removal/addition is valid
      const potentialTeam = selectedPlayers
        .filter((p) => p.id !== playerToRemove.id)
        .concat(newPlayer);

      // Validate team limits (max 4 players per team)
      const limits = validateTeamLimit(potentialTeam);
      if (!limits.isValid) {
        setError(limits.errors[0]);
        return;
      }

      // The database trigger will handle the final validation when we actually perform the substitution
      // Just proceed to confirmation
      setPlayerToAdd(newPlayer);
      setShowConfirmation(true);
    } catch (err) {
      console.error("Validation error:", err);
      setError(err.message || "Failed to validate substitution");
    }
  };

  const confirmSubstitution = async () => {
    if (!playerToRemove || !playerToAdd) return;

    setShowConfirmation(false);
    setLoading(true);
    setError("");

    try {
      // 1. Insert substitution request into substitutions table
      const { data: substitution, error: insertError } = await supabase
        .from("substitutions")
        .insert({
        
          team_id: teamId,
          tournament_id: tournamentId,
          player_out_id: playerToRemove.id,
          player_in_id: playerToAdd.id,
          status: "pending",
          requested_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (insertError) throw insertError;

      setPendingSubstitutionId(substitution.id);

      // 2. Call backend RPC to process the substitution
      const { error: rpcError } = await supabase.rpc("process_substitution", {
        p_substitution_id: substitution.id,
      });

      if (rpcError) {
        console.error("RPC Error:", rpcError.message);
        throw rpcError;
      }

      // 3. If successful, show success message
      setSuccess(true);
      setPlayerToRemove(null);
      setPlayerToAdd(null);
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 2000);
    } catch (err) {
      console.error("Substitution error:", err);
      setError(err.message || "Failed to request substitution");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  // Can select replacement if we have selected a player to remove and we're not loading
  const canSelectReplacement = !!playerToRemove && !loading;
  const totalAvailable = availablePlayers.filter((p) => {
    if (filters.roles.length > 0) {
      if (!filters.roles.includes((p.role || "").toLowerCase())) return false;
    }
    if (filters.search.trim()) {
      const searchLower = filters.search.toLowerCase();
      if (
        !(
          (p.name || "").toLowerCase().includes(searchLower) ||
          (p.team_name || "").toLowerCase().includes(searchLower)
        )
      )
        return false;
    }
    return true;
  }).length;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-40"
        onClick={onClose}
      />

      {/* Bottom Modal */}
      <div className="fixed bottom-0 left-0 right-0 bg-card-light rounded-t-2xl shadow-card z-50 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-600">
          <h2 className="text-lg sm:text-xl font-bold text-primary-500">
            Make a Substitution
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
            {/* Error/Success Messages */}
            {error && (
              <div className="bg-red-900 bg-opacity-30 border border-red-600 rounded-lg p-3 text-sm text-red-300">
                {error}
              </div>
            )}
            {success && (
              <div className="bg-green-900 bg-opacity-30 border border-green-600 rounded-lg p-3 text-sm text-green-300">
                Substitution processed successfully!
              </div>
            )}

            {/* Select Player to Remove */}
            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-2">
                Player to Remove
              </label>
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setShowDropdown(!showDropdown)}
                  className="w-full px-4 py-3 bg-dark-500 rounded-lg text-left flex items-center justify-between hover:bg-dark-400 transition-colors"
                >
                  <span className="text-white">
                    {playerToRemove
                      ? playerToRemove.name
                      : "Select a player..."}
                  </span>
                  <svg
                    className={`w-5 h-5 text-gray-400 transition-transform ${
                      showDropdown ? "rotate-180" : ""
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 14l-7 7m0 0l-7-7m7 7V3"
                    />
                  </svg>
                </button>

                {/* Dropdown Menu */}
                {showDropdown && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-dark-600 rounded-lg border border-gray-600 shadow-lg z-10 max-h-48 overflow-y-auto">
                    {selectedPlayers.map((player) => (
                      <button
                        key={player.id}
                        onClick={() => {
                          handleRemovePlayer(player);
                          setShowDropdown(false);
                        }}
                        className="w-full px-4 py-2 text-left text-white hover:bg-dark-500 transition-colors flex items-center gap-3 border-b border-gray-700 last:border-b-0"
                      >
                        {getRoleIcon((player.role || "").toLowerCase()) && (
                          <img
                            src={getRoleIcon((player.role || "").toLowerCase())}
                            alt={player.role}
                            className="w-5 h-5 object-contain flex-shrink-0"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate">
                              {player.name}
                              {captain?.id === player.id && (
                                <span className="ml-2 text-yellow-400 text-xs">
                                  (C)
                                </span>
                              )}
                            </span>
                          </div>
                          <p className="text-xs text-gray-400 truncate">
                            {player.team_name}
                          </p>
                        </div>
                        <span className="text-xs font-semibold text-primary-500 flex-shrink-0">
                          {playerScores[player.id] || 0} pts
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Filters */}
            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-2">
                Filter by Role
              </label>
              <div className="flex flex-wrap gap-2">
                {roles.map((role) => {
                  const roleKey = role.toLowerCase();
                  const isActive = filters.roles.includes(roleKey);
                  return (
                    <button
                      key={role}
                      onClick={() => handleToggleFilter("roles", roleKey)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                        isActive
                          ? "bg-primary-500 text-dark-500"
                          : "bg-dark-500 text-gray-300 hover:bg-dark-400"
                      }`}
                    >
                      {role}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Search */}
            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-2">
                Search Player
              </label>
              <input
                type="text"
                placeholder="Player name or team..."
                value={filters.search}
                onChange={(e) => {
                  setFilters((prev) => ({ ...prev, search: e.target.value }));
                  setDisplayedCount(30);
                }}
                className="w-full px-4 py-2 bg-dark-500 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            {/* Available Players List */}
            <div>
              <h3 className="text-sm font-semibold text-gray-300 mb-2">
                Available Players ({totalAvailable})
              </h3>
              {loading && displayedCount === 30 ? (
                <div className="text-center py-4 text-gray-400">
                  Loading players...
                </div>
              ) : displayedPlayers.length === 0 ? (
                <div className="text-center py-4 text-gray-400">
                  No players available
                </div>
              ) : (
                <div
                  ref={scrollContainerRef}
                  onScroll={handleScroll}
                  className="space-y-2 max-h-64 overflow-y-auto"
                >
                  {displayedPlayers.map((player) => (
                    <button
                      key={player.id}
                      onClick={() =>
                        canSelectReplacement && handleAddPlayer(player)
                      }
                      disabled={!canSelectReplacement}
                      className={`w-full p-3 rounded-lg flex items-center gap-3 transition-colors ${
                        getTeamColor(player.team_name)
                      } ${
                        canSelectReplacement
                          ? "hover:opacity-80 cursor-pointer"
                          : "cursor-not-allowed opacity-40"
                      }`}
                    >
                      {getRoleIcon((player.role || "").toLowerCase()) && (
                        <img
                          src={getRoleIcon((player.role || "").toLowerCase())}
                          alt={player.role}
                          className="w-6 h-6 object-contain flex-shrink-0"
                        />
                      )}
                      <div className="flex-1 text-left min-w-0">
                        <p className="font-semibold text-white truncate">
                          {player.name}
                        </p>
                        <p className="text-xs text-gray-200 truncate opacity-90">
                          {player.team_name}
                        </p>
                      </div>
                      <div className="flex flex-col items-end flex-shrink-0">
                        <span className="text-xs font-semibold text-white">
                          {playerScores[player.id] || 0} pts
                        </span>
                        <span className="text-xs text-gray-100 opacity-75">
                          {player.role}
                        </span>
                      </div>
                    </button>
                  ))}
                  {displayedCount < totalAvailable && (
                    <div className="text-center py-2 text-xs text-gray-400">
                      Scroll to load more...
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer Info */}
        <div className="border-t border-gray-600 p-4 sm:p-6 bg-dark-600">
          <p className="text-xs sm:text-sm text-gray-400 text-center">
            {playerToRemove ? (
              <>
                Select a player from the list to replace{" "}
                <span className="font-semibold text-white">
                  {playerToRemove.name}
                </span>
              </>
            ) : (
              "Select a player to remove first"
            )}
          </p>
        </div>
      </div>

      {/* Confirmation Modal Overlay */}
      {showConfirmation && (
        <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex items-end sm:items-center justify-center">
          <div className="bg-card-light rounded-t-2xl sm:rounded-2xl shadow-card w-full sm:w-96 z-51">
            {/* Confirmation Header */}
            <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-600">
              <h3 className="text-lg sm:text-xl font-bold text-primary-500">
                Confirm Substitution
              </h3>
              <button
                onClick={() => setShowConfirmation(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Confirmation Content */}
            <div className="p-4 sm:p-6 space-y-4">
              {/* Player Being Removed */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase mb-2">
                  Removing
                </p>
                <div className="bg-dark-500 rounded-lg p-3 flex items-center gap-3">
                  {getRoleIcon((playerToRemove?.role || "").toLowerCase()) && (
                    <img
                      src={getRoleIcon((playerToRemove?.role || "").toLowerCase())}
                      alt={playerToRemove?.role}
                      className="w-6 h-6 object-contain flex-shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white truncate">
                      {playerToRemove?.name}
                    </p>
                    <p className="text-xs text-gray-400 truncate">
                      {playerToRemove?.team_name}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-semibold text-primary-500">
                      {playerScores[playerToRemove?.id] || 0} pts
                    </p>
                    {captain?.id === playerToRemove?.id && (
                      <p className="text-xs text-yellow-400">Captain</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Arrow Down */}
              <div className="flex justify-center">
                <svg
                  className="w-6 h-6 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 14l-7 7m0 0l-7-7m7 7V3"
                  />
                </svg>
              </div>

              {/* Player Being Added */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase mb-2">
                  Adding
                </p>
                <div
                  className={`${getTeamColor(
                    playerToAdd?.team_name
                  )} rounded-lg p-3 flex items-center gap-3`}
                >
                  {getRoleIcon((playerToAdd?.role || "").toLowerCase()) && (
                    <img
                      src={getRoleIcon((playerToAdd?.role || "").toLowerCase())}
                      alt={playerToAdd?.role}
                      className="w-6 h-6 object-contain flex-shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white truncate">
                      {playerToAdd?.name}
                    </p>
                    <p className="text-xs text-gray-200 truncate opacity-90">
                      {playerToAdd?.team_name}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-semibold text-white">
                      {playerScores[playerToAdd?.id] || 0} pts
                    </p>
                    {captain?.id === playerToRemove?.id && (
                      <p className="text-xs text-yellow-400">→ Captain</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Confirmation Actions */}
            <div className="border-t border-gray-600 p-4 sm:p-6 bg-dark-600 flex gap-3">
              <button
                onClick={() => {
                  setShowConfirmation(false);
                  setPlayerToAdd(null);
                }}
                disabled={loading}
                className="flex-1 px-4 py-2 rounded-full bg-dark-500 hover:bg-dark-400 text-white font-semibold transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmSubstitution}
                disabled={loading}
                className="flex-1 px-4 py-2 rounded-full bg-primary-500 hover:bg-primary-600 text-dark-500 font-semibold transition-colors disabled:opacity-50"
              >
                {loading ? "Substituting..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
