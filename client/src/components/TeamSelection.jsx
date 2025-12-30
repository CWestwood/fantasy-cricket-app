import React, { useState, useEffect } from "react";
import { supabase } from "../utils/supabaseClient";
import { useTeam } from "../context/TeamContext";
import { containsProfanity, sanitizeName } from "../utils/profanity";
import { COUNTRY_COLORS } from "../constants/colors";

const TeamSelection = () => {
  const [availablePlayers, setAvailablePlayers] = useState([]);
  const [filteredPlayers, setFilteredPlayers] = useState([]);
  const [displayedPlayers, setDisplayedPlayers] = useState([]);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [tempUsername, setTempUsername] = useState("");
  const [tempTeamName, setTempTeamName] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const playersPerPage = 40;
  const [filters, setFilters] = useState({
    roles: [],
    countries: [],
    search: "",
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const [isAvailable, setIsAvailable] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    selectedPlayers,
    handlePlayerSelection,
    captain,
    setCaptain,
    teamName,
    setTeamName,
    validateTeamComposition,
    validateCountryLimit,
    saveTeam,
    user,
    setSelectedPlayers,
    username,
    setUsername,
  } = useTeam();

  // Load available players from Supabase
  useEffect(() => {
    const loadPlayers = async () => {
      try {
        const { data, error } = await supabase.from("players").select("*");
        if (error) throw error;
        const players = (data || []).map((row) => ({ id: row.id, ...row }));
        console.log("Available player roles:", [
          ...new Set(players.map((p) => p.role)),
        ]);
        setAvailablePlayers(players);
        setFilteredPlayers(players);
      } catch (error) {
        console.error("Error loading players:", error);
        setError("Failed to load players");
      } finally {
        setLoading(false);
      }
    };

    loadPlayers();
  }, []);

  // Check if user has existing team and show setup modal if needed
  useEffect(() => {
    const checkUserSetup = async () => {
      if (!user) return;

      try {
        // Check if user has a team
        const { data: userTeams, error: teamError } = await supabase
          .from("teams")
          .select("id")
          .eq("user_id", user.id)
          .limit(1);

        if (teamError) throw teamError;

        // If no team exists and user has no username, show setup modal
        if (!userTeams || userTeams.length === 0) {
          if (!username?.trim()) {
            setShowSetupModal(true);
          }
        }
      } catch (error) {
        console.error("Error checking user setup:", error);
      }
    };

    checkUserSetup();
  }, [user, username]);

  // Update filter effect
  useEffect(() => {
    let result = availablePlayers;

    if (filters.roles.length > 0) {
      result = result.filter((player) =>
        filters.roles.includes((player.role || "").toLowerCase())
      );
    }
    if (filters.countries.length > 0) {
      result = result.filter((player) =>
        filters.countries.includes(player.country)
      );
    }
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      result = result.filter(
        (player) =>
          player.name?.toLowerCase().includes(searchLower) ||
          player.country?.toLowerCase().includes(searchLower)
      );
    }

    result = [...result].sort((a, b) => {
      const nameA = (a.name || "").toLowerCase();
      const nameB = (b.name || "").toLowerCase();
      return nameA.localeCompare(nameB);
    });

    setFilteredPlayers(result);
    setCurrentPage(1);
    setDisplayedPlayers(result.slice(0, playersPerPage));
  }, [filters, availablePlayers]);

  // Debounced username availability check
  useEffect(() => {
    if (!showSetupModal) return;

    const checkUsername = async () => {
      const cleanUsername = sanitizeName(tempUsername.trim().replace(/\s+/g, " "), 24).toLowerCase();

      if (!cleanUsername) {
        setIsChecking(false);
        setIsAvailable(false);
        return;
      }

      if (containsProfanity(cleanUsername)) {
        setIsChecking(false);
        setIsAvailable(false);
        setError("Username contains disallowed language");
        return;
      }

      try {
        const { data: existing, error: checkError } = await supabase
          .from("users")
          .select("id")
          .filter("username", "ilike", cleanUsername)
          .neq("id", user?.id);

        if (checkError) throw checkError;

        if (existing && existing.length > 0) {
          setError("That username is already taken.");
          setIsAvailable(false);
        } else {
          setError("");
          setIsAvailable(true);
        }
      } catch (error) {
        console.error("Check error:", error);
      } finally {
        setIsChecking(false);
      }
    };

    setIsAvailable(false);
    if (tempUsername.trim()) {
      setIsChecking(true);
      const timeoutId = setTimeout(checkUsername, 500);
      return () => clearTimeout(timeoutId);
    } else {
      setIsChecking(false);
      setError("");
    }
  }, [tempUsername, showSetupModal, user]);

  const handlePlayerSelect = async (player) => {
    if (selectedPlayers.find((p) => p.id === player.id)) {
      // Removing player
      await handlePlayerSelection(player, false);
    } else if (selectedPlayers.length < 11) {
      const newTeam = [...selectedPlayers, player];
      const compositionValidation = validateTeamComposition(newTeam);
      const countryValidation = validateCountryLimit(newTeam);

      if (!compositionValidation.isValid) {
        const firstError = Object.values(compositionValidation.errors).filter(
          Boolean
        )[0];
        setError(firstError || "Team composition invalid");
        return;
      }

      if (!countryValidation.isValid) {
        setError(countryValidation.errors[0]);
        return;
      }

      // Adding player - add active: 'TRUE' flag
      const playerWithActive = { ...player, active: "TRUE" };
      await handlePlayerSelection(playerWithActive, true);
      setError("");
    } else {
      setError("Team can only have 11 players");
    }
  };

  const handleCaptainSelect = (player) => {
    if (captain?.id === player.id) {
      setCaptain(null);
    } else {
      setCaptain(player);
    }
  };

  const loadMorePlayers = () => {
    const nextPage = currentPage + 1;
    const startIndex = 0;
    const endIndex = nextPage * playersPerPage;
    setDisplayedPlayers(filteredPlayers.slice(startIndex, endIndex));
    setCurrentPage(nextPage);
  };

  const handleSetupSubmit = async () => {
    if (isChecking || !isAvailable) return;
    setIsSubmitting(true);

    const cleanUsername = sanitizeName(tempUsername.trim().replace(/\s+/g, " "), 24).toLowerCase();
    const cleanTeamName = sanitizeName(tempTeamName.trim(), 40);

    if (!cleanUsername) {
      setError("Please enter a username");
      setIsSubmitting(false);
      return;
    }

    if (!cleanTeamName) {
      setError("Please enter a team name");
      setIsSubmitting(false);
      return;
    }

    if (containsProfanity(cleanUsername) || containsProfanity(cleanTeamName)) {
      setError("Username or team name contains disallowed language");
      setIsSubmitting(false);
      return;
    }

    try {
      // Check if username is already taken (case-insensitive, trimmed)
      const { data: existing, error: checkError } = await supabase
        .from("users")
        .select("id")
        .filter("username", "ilike", cleanUsername)
        .neq("id", user.id);

      if (checkError) throw checkError;

      if (existing && existing.length > 0) {
        setError("That username is already taken. Please choose another.");
        setIsSubmitting(false);
        return;
      }

      // Save username to database
      const { error: updateError } = await supabase
        .from("users")
        .update({ username: cleanUsername })
        .eq("id", user.id);

      if (updateError) throw updateError;

      // Save team name to localStorage
      localStorage.setItem("selectedTeamName", cleanTeamName);

      // Update context with the username and team name
      setUsername(cleanUsername);
      setTeamName(cleanTeamName);
      setShowSetupModal(false);
      setTempUsername("");
      setTempTeamName("");
      setError("");
    } catch (error) {
      console.error("Setup error:", error);
      setError(error.message || "Failed to save setup");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveTeam = async (usernameOverride = null) => {
    console.log("Save team clicked");
    const currentUsername = usernameOverride || username;
    console.log("Team state:", {
      teamName,
      username: currentUsername,
      selectedPlayers: selectedPlayers.length,
      hasCaptain: !!captain,
    });

    const cleanTeamName = sanitizeName(teamName, 40);

    if (!cleanTeamName) {
      setError("Please enter a team name");
      return;
    }

    // Check if username exists, if not show setup modal
    if (!currentUsername?.trim()) {
      setShowSetupModal(true);
      setTempUsername("");
      setTempTeamName(teamName);
      return;
    }

    const cleanUsername = sanitizeName(currentUsername, 24);

    // Profanity checks
    if (containsProfanity(cleanTeamName) || containsProfanity(cleanUsername)) {
      setError("Team name or username contains disallowed language");
      return;
    }

    const compositionValidation = validateTeamComposition(selectedPlayers);
    console.log("Composition validation:", compositionValidation);
    console.log(
      "Team composition details:",
      selectedPlayers.reduce((acc, player) => {
        acc[player.role] = (acc[player.role] || 0) + 1;
        return acc;
      }, {})
    );

    if (!compositionValidation.isValid) {
      const errors = Object.values(compositionValidation.errors).filter(
        Boolean
      );
      console.log("Validation errors:", errors);
      setError(errors[0]);
      return;
    }

    if (!captain) {
      setError("Please select a captain");
      return;
    }

    try {
      console.log("Attempting to save team...");

      // Ensure all players have active field set to TRUE
      const playersWithActive = selectedPlayers.map((player) =>
        player.active ? player : { ...player, active: "TRUE" }
      );

      // If any players were updated, update the state
      if (playersWithActive.some((p, i) => !selectedPlayers[i].active)) {
        setSelectedPlayers(playersWithActive);
      }

      await saveTeam(cleanUsername);
      console.log("Team saved successfully");
      setError("");
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 5000);
    } catch (error) {
      console.error("Save team error:", error);
      setError(error.message || "Failed to save team");
    }
  };

  const handleToggleFilter = (type, value) => {
    setFilters((prev) => {
      const currentArray = prev[type];
      const newArray = currentArray.includes(value)
        ? currentArray.filter((item) => item !== value)
        : [...currentArray, value];
      return { ...prev, [type]: newArray };
    });
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  const uniqueCountries = [
    ...new Set(availablePlayers.map((player) => player.country)),
  ];
  const roles = ["batter", "bowler", "allrounder", "wicketkeeper"];

  return (
    <div className="space-y-6 relative">
      {/* Success Popup */}
      {showSuccess && (
        <div className="fixed inset-0 flex items-center justify-center z-50">
          <div className="absolute inset-0 bg-black opacity-50"></div>
          <div className="bg-white rounded-lg p-8 max-w-md mx-4 relative z-10">
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
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
                className="mt-6 btn btn-primary w-full"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Setup Modal - Combined Username and Team Name */}
      {showSetupModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50">
          <div className="absolute inset-0 bg-black opacity-50"></div>
          <div className="bg-white rounded-lg p-8 max-w-md mx-4 relative z-10">
            <div className="text-center">
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                Complete Your Setup
              </h3>
              <p className="text-sm text-gray-500 mb-6">
                Create your username and team name to get started.
              </p>

              {/* Username Input */}
              <div className="mb-4 text-left">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Username
                </label>
                <input
                  type="text"
                  value={tempUsername}
                  onChange={(e) => setTempUsername(e.target.value)}
                  className="input w-full mb-2"
                  placeholder="Enter your username"
                  autoFocus
                />
                {isChecking && (
                  <p className="text-sm text-blue-600 mb-2">Checking availability...</p>
                )}
              </div>

              {/* Team Name Input */}
              <div className="mb-4 text-left">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Team Name
                </label>
                <input
                  type="text"
                  value={tempTeamName}
                  onChange={(e) => setTempTeamName(e.target.value)}
                  className="input w-full"
                  placeholder="Enter your team name"
                />
              </div>

              {error && (
                <p className="text-sm text-red-600 mb-4 text-left">{error}</p>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowSetupModal(false);
                    setTempUsername("");
                    setTempTeamName("");
                    setError("");
                  }}
                  className="btn btn-secondary flex-1"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSetupSubmit}
                  className="btn btn-primary flex-1"
                  disabled={isSubmitting || isChecking || !isAvailable}
                >
                  {isSubmitting ? "Processing..." : "Continue"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Selected Team Summary */}
      <div className="card bg-white/10">
        <h2 className="text-2xl font-bold text-gray-900 mb-4 text-center">
          {teamName || "Your Team"} ({selectedPlayers.length}/11)
        </h2>
        <h3 className="text-lg font-small text-gray-700 mb-4 text-center">
          {username || "Your Username"}
        </h3>

        {/* Team Name and Username Inputs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <input
              type="text"
              id="teamName"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              className="input w-full"
              placeholder="Enter your team name"
              required
            />
          </div>
          <div>
            <input
              type="text"
              id="username"
              value={username || ""}
              onChange={(e) => setUsername(e.target.value)}
              className={`input w-full ${username ? "bg-gray-100 text-gray-500 cursor-not-allowed" : ""}`}
              placeholder="Enter your username"
              disabled={!!username}
              required
            />
          </div>
        </div>

        {/* Selected Team Players */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {selectedPlayers
            .sort((a, b) => {
              if (captain?.id === a.id) return -1;
              if (captain?.id === b.id) return 1;
              return a.name.localeCompare(b.name);
            })
            .map((player) => (
              <div
                key={player.id}
                className={`player-card ${
                  COUNTRY_COLORS[player.country] || "bg-white"
                } ${
                  captain?.id === player.id
                    ? "border-yellow-300"
                    : "border-gray-200"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="player details flex items-center justify-center gap-3">
                    <span className="font-small text-gray-900">
                      {player.name}
                    </span>
                    <span className="text-sm text-gray-800">•</span>
                    <span className="text-sm text-gray-800">{player.role}</span>
                    <span className="text-sm text-gray-800">•</span>
                    <span className="text-sm text-gray-800">
                      {player.country}
                    </span>
                  </div>
                  <div className="player actions flex justify-end gap-3">
                    <button
                      onClick={() => handleCaptainSelect(player)}
                      className={`btn btn-sm ${
                        captain?.id === player.id
                          ? "bg-yellow-500 text-white hover:bg-yellow-600"
                          : "btn-secondary"
                      }`}
                    >
                      {captain?.id === player.id ? "Captain" : "Make Captain"}
                    </button>
                    <button
                      onClick={() => handlePlayerSelect(player)}
                      className="btn btn-sm bg-red-500 text-white hover:bg-red-600"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}
        </div>

        <div className="mt-6">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              console.log("Button clicked");
              handleSaveTeam().catch((error) => {
                console.error("Save failed:", error);
                setError(error.message || "Failed to save team");
              });
            }}
            className="btn btn-primary w-full bg-cyan-700"
            disabled={
              selectedPlayers.length !== 11 || !captain || !teamName.trim()
            }
          >
            Save Team
          </button>
        </div>
      </div>

      {/* Error message */}
      {error && !showSetupModal && (
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
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Player Selection Section */}
      <div className="card bg-white/40">
        <h2 className="text-2xl font-bold text-gray-900 mb-4 text-center">
          Available Players
        </h2>

        {/* Filters */}
        <div className="space-y-4 mb-6">
          {/* Role Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Role
            </label>
            <div className="flex flex-wrap gap-2">
              {roles.map((role) => (
                <button
                  key={role}
                  onClick={() => handleToggleFilter("roles", role)}
                  className={`btn btn-sm ${
                    filters.roles.includes(role)
                      ? "bg-accent text-white bg-amber-500"
                      : "bg-gray-200 text-gray-900 hover:bg-amber-500"
                  }`}
                >
                  {role.charAt(0).toUpperCase() + role.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Country Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Country
            </label>
            <div className="flex flex-wrap gap-2">
              {uniqueCountries.map((country) => (
                <button
                  key={country}
                  onClick={() => handleToggleFilter("countries", country)}
                  className={`btn btn-sm ${
                    filters.countries.includes(country)
                      ? "bg-accent text-white bg-amber-500"
                      : "bg-gray-200 text-gray-900 hover:bg-amber-500"
                  }`}
                >
                  {country}
                </button>
              ))}
            </div>
          </div>

          {/* Search Input */}
          <div>
            <input
              type="text"
              placeholder="Search players..."
              className="input w-full text-gray-900"
              value={filters.search}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, search: e.target.value }))
              }
            />
          </div>
        </div>

        {/* Available Players Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {displayedPlayers.map((player) => (
            <div
              key={player.id}
              className={`player-card ${
                selectedPlayers.find((p) => p.id === player.id)
                  ? "border-gray-800 bg-amber-500"
                  : "border-gray-200 bg-gray-300/80"
              }
              }`}
            >
              <div className="player-info justify-center">
                <span className="font-small text-gray-900">{player.name}</span>
                <span className="text-sm text-gray-800">•</span>
                <span className="text-sm text-gray-800">{player.role}</span>
                <span className="text-sm text-gray-800">•</span>
                <span className="text-sm text-gray-800">{player.country}</span>
              </div>
              <button
                onClick={() => handlePlayerSelect(player)}
                className={`btn btn-sm ${
                  selectedPlayers.find((p) => p.id === player.id)
                    ? "btn-secondary"
                    : "btn-primary"
                }`}
              >
                {selectedPlayers.find((p) => p.id === player.id)
                  ? "Remove"
                  : "Add"}
              </button>
            </div>
          ))}
        </div>

        {/* Load More Button */}
        {filteredPlayers.length > displayedPlayers.length && (
          <div className="mt-6 text-center">
            <button onClick={loadMorePlayers} className="btn btn-secondary">
              Load More Players
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default TeamSelection;