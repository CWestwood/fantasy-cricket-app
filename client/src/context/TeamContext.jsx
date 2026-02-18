/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { supabase } from "../utils/supabaseClient";

/*
  TeamContext provides team state and actions used by TeamSelection.

  Stage priority:
  - pickableStage  = the stage the user can submit picks for (drives selection UI)
  - viewStage      = the currently active stage (drives leaderboard / score views)
  - activeStage    = pickableStage when one exists, otherwise viewStage.

  Cache sequencing:
  - loadUserTeam is the SINGLE writer of selectedPlayers / captain / teamName.
  - Settings are fetched inline inside loadUserTeam (not as a state dependency)
    to prevent the effect firing twice as stageSettings state arrives.
  - teamLoaded is a state variable (not a ref) so the draft-write effect
    reliably re-runs the moment loading is complete.
  - If a saved Supabase team exists  →  load it (source of truth, no cache write)
  - If no saved team                 →  restore localStorage draft or start empty
  - Draft writes are skipped while loading and skipped entirely when teamId is set
*/

const TeamContext = createContext(null);


// ─── Cache helpers ────────────────────────────────────────────────────────────
const buildCacheKey = (tournamentId, stageId) =>
  `fantasy-cricket-team-${tournamentId}:${stageId ?? "group"}`;

const readCache = (tournamentId, stageId) => {
  try {
    const raw = localStorage.getItem(buildCacheKey(tournamentId, stageId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const writeCache = (tournamentId, stageId, payload) => {
  try {
    localStorage.setItem(
      buildCacheKey(tournamentId, stageId),
      JSON.stringify(payload)
    );
  } catch (e) {
    console.warn("Failed to write team cache:", e);
  }
};
// ─────────────────────────────────────────────────────────────────────────────

export const TeamProvider = ({ children }) => {
  const [selectedPlayers, setSelectedPlayers] = useState([]);
  const [captain, setCaptain] = useState(null);
  const [teamName, setTeamName] = useState("");
  const [teamId, setTeamId] = useState(null);
  const [isTeamLocked, setIsTeamLocked] = useState(false);
  const [substitutionsRemaining, setSubstitutionsRemaining] = useState(3);
  const [subsAllocated, setSubsAllocated] = useState(null);
  const [loading, setLoading] = useState(true);
  const [teamLoaded, setTeamLoaded] = useState(false); // state not ref — write effect depends on this
  const [user, setUser] = useState(null);
  const [tournamentId, setTournamentId] = useState(null);
  const [username, setUsername] = useState("");
  const [activityState, setActivityState] = useState("");
  const [activeStage, setActiveStage] = useState(null);
  const [stageSettings, setStageSettings] = useState(null); // kept for consumers; not used as loadUserTeam dep
  const [isStageSelectionOpen, setIsStageSelectionOpen] = useState(false);
  const [viewStage, setViewStage] = useState(null);
  const [pickableStage, setPickableStage] = useState(null);
  const [isNameLocked, setIsNameLocked] = useState(false);
  const tournamentLoadedRef = useRef(false);
  const [teamStageId, setTeamStageId] = useState(null);

  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        setSelectedPlayers([]);
        setCaptain(null);
        setTeamName("");
        setSubstitutionsRemaining(3);
        setLoading(false);
        setTeamLoaded(false);
      } else {
        setLoading(true);
        setTeamLoaded(false);
      }
    });

    return () => {
      mounted = false;
      try { data?.subscription?.unsubscribe?.(); } catch { /* ignore */ }
    };
  }, []);

  // ── Load tournament + resolve stages ──────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    
    const loadTournament = async () => {
      const { data } = await supabase
        .from("tournaments")
        .select("id, activity_state")
        .in("status", ["upcoming", "in progress"])
        .limit(1)
        .maybeSingle();

      if (!data) { setLoading(false); return; }

      setTournamentId(data.id);
      setActivityState(data.activity_state);

      // 1. viewStage — the currently live stage (for leaderboard / scores)
      const { data: activeStageData } = await supabase
        .rpc("get_active_stage", { p_user_id: user.id, p_tournament_id: data.id })
        .maybeSingle();

      let vStage = null;
      if (activeStageData?.stage_id) {
        vStage = {
          id: activeStageData.stage_id,
          stage_name: activeStageData.stage_name,
          reason: activeStageData.reason,
          is_locked: activeStageData.is_locked,
          user_has_team: activeStageData.user_has_team,
        };
      }
      setViewStage(vStage);

      // 2. pickableStage — the stage the user can submit picks for
      const { data: pickableStageData } = await supabase
        .rpc("get_user_pickable_stage", { p_user_id: user.id, p_tournament_id: data.id })
        .maybeSingle();

      let pStage = null;
      if (pickableStageData?.stage_id && pickableStageData.reason !== "no_active_stage") {
        pStage = {
          id: pickableStageData.stage_id,
          stage_name: pickableStageData.stage_name,
          reason: pickableStageData.reason,
        };
      }
      setPickableStage(pStage);
      
      // 3. activeStage: prefer pickable so TeamSelection, saveTeam, and the cache
      //    all target the correct upcoming stage — not the locked live stage.
      const targetStage = pStage || vStage;
      setActiveStage(targetStage);

      const isOpen = targetStage && (
        targetStage.reason === "open" ||
        targetStage.reason === "no_team_created" ||
        targetStage.reason === "no_team"
      );
      setIsStageSelectionOpen(isOpen);
      

      // loadUserTeam fires next via its own effect once activeStage is set.
      // We do NOT set stageSettings here — loadUserTeam fetches them inline
      // to avoid becoming a dependency that causes a double load.
      if (!targetStage) { setLoading(false); }
    };
    tournamentLoadedRef.current = true;

    loadTournament();
  }, [user]);

  // ── Switch stage manually (e.g. stage tab UI) ─────────────────────────────
  const switchStage = (stage) => {
    if (!stage || activeStage?.id === stage.id) return;
    setActiveStage(stage);
    setIsStageSelectionOpen(
      stage.reason === "open" ||
      stage.reason === "no_team_created" ||
      stage.reason === "no_team"
    );
    setLoading(true);
    setTeamLoaded(false);
    // stageSettings will be refreshed inside loadUserTeam for the new stage
  };

  // ── Load user team ─────────────────────────────────────────────────────────
  //
  // SINGLE owner of selectedPlayers / captain / teamName on mount or stage change.
  //
  // Settings are fetched inline here rather than read from stageSettings state.
  // This means the effect only depends on [user, tournamentId, activeStage?.id]
  // and will never fire twice due to stageSettings arriving asynchronously.
  //
  // Priority:
  //   1. Saved Supabase team for this stage  →  load it (source of truth)
  //   2. No saved team                       →  restore localStorage draft
  //   3. No draft                            →  start empty
  //
  useEffect(() => {
    if (!user || !tournamentId || !activeStage?.id) return;

    setTeamLoaded(false);
    setIsTeamLocked(false);

    const loadUserTeam = async () => {
      if (!user || !tournamentId || !activeStage?.id) return;
      if (!tournamentLoadedRef.current) return; 

      setTeamStageId(activeStage.id);
      setSelectedPlayers([]);
      setCaptain(null);
      
      // ── Fetch settings inline so stageSettings state is not a dependency ──
      const { data: settingsData } = await supabase
        .from("tournament_settings")
        .select("max_country, max_subs")
        .eq("stage_id", activeStage.id)
        .maybeSingle();

      const maxSubs = settingsData?.max_subs ?? 3;

      // Publish to state so consumers (substitution UI etc.) can read it
      if (settingsData) setStageSettings(settingsData);

      // ── Username ──────────────────────────────────────────────────────────
      try {
        const { data: userData, error: userError } = await supabase
          .from("users")
          .select("username")
          .eq("id", user.id)
          .single();
        if (userError && userError.code !== "PGRST116") throw userError;
        if (userData?.username) setUsername(userData.username);
      } catch (err) {
        console.error("Error loading username:", err.message);
      }

      // ── Lock team name if a team exists from any prior stage ──────────────
      
      try {
        const { data: priorTeam } = await supabase
          .from("teams")
          .select("team_name")
          .eq("user_id", user.id)
          .eq("tournament_id", tournamentId)
          .limit(1)
          .maybeSingle();

        if (priorTeam?.team_name) {
          setIsNameLocked(true);
          setTeamName((prev) => prev || priorTeam.team_name);
        } else {
          setIsNameLocked(false);
        }
      } catch (err) {
        console.error("Error checking prior team name:", err.message);
      }
      console.log("loadUserTeam:", {
        stage: activeStage?.stage_name,
        reason: activeStage?.reason,
        aboutToEnterFastPath: activeStage.reason === "no_team" || activeStage.reason === "no_team_created"
      });
      // ── Fast-path: RPC already told us there is no team for this stage ────
      // Skip the Supabase team fetch and go straight to draft restore.
      if (
        activeStage.reason === "no_team" ||
        activeStage.reason === "no_team_created"
      ) {
        setTeamId(null);
        setIsTeamLocked(false);
        setSubstitutionsRemaining(maxSubs);

        const draft = readCache(tournamentId, activeStage.id);
        console.log("Cache results:", draft);
        if (draft) {
          if (draft.teamName) setTeamName((prev) => prev || draft.teamName);
          if (draft.username) setUsername((prev) => prev || draft.username);
          if (draft.players?.length) {
            console.log("Restoring players from cache:", draft.players);
            setSelectedPlayers(draft.players);
          }
          if (draft.captain) setCaptain(draft.captain);
        } else {
          setSelectedPlayers([]);
          setCaptain(null);
        }

        setTeamLoaded(true);
        setLoading(false);
        return;
      }

      // ── Fetch saved team from Supabase ────────────────────────────────────
      try {
        const { data: teamData, error: teamError } = await supabase
          .from("teams")
          .select("id, team_name, subs_used, is_locked")
          .eq("user_id", user.id)
          .eq("tournament_id", tournamentId)
          .eq("stage_id", activeStage.id)
          .maybeSingle();

        if (teamError && teamError.code !== "PGRST116") throw teamError;
        
        if (teamData) {
          // Supabase team found — this is the definitive source of truth.
          // Do NOT fall back to or write to the cache for saved teams.
          setTeamId(teamData.id);
          setTeamName(teamData.team_name);
          setTeamStageId(activeStage.id); 
          setSubstitutionsRemaining(Math.max(0, maxSubs - (teamData.subs_used || 0)));
          setSubsAllocated(maxSubs);
          setIsTeamLocked(Boolean(teamData.is_locked));

          const { data: teamPlayersData, error: playersError } = await supabase
            .from("team_players")
            .select(`
              player_id,
              is_captain,
              is_substituted,
              added_at,
              removed_at,
              is_starter,
              squads:player_id (*)
            `)
            .eq("team_id", teamData.id);

          if (playersError) throw playersError;

          const loadedPlayers = teamPlayersData
            .map((tp) => ({
              ...tp.squads,
              is_captain: tp.is_captain,
              is_substituted: tp.is_substituted,
              added_at: tp.added_at,
              removed_at: tp.removed_at,
              is_starter: tp.is_starter,
            }))
            .filter(Boolean);

          setSelectedPlayers(loadedPlayers);
          const loadedCaptain = loadedPlayers.find((p) => p.is_captain);
          if (loadedCaptain) setCaptain(loadedCaptain);

        } else {
          // No saved team for this stage — restore draft or start empty.
          setTeamId(null);
          setTeamStageId(activeStage.id); 
          setIsTeamLocked(false);
          setSubstitutionsRemaining(maxSubs);

          const draft = readCache(tournamentId, activeStage.id);
          if (draft) {
            if (draft.teamName) setTeamName((prev) => prev || draft.teamName);
            if (draft.username) setUsername((prev) => prev || draft.username);
            if (draft.players?.length) setSelectedPlayers(draft.players);
            if (draft.captain) setCaptain(draft.captain);
          } else {
            setSelectedPlayers([]);
            setCaptain(null);
          }
        }
      } catch (err) {
        console.error("Error loading user team:", err.message);
        setSelectedPlayers([]);
        setCaptain(null);
      }

      setTeamLoaded(true);
      setLoading(false);
    };

    loadUserTeam();
  }, [user, tournamentId, activeStage?.id]); // stageSettings intentionally excluded

  // ── Persist draft to localStorage ─────────────────────────────────────────
  //
  // teamLoaded is a state variable so React correctly re-runs this effect
  // the moment loading completes — unlike a ref which React cannot observe.
  //
  // Skipped when:
  //   - teamLoaded is false (load hasn't finished yet — avoids writing empty state)
  //   - teamId is set (Supabase is the source of truth; no need to cache)
  //
  useEffect(() => {
    if (!teamLoaded) return;
    if (!tournamentId || !activeStage?.id) return;
    if (teamId) return;
    if (teamStageId !== activeStage.id) return;

    writeCache(tournamentId, activeStage.id, {
      players: selectedPlayers.map((p) => ({
        id: p.id,
        name: p.name,
        role: p.role,
        team_name: p.team_name,
        multiplier: p.multiplier,
      })),
      captain: captain ? { id: captain.id, name: captain.name } : null,
      teamName,
      username,
    });
  }, [
    teamLoaded,
    selectedPlayers,
    captain,
    teamName,
    username,
    tournamentId,
    activeStage?.id,
    teamId,
  ]);

  // ── Player picks tracking ─────────────────────────────────────────────────
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
          .update({ picks: newPicks, last_updated: new Date().toISOString() })
          .eq("id", playerId);
      }
    } catch (err) {
      console.error("Error updating player picks:", err);
    }
  };

  const handlePlayerSelection = async (player, isSelected) => {
    await updatePlayerPicks(player.id, isSelected);
    if (isSelected) {
      setSelectedPlayers((prev) => [
        ...prev,
        player.active ? player : { ...player, active: true },
      ]);
    } else {
      setSelectedPlayers((prev) => prev.filter((p) => p.id !== player.id));
      if (captain?.id === player.id) setCaptain(null);
    }
  };

  // ── Save team ─────────────────────────────────────────────────────────────
  // Always submits to pickableStage — never accidentally to the locked viewStage.
  const saveTeam = async (cleanUsername) => {
    if (!user) throw new Error("You must be logged in to save a team");
    if (!teamName.trim()) throw new Error("Team name is required");
    if (selectedPlayers.length !== 11) throw new Error("Team must have exactly 11 players");
    if (!captain) throw new Error("Team must have a captain");
    if (!cleanUsername) throw new Error("Username is required");
    if (!tournamentId) throw new Error("Tournament ID is required");

    const submitStage = pickableStage || activeStage;
    if (!submitStage) throw new Error("No stage available to submit picks for");

    const playersJson = selectedPlayers.map((p) => ({
      id: p.id,
      active: Boolean(p.active ?? true),
      role: p.role,
      name: p.name,
      team_name: p.team_name ?? p.team ?? null,
    }));

    const subsUsed = (subsAllocated ?? 3) - substitutionsRemaining;

    const { data, error } = await supabase.rpc("submit_team", {
      p_tournament_id: tournamentId,
      p_stage: submitStage.stage_name,
      p_stage_id: submitStage.id,
      p_team_name: teamName,
      p_players: playersJson,
      p_captain_id: captain.id,
      p_subs_used: subsUsed,
    });
    if (error) throw error;

    // Clear the draft — team is now safely in Supabase
    try {
      localStorage.removeItem(buildCacheKey(tournamentId, submitStage.id));
    } catch { /* ignore */ }

    return data;
  };

  // ── Validation ────────────────────────────────────────────────────────────
  const validateTeamComposition = (players) => {
    const composition = players
      .filter((p) => !p.is_substituted)
      .reduce((acc, player) => {
        const roleKey = (player.role || "").toLowerCase();
        acc[roleKey] = (acc[roleKey] || 0) + 1;
        return acc;
      }, {});
    const total = Object.values(composition).reduce((a, b) => a + b, 0);
    if (total === 11) {
      return {
        isValid:
          (composition.batter || 0) >= 3 &&
          (composition.bowler || 0) >= 3 &&
          (composition.wicketkeeper || 0) >= 1,
        errors: {
          Batter: (composition.batter || 0) < 3 ? "Need at least 3 batters" : null,
          Bowler: (composition.bowler || 0) < 3 ? "Need at least 3 bowlers" : null,
          Wicketkeeper:
            (composition.wicketkeeper || 0) < 1
              ? "Need at least 1 wicketkeeper"
              : null,
        },
      };
    }
    return {
      isValid: total <= 11,
      errors: { Total: total > 11 ? "Cannot have more than 11 players" : null },
    };
  };

  const validateTeamLimit = (players) => {
    const MAX_PER_TEAM = stageSettings?.max_country || 3;
    const teamCounts = players
      .filter((p) => !p.is_substituted)
      .reduce((acc, player) => {
        const team = player.team_name || "Unknown";
        acc[team] = (acc[team] || 0) + 1;
        return acc;
      }, {});
    for (const team in teamCounts) {
      if (teamCounts[team] > MAX_PER_TEAM) {
        return {
          isValid: false,
          errors: [`Cannot have more than ${MAX_PER_TEAM} players from ${team}.`],
        };
      }
    }
    return { isValid: true, errors: [] };
  };

  // ── Account management ────────────────────────────────────────────────────
  const updateUserUsername = async (newUsername) => {
    if (!user) throw new Error("User not found");
    const { error } = await supabase
      .from("users")
      .update({ username: newUsername })
      .eq("id", user.id);
    if (error) throw error;
    setUsername(newUsername);
  };

  const updateUserTeamName = async (newTeamName) => {
    if (!user || !tournamentId) throw new Error("Team context not ready");
    let query = supabase
      .from("teams")
      .select("id")
      .eq("user_id", user.id)
      .eq("tournament_id", tournamentId);
    if (activeStage) query = query.eq("stage_id", activeStage.id);
    const { data: teamData, error: fetchError } = await query.maybeSingle();
    if (fetchError || !teamData) throw new Error("Could not find a team to update.");
    const { error: updateError } = await supabase
      .from("teams")
      .update({ team_name: newTeamName })
      .eq("id", teamData.id);
    if (updateError) throw updateError;
    setTeamName(newTeamName);
  };

  const deleteUserAccount = async () => {
    if (!user) throw new Error("User not found");
    const { error } = await supabase.functions.invoke("delete-user", { method: "POST" });
    if (error) throw new Error("There was a problem deleting your account. Please try again.");
    await supabase.auth.signOut();
  };

  // ── canPick ───────────────────────────────────────────────────────────────
  const canPick =
    !loading &&
    !!pickableStage &&
    (pickableStage.reason === "open" || pickableStage.reason === "no_team_created");

  // ── Context value ─────────────────────────────────────────────────────────
  const value = {
    selectedPlayers,
    setSelectedPlayers: (players) =>
      setSelectedPlayers(players.map((p) => (p.active ? p : { ...p, active: true }))),
    handlePlayerSelection,
    captain, setCaptain,
    teamName, setTeamName,
    teamId,
    substitutionsRemaining, subsAllocated, setSubstitutionsRemaining,
    loading,
    saveTeam,
    validateTeamComposition, validateTeamLimit,
    user, tournamentId, username,
    isTeamLocked, isNameLocked,
    setUsername,
    updateUserUsername, updateUserTeamName, deleteUserAccount,
    activityState,
    activeStage, stageSettings, isStageSelectionOpen,
    viewStage, pickableStage,
    switchStage, canPick,
  };

  return <TeamContext.Provider value={value}>{children}</TeamContext.Provider>;
};

export const useTeam = () => {
  const ctx = useContext(TeamContext);
  if (!ctx) throw new Error("useTeam must be used within TeamProvider");
  return ctx;
};
