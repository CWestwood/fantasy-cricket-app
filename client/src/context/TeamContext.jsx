/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "../utils/supabaseClient";

/*
  TeamContext provides team state and actions used by TeamSelection.
  This is intentionally minimal but includes selection, captain, teamName,
  validation helpers, and saveTeam which calls the submit_team RPC.
*/

const TeamContext = createContext(null);

export const TeamProvider = ({ children }) => {
  const [selectedPlayers, setSelectedPlayers] = useState([]);
  const [captain, setCaptain] = useState(null);
  const [teamName, setTeamName] = useState("");
  const [teamId, setTeamId] = useState(null);
  const [substitutionsRemaining, setSubstitutionsRemaining] = useState(3);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [tournamentId, setTournamentId] = useState(null);
  const [username, setUsername] = useState("");

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (mounted) setUser(session?.user ?? null);
      if (!session?.user) {
        setSelectedPlayers([]);
        setCaptain(null);
        setTeamName("");
        setSubstitutionsRemaining(3);
      }
      setLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        setSelectedPlayers([]);
        setCaptain(null);
        setTeamName("");
        setSubstitutionsRemaining(3);
      }
    });

    return () => {
      mounted = false;
      // unsubscribe if possible
      try {
        data?.subscription?.unsubscribe?.();
      } catch {
        // ignore
      }
    };
  }, []);

  useEffect(() => {
    const loadTournament = async () => {
      const { data } = await supabase
        .from("tournaments")
        .select("id")
        .eq("name", "Big Bash 2025/6") // Adjust to match your tournament name
        .single();
      
      if (data) setTournamentId(data.id);
    };
    
    if (user) loadTournament();
  }, [user]);

  // Effect to load the user's saved team
  useEffect(() => {
    const loadUserTeam = async () => {
      if (!user || !tournamentId) return;

      // Also load the username from the public users table
      try {
        const { data: userData, error: userError } = await supabase
          .from("users")
          .select("username")
          .eq("id", user.id)
          .single();
        if (userError && userError.code !== 'PGRST116') throw userError;
        if (userData) setUsername(userData.username || "");
      } catch (error) {
        console.error("Error loading username:", error.message);
      }

      try {
        // 1. Fetch the user's team for the current tournament
        const { data: teamData, error: teamError } = await supabase
          .from("teams")
          .select("id, team_name, subs_used")
          .eq("user_id", user.id)
          .eq("tournament_id", tournamentId)
          .single();

        if (teamError && teamError.code !== 'PGRST116') throw teamError;

        if (teamData) {
          // 2. If a team exists, set the team name, team ID, and substitutions
          setTeamId(teamData.id);
          setTeamName(teamData.team_name);
          setSubstitutionsRemaining(3 - (teamData.subs_used || 0));

          // 3. Fetch the full player objects for the players in that team
          const { data: teamPlayersData, error: playersError } = await supabase
            .from("team_players")
            .select(`
              player_id,
              is_captain,
              players:player_id (*)
            `)
            .eq("team_id", teamData.id);

          if (playersError) throw playersError;

          // Extract the player objects
          const loadedPlayers = teamPlayersData.map(tp => ({
            ...tp.players,
            is_captain: tp.is_captain,
          })).filter(Boolean);

          setSelectedPlayers(loadedPlayers);

          // 4. Find and set the captain from the loaded players
          const loadedCaptain = loadedPlayers.find(p => p.is_captain);
          if (loadedCaptain) setCaptain(loadedCaptain);
        }
      } catch (error) {
        console.error("Error loading user team:", error.message);
      }
    };

    loadUserTeam();
  }, [user, tournamentId]);

  const updatePlayerPicks = async (playerId, increment) => {
    if (!user) return;
    try {
      const { data: statsData, error: fetchError } = await supabase
        .from("player_stats")
        .select("picks")
        .eq("id", playerId)
        .single();

      if (fetchError && fetchError.code !== "PGRST116") return;

      if (!statsData) {
        await supabase.from("player_stats").insert({
          id: playerId,
          picks: increment ? 1 : 0,
          last_updated: new Date().toISOString(),
        });
      } else {
        const newPicks = increment
          ? (statsData.picks || 0) + 1
          : Math.max(0, (statsData.picks || 0) - 1);
        await supabase
          .from("player_stats")
          .update({
            picks: newPicks,
            last_updated: new Date().toISOString(),
          })
          .eq("id", playerId);
      }
    } catch (error) {
      console.error("Error updating player picks:", error);
    }
  };

  const handlePlayerSelection = async (player, isSelected) => {
    await updatePlayerPicks(player.id, isSelected);
    if (isSelected) {
      const playerWithActive = player.active
        ? player
        : { ...player, active: true };
      setSelectedPlayers((prev) => [...prev, playerWithActive]);
    } else {
      setSelectedPlayers((prev) => prev.filter((p) => p.id !== player.id));
      if (captain?.id === player.id) setCaptain(null);
    }
  };

  const saveTeam = async (username) => {
  if (!user) throw new Error("You must be logged in to save a team");
  if (!teamName.trim()) throw new Error("Team name is required");
  if (selectedPlayers.length !== 11)
    throw new Error("Team must have exactly 11 players");
  if (!captain) throw new Error("Team must have a captain");
  if (!username) throw new Error("Username is required");
  if (!tournamentId) throw new Error("Tournament ID is required");

  // Convert players to the format expected by the function
  const playersJson = selectedPlayers.map((p) => ({
    // `id` is the database players.id (FK to team_players.player_id)
    id: p.id,
    active: Boolean(p.active ?? true),
    role: p.role,
    name: p.name,
    // server schema uses `team_name` on the `players` table
    team_name: p.team_name ?? p.team ?? null,
  }));

  const subsUsed = 3 - substitutionsRemaining; // Convert remaining to used

  const params = {
    p_username: username,
    p_tournament_id: tournamentId,
    p_stage: "group",
    p_team_name: teamName,
    p_players: playersJson,           // Pass as object, not stringified
    p_captain_id: captain.id,
    p_subs_used: subsUsed,
  };

  const { data, error } = await supabase.rpc("submit_team", params);
  if (error) throw error;
  return data; // Will return the team_id UUID
};

  const validateTeamComposition = (players) => {
    const composition = players.reduce((acc, player) => {
      const roleKey = (player.role || "").toLowerCase();
      acc[roleKey] = (acc[roleKey] || 0) + 1;
      return acc;
    }, {});
    const total = Object.values(composition).reduce((a, b) => a + b, 0);

    // Only apply full team validation rules when we have 11 players
    if (total === 11) {
      return {
        isValid:
          (composition.batter || 0) >= 3 &&
          (composition.bowler || 0) >= 3 &&
          (composition.wicketkeeper || 0) === 1,
        errors: {
          Batter:
            (composition.batter || 0) < 3 ? "Need at least 3 batters" : null,
          Bowler:
            (composition.bowler || 0) < 3 ? "Need at least 3 bowlers" : null,
          Wicketkeeper:
            (composition.wicketkeeper || 0) !== 1
              ? "Need exactly 1 wicketkeeper"
              : null,
        },
      };
    }

    // For partial teams, only validate basic rules:
    // - No more than 1 wicketkeeper
    // - No more than total allowed players
    return {
      isValid: (composition.wicketkeeper || 0) <= 1 && total <= 11,
      errors: {
        Wicketkeeper:
          (composition.wicketkeeper || 0) > 1
            ? "Cannot have more than 1 wicketkeeper"
            : null,
        Total: total > 11 ? "Cannot have more than 11 players" : null,
      },
    };
  };

  const validateTeamLimit = (players) => {
    const MAX_PER_team = 4;
    const teamCounts = players.reduce((acc, player) => {
      const team = player.team_name || "Unknown";
      acc[team] = (acc[team] || 0) + 1;
      return acc;
    }, {});

    for (const team in teamCounts) {
      if (teamCounts[team] > MAX_PER_team) {
        return {
          isValid: false,
          errors: [
            `Cannot have more than ${MAX_PER_team} players from ${team}.`,
          ],
        };
      }
    }
    return { isValid: true, errors: [] };
  };

  const updateUserUsername = async (newUsername) => {
    if (!user) throw new Error("User not found");
    const { error } = await supabase
      .from("users")
      .update({ username: newUsername })
      .eq("id", user.id);
    if (error) throw error;
    setUsername(newUsername); // Update local state
  };

  const updateUserTeamName = async (newTeamName) => {
    if (!user || !tournamentId) throw new Error("Team context not ready");

    // Find the team id first
    const { data: teamData, error: fetchError } = await supabase
      .from("teams")
      .select("id")
      .eq("user_id", user.id)
      .eq("tournament_id", tournamentId)
      .single();

    if (fetchError || !teamData) {
      throw new Error("Could not find a team to update.");
    }

    const { error: updateError } = await supabase
      .from("teams")
      .update({ team_name: newTeamName })
      .eq("id", teamData.id);

    if (updateError) throw updateError;
    setTeamName(newTeamName); // Update local state
  };

  const deleteUserAccount = async () => {
    if (!user) throw new Error("User not found");

    // Invoke the edge function to delete all user data
    const { error } = await supabase.functions.invoke("delete-user", {
      method: "POST",
    });

    if (error) {
      // Give a more user-friendly error
      console.error("Edge function error:", error);
      throw new Error(
        "There was a problem deleting your account. Please try again."
      );
    }

    // Sign out locally after successful deletion
    await supabase.auth.signOut();
  };

  const value = {
    selectedPlayers,
    setSelectedPlayers: (players) =>
      setSelectedPlayers(
        players.map((p) => (p.active ? p : { ...p, active: true }))
      ),
    handlePlayerSelection,
    captain,
    setCaptain,
    teamName,
    setTeamName,
    teamId,
    substitutionsRemaining,
    setSubstitutionsRemaining,
    loading,
    saveTeam,
    validateTeamComposition,
    validateTeamLimit,
    user,
    tournamentId,
    username,
    setUsername,
    updateUserUsername,
    updateUserTeamName,
    deleteUserAccount,
  };

  return <TeamContext.Provider value={value}>{children}</TeamContext.Provider>;
};

export const useTeam = () => {
  const ctx = useContext(TeamContext);
  if (!ctx) throw new Error("useTeam must be used within TeamProvider");
  return ctx;
};

// Note: TeamContext is not exported as default to keep this file focused on React components/hooks
