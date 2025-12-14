  // Remove unused import (useMemo, useState for isFiltering)
import React, { useEffect, useState, useRef } from "react";
import { TEAM_COLORS } from "../constants/colors";
import { useTeam } from "../contexts/TeamContext";
import { supabase } from "../utils/supabaseClient";
import { containsProfanity, sanitizeName } from "../utils/profanity";
import BatIcon from "../assets/icons/bat_white.svg";
import BallIcon from "../assets/icons/ball_white.svg";
import AllrounderIcon from "../assets/icons/allrounder_white.svg";
import WkglovesIcon from "../assets/icons/wkgloves_white.svg";
export default function TeamSelection() {
  const [availablePlayers, setAvailablePlayers] = useState([]);
  const [displayedPlayers, setDisplayedPlayers] = useState([]);
  const [showSuccess, setShowSuccess] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  const playersPerPage = 40;
  const roles = ["Batter", "Bowler", "Allrounder", "Wicketkeeper"];
  
  const [filters, setFilters] = useState({
    roles: [],
    teams: [],
    search: "",
  });
  const [showTeamsDropdown, setShowTeamsDropdown] = useState(false);
  
  const teamsDropdownRef = useRef(null);
  const rpcCacheRef = useRef({ checked: false, rpcName: null });
  const [allTeams, setAllTeams] = useState([]);

  const {
    selectedPlayers,
    handlePlayerSelection,
    captain,
    setCaptain,
    teamName,
    setTeamName,
    validateTeamComposition,
    validateTeamLimit,
    saveTeam,
    user,
    tournamentId,
    username,
    setUsername,
  } = useTeam();

  // Load all teams upfront (independent of player pagination)
  useEffect(() => {
    const loadAllTeams = async () => {
      try {
        const { data, error } = await supabase
          .from("players")
          .select("team_name")
          .eq("tournament_id", tournamentId)
          .not("team_name", "is", null);
        
        if (!error && data) {
          const uniqueTeamList = [...new Set(data.map((p) => p.team_name))].sort();
          setAllTeams(uniqueTeamList);
          console.log("Loaded all teams:", uniqueTeamList);
        }
      } catch (err) {
        console.error("Error loading teams:", err);
      }
    };

    if (tournamentId) {
      loadAllTeams();
    }
  }, [tournamentId]);

  // Load available players from Supabase (only on initial mount or when tournament changes)
  useEffect(() => {
    const loadPlayers = async () => {
      if (!tournamentId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const rpcParams = {
          p_tournament_id: tournamentId,
          p_user_id: user?.id,
          p_stage: "group",
          p_search: null, // Don't use search in RPC - we'll filter client-side
          p_roles: null,  // Don't use roles in RPC - we'll filter client-side
          p_countries: null, // Don't use countries in RPC - we'll filter client-side
          p_limit: 400, // Fetch up to 400 players
          p_offset: 0,
        };

        // Helper to call a named RPC and normalize errors
        const callRpc = async (name) => {
          try {
            const res = await supabase.rpc(name, { ...rpcParams });
            return res.error ? { error: res.error } : res;
          } catch (e) {
            return { error: e };
          }
        };

        // Detect and use cached RPC, or determine if RPCs are available
        let rpcResult = null;
        if (!rpcCacheRef.current.checked) {
          console.log("Detecting available player RPCs...");
          const tryGeneric = await callRpc("get_available_players");
          if (!tryGeneric.error) {
            rpcCacheRef.current = { checked: true, rpcName: "get_available_players" };
            rpcResult = tryGeneric;
            console.log("Detected RPC: get_available_players");
          } else {
            rpcCacheRef.current = { checked: true, rpcName: null };
            console.warn("get_available_players not found; will use direct players table query.");
          }
        } else if (rpcCacheRef.current.rpcName) {
          const cached = await callRpc(rpcCacheRef.current.rpcName);
          if (!cached.error) {
            rpcResult = cached;
            console.log(`Using cached RPC ${rpcCacheRef.current.rpcName}`);
          } else {
            console.warn(`Cached RPC ${rpcCacheRef.current.rpcName} failed; falling back to table query.`);
            rpcCacheRef.current = { checked: true, rpcName: null };
          }
        } else {
          console.log("Skipping RPCs; previously detected none available.");
        }

        if (rpcResult && !rpcResult.error) {
          const { data } = rpcResult;
          console.log(`RPC returned ${data?.length || 0} players`);
          // Keep original id for database FK, but ensure player_id is available
          const players = (data || []).map((p) => ({
            ...p,
            id: p.player_id || p.id,  // Use player_id from RPC, fallback to id
          }));
          setAvailablePlayers(players);
          setError("");
          setLoading(false);
          return;
        }
      } catch (error) {
        console.log("RPC error loading players:", error);
      }
      
      // Fallback: Direct query to players table
      try {
        console.log("Attempting fallback direct query to players table...");
        const { data: fallbackData, error: fallbackError } = await supabase
          .from("players")
          .select("id, name, team_name, role, country_name")
          .eq("tournament_id", tournamentId);
        
        if (!fallbackError && fallbackData) {
          console.log("Fallback query succeeded, returned", fallbackData.length, "players");
          // Keep original id for database FK
          const players = fallbackData.map((p) => ({
            ...p,
            id: p.id,  // Use database id for FK
          }));
          setAvailablePlayers(players);
          setError("");
        } else {
          console.error("Fallback query failed:", fallbackError);
          setError("Failed to load players");
        }
      } catch (fbErr) {
        console.error("Error during fallback attempt:", fbErr);
        setError("Failed to load players");
      } finally {
        setLoading(false);
      }
    };

    loadPlayers();
  }, [tournamentId, user?.id]);

// Apply UI filters and pagination client-side against the `availablePlayers` master list
useEffect(() => {
  const search = (filters.search || "").trim().toLowerCase();
  const rolesActive = filters.roles.map((r) => r.toLowerCase());
  const teamsActive = filters.teams.map((t) => t.toLowerCase());

  const filtered = availablePlayers.filter((p) => {
    if (rolesActive.length > 0 && !rolesActive.includes((p.role || "").toLowerCase())) return false;
    if (teamsActive.length > 0 && !teamsActive.includes((p.team_name || "").toLowerCase())) return false;
    if (search && !(p.name || "").toLowerCase().includes(search)) return false;
    return true;
  });

  // Reset to page 1 when filters change
  setCurrentPage(1);
  
  const end = 1 * playersPerPage;
  setDisplayedPlayers(filtered.slice(0, end));
}, [availablePlayers, filters]);

// Close teams dropdown when clicking outside
useEffect(() => {
  const onDocClick = (e) => {
    if (!showTeamsDropdown) return;
    if (teamsDropdownRef.current && !teamsDropdownRef.current.contains(e.target)) {
      setShowTeamsDropdown(false);
    }
  };
  document.addEventListener("click", onDocClick);
  return () => document.removeEventListener("click", onDocClick);
}, [showTeamsDropdown]);

  const handlePlayerSelect = async (player) => {
    const isSelected = selectedPlayers.some((p) => p.id === player.id);

    if (isSelected) {
      // Logic for REMOVING a player
      await handlePlayerSelection(player, false);
      setError(""); // Clear any previous errors
    } else {
      // Logic for ADDING a player
      if (selectedPlayers.length >= 11) {
        setError("Team can only have 11 players");
        return;
      }

      const newTeam = [...selectedPlayers, player];
      const compositionValidation = validateTeamComposition(newTeam);
      const teamValidation = validateTeamLimit(newTeam);

      if (!compositionValidation.isValid) {
        const firstError = Object.values(compositionValidation.errors).find(Boolean);
        setError(firstError || "Team composition invalid");
        return;
      }

      if (!teamValidation.isValid) {
        setError(teamValidation.errors[0] || "Team limit exceeded");
        return;
      }

      await handlePlayerSelection(player, true);
      setError("");
    }
  };

  const handleCaptainSelect = (player) => {
    if (captain?.id === player.id) {
      setCaptain(null);
    } else {
      setCaptain(player);
    }
  };

  const loadMorePlayers = () => setCurrentPage((p) => p + 1);

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

  const handleSaveTeam = async () => {
    setError(""); // Clear any existing errors

    try {
      const cleanUsername = sanitizeName(username, 24);
      if (!cleanUsername) {
        setError("Please enter your name");
        return;
      }
      if (containsProfanity(cleanUsername)) {
        setError("Username contains disallowed language");
        return;
      }

      console.log("Attempting to save team...");

      await saveTeam(cleanUsername);
      console.log("Team saved successfully");
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 5000);
    } catch (error) {
      // Log the detailed error from Supabase for better debugging
      const dbError = error.message || "An unknown error occurred.";
      console.error("Save team error:", dbError);
      setError(`Failed to save team: ${dbError}`);
    }
  };

  const handleToggleFilter = (type, value) => {
    setFilters((prev) => {
      // Reset page to 1 on any filter change
      setCurrentPage(1);
      const currentArray = prev[type];
      const newArray = currentArray.includes(value)
        ? currentArray.filter((item) => item !== value)
        : [...currentArray, value];
      return { ...prev, [type]: newArray };
    });
  };

  if (loading && currentPage === 1) {
    return <div className="flex items-center justify-center min-h-screen text-white">Loading...</div>;
  }

  // Teams are now loaded upfront in allTeams state instead of being derived

  return (
    <div className="min-h-screen bg-dark-500 text-white">
      <div className="max-w-5xl mx-auto space-y-4">
        {/* Success Popup */}
        {showSuccess && (
          <div className="fixed inset-0 flex items-center justify-center z-50">
            <div className="absolute inset-0 bg-black opacity-50"></div>
            <div className="bg-white rounded-lg p-8 max-w-md mx-4 relative z-10">
              <div className="text-center">
                <div className="mx-auto flex items-center justify-center h-6 w-12 rounded-full bg-green-100 mb-4">
                  <svg
                    className="h-6 w-6 text-green-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
                <h3 className="text-lg font-small text-gray-900 mb-2">
                  Your team has been submitted!
                </h3>
                <p className="text-sm text-gray-500">
                  You can make changes as needed until the submission deadline.
                </p>
                <button
                  onClick={() => setShowSuccess(false)}
                  className="mt-6 w-full px-4 py-2 bg-primary-500 text-black rounded-full"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Selected Team Summary */}
        <div className="bg-card-light rounded-2xl shadow-card p-6">
          <div className="flex flex-col md:flex-row items-center md:items-start justify-between gap-4">
            <div className="flex-1">
              <h2 className="text-xl font-bold text-white">
                {teamName || "Your Team"}
              </h2>
              <p className="text-sm text-gray-300 mt-1">
                {username || "Your Name"}
              </p>
              <p className="mt-2 text-sm text-gray-300">
                Players: {selectedPlayers.length}/11
              </p>

              {/* Selected Players Grid */}
              {selectedPlayers.length > 0 && (
                <div className="mt-4 grid grid-cols-1 gap-1">
                  {selectedPlayers.map((player) => (
                    <div
                      key={player.id}
                      className={`${
                        TEAM_COLORS[player.team_name] || "bg-gray-700"
                      } bg-opacity-80 rounded-lg p-3 relative min-h-[40px] flex items-center`}
                    >
                      {/* Show captain button if no captain is selected, or if the current player IS the captain */}
                      {(!captain || captain.id === player.id) && (
                        <button
                          onClick={() => handleCaptainSelect(player)}
                          className={`absolute top-0 left-0 z-10 w-5 h-5 flex items-center justify-center text-xs font-bold rounded-full transition-colors ${
                            captain?.id === player.id
                              ? "bg-yellow-300 text-black" // Captain style
                              : "bg-gray-400 text-black hover:bg-gray-300" // Not captain style
                          }`}
                        >
                          C
                        </button>
                      )}
                      <div className="flex items-center justify-center flex-shrink-0 px-2">
                        {getRoleIcon((player.role || "").toLowerCase()) && (
                          <img
                            src={getRoleIcon((player.role || "").toLowerCase())}
                            alt={player.role}
                            title={player.role}
                            className="w-6 h-6 object-contain"
                          />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-white text-xs font-semibold truncate">{player.name} - {player.team_name}</div>
                      </div>
                      <button
                        onClick={() => handlePlayerSelect(player)}
                        className="absolute bottom-0 right-0 z-10 w-5 h-5 flex items-center justify-center text-xs font-bold bg-red-500 text-white rounded-full hover:bg-red-600"
                      >
                        X
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Team Composition Summary */}
              {selectedPlayers.length > 0 && (
                <div className="mt-4 grid grid-cols-4 gap-3 text-xs text-grey-300">
                  {[
                    { label: "Batters", role: "Batter" },
                    { label: "Bowlers", role: "Bowler" },
                    { label: "WKs", role: "Wicketkeeper" },
                    { label: "Allrounders", role: "Allrounder" },
                  ].map(({ label, role }) => (
                    <p key={role}>
                      {label} <br /> {selectedPlayers.filter((p) => p.role === role).length}
                    </p>
                  ))}
                </div>
              )}
            </div>

            <div className="w-full md:w-96">
              <input
                type="text"
                id="teamName"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border border-card-default bg-card-light text-center text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Enter your team name"
              />
              <input
                type="text"
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-2 text-center rounded-lg border border-card-default bg-card-light text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Enter your name"
              />

              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  handleSaveTeam().catch((error) => {
                    console.error("Save failed:", error);
                    setError(error.message || "Failed to save team");
                  });
                }}
                className="mt-4 w-full inline-flex items-center justify-center gap-1 px-4 py-3 bg-primary-500 hover:bg-primary-600 text-black font-semibold rounded-full shadow-card disabled:bg-gray-600 disabled:text-gray-400 disabled:cursor-not-allowed"
                disabled={
                  selectedPlayers.length !== 11 || !captain || !teamName.trim()
                }
              >
                Save Team
              </button>
            </div>
          </div>
        </div>

        {/* Error messages */}
        {error && (
          <div className="bg-red-50 border-l-4 border-red-400 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg
                  className="h-5 w-5 text-red-400"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="ml-3">
                {error.split("\n").map((err, index) => (
                  <p key={index} className="text-sm text-red-700">
                    {err}
                  </p>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Player Selection Section */}
        <div className="bg-card-light rounded-2xl shadow-card p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-2">
            <h2 className="text-medium font-bold text-primary-500">
              Available Players
            </h2>

            <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 w-full md:w-auto">
              <div className="flex flex-wrap gap-0 md:gap-3">
                {roles.map((role) => (
                  <button
                    key={role}
                    onClick={() => handleToggleFilter("roles", role)}
                    className={`px-3 py-2 md:px-4 md:py-2 rounded-full text-xs md:text-sm font-medium transition-colors ${
                      filters.roles.includes(role)
                        ? "bg-primary-500 text-black"
                        : "bg-gray-700 text-gray-200 hover:bg-gray-600"
                    }`}
                  >
                    {role}
                  </button>
                ))}
              </div>

              <div className="relative">
                <div ref={teamsDropdownRef} className="relative inline-block text-left">
                  <button
                    type="button"
                    onClick={() => setShowTeamsDropdown((s) => !s)}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-full text-xs font-medium bg-gray-700 text-gray-200 hover:bg-gray-600"
                    aria-haspopup="true"
                    aria-expanded={showTeamsDropdown}
                  >
                    Teams
                    <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                      <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06-.02L10 10.67l3.71-3.48a.75.75 0 011.02 1.1l-4.2 3.94a.75.75 0 01-1.02 0L5.25 8.29a.75.75 0 01-.02-1.08z" clipRule="evenodd" />
                    </svg>
                  </button>

                  {showTeamsDropdown && (
                    <div className="absolute z-40 mt-2 w-56 rounded-md shadow-lg bg-card-light ring-1 ring-black ring-opacity-5 p-3">
                      <div className="max-h-56 overflow-auto space-y-1">
                        {allTeams.length === 0 ? (
                          <div className="text-xs text-gray-300">No teams</div>
                        ) : (
                          allTeams.map((team_name) => (
                            <label key={team_name} className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={filters.teams.includes(team_name)}
                                onChange={() => handleToggleFilter("teams", team_name)}
                                className="h-4 w-4 rounded border-gray-300 text-primary-500 focus:ring-primary-500"
                              />
                              <span className="truncate">{team_name}</span>
                            </label>
                          ))
                        )}
                      </div>
                      <div className="mt-2 flex justify-between">
                        <button
                          type="button"
                          onClick={() => { setFilters((f) => ({ ...f, teams: [] })); setShowTeamsDropdown(false); }}
                          className="text-xs text-gray-300 hover:underline"
                        >
                          Clear
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowTeamsDropdown(false)}
                          className="text-xs text-gray-300 hover:underline"
                        >
                          Done
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <input
                type="text"
                placeholder="Search players..."
                className="ml-full md:ml-2 px-4 py-2 rounded-full bg-dark-100 text-sm text-white placeholder-gray-400"
                value={filters.search}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, search: e.target.value }))
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {displayedPlayers.map((player) => {
              const isSelected = selectedPlayers.some((p) => p.id === player.id);
              const bgClass = TEAM_COLORS[player.team_name] || "bg-gray-700";
              const isCaptain = captain?.id === player.id;
              return (
                <div key={player.id} className="rounded-xl overflow-hidden shadow-card border border-card-default">
                  <div className={`p-3 ${bgClass} bg-opacity-80`}>
                    
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center justify-center flex-shrink-0 px-2">
                        {getRoleIcon((player.role || "").toLowerCase()) && (
                          <img
                            src={getRoleIcon((player.role || "").toLowerCase())}
                            alt={player.role}
                            title={player.role}
                            className="w-6 h-6 object-contain"
                          />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-white text-xs font-semibold truncate">{player.name}</div>
                        <div className="text-xs text-gray-100">{player.team_name}</div>
                      </div>
                      
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => handleCaptainSelect(player)}
                          className={`px-2 py-1 text-xs rounded-full whitespace-nowrap font-bold ${
                            isCaptain ? "bg-yellow-400 text-black" : "bg-black/20 text-white"
                          }`}
                        >
                          C
                        </button>
                        <button
                          onClick={() => handlePlayerSelect(player)}
                          className={`px-3 py-1 text-xs rounded-full whitespace-nowrap ${
                            isSelected ? "bg-red-500 text-white" : "bg-primary-500 text-black"
                          }`}
                        >
                          {isSelected ? "Remove" : "Add"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {displayedPlayers.length > 0 && displayedPlayers.length % playersPerPage === 0 && (
            <div className="mt-6 text-center">
              <button
                onClick={loadMorePlayers}
                className="px-4 py-2 rounded-full text-sm bg-gray-700 text-white hover:bg-gray-600"
              >
                Load More Players
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
