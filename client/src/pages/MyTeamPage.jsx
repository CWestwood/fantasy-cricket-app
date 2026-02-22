import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { TEAM_COLORS_gradient, TEAM_COLORS } from "../constants/colors";
import { useTeam } from "../context/TeamContext";
import { supabase } from "../utils/supabaseClient";
import BatIcon from "../assets/icons/bat_white.svg";
import BallIcon from "../assets/icons/ball_white.svg";
import AllrounderIcon from "../assets/icons/allrounder_white.svg";
import WkglovesIcon from "../assets/icons/wkgloves_white.svg";
import SubstitutionModal from "../components/SubstitutionModal";

export default function MyTeamPage() {
  const {
    teamName,
    tournamentId,
    substitutionsRemaining,
    activityState,
    viewStage,
    user,
  } = useTeam();

  const navigate = useNavigate();

  // ── Local state ───────────────────────────────────────────────────────────
  const [stages, setStages] = useState([]);
  const [selectedView, setSelectedView] = useState("combined"); // "combined" or stage.id
  const [allMyTeamIds, setAllMyTeamIds] = useState([]);
  
  // New state to hold baseline stats from the leaderboard cache
  const [cachedStats, setCachedStats] = useState({ batting: 0, bowling: 0, fielding: 0, bonus: 0, total: 0 });

  const [myTeamId, setMyTeamId] = useState(null);
  const [myTeamPlayers, setMyTeamPlayers] = useState([]);
  const [displayedPlayers, setDisplayedPlayers] = useState([]);
  const [leaderboardPosition, setLeaderboardPosition] = useState(null);
  const [expandedPlayerId, setExpandedPlayerId] = useState(null);
  const [playerScores, setPlayerScores] = useState({});
  const [isSubstitutionModalOpen, setIsSubstitutionModalOpen] = useState(false);
  const [isLive, setIsLive] = useState(true);
  const [livePlayerScores, setLivePlayerScores] = useState({});

  // ── Fetch stages and all user teams (for combined view IDs) ───────────────
  useEffect(() => {
    if (!tournamentId || !user?.id) return;

    const fetchInitialData = async () => {
      // Fetch tournament stages
      const { data: stagesData } = await supabase
        .from("tournament_stages")
        .select("*")
        .eq("tournament_id", tournamentId)
        .order("id", { ascending: true });

      if (stagesData) setStages(stagesData);

      // Fetch all teams for user
      const { data: teamsData } = await supabase
        .from("teams")
        .select("id")
        .eq("user_id", user.id)
        .eq("tournament_id", tournamentId);

      if (teamsData) {
        setAllMyTeamIds(teamsData.map((t) => t.id));
      }
    };

    fetchInitialData();
  }, [tournamentId, user]);

  // ── Load the selected stage team directly from Supabase ───────────────────
  useEffect(() => {
    const targetStageId = selectedView === "combined" ? viewStage?.id : selectedView;
    
    if (!tournamentId || !targetStageId || !user) {
      setMyTeamId(null);
      setMyTeamPlayers([]);
      return;
    }

    const loadViewStageTeam = async () => {
      try {
        const { data: teamData, error: teamError } = await supabase
          .from("teams")
          .select("id, team_name")
          .eq("user_id", user.id)
          .eq("tournament_id", tournamentId)
          .eq("stage_id", targetStageId)
          .maybeSingle();

        if (teamError) {
          console.error("Error fetching viewStage team:", teamError);
          return;
        }

        if (!teamData) {
          setMyTeamId(null);
          setMyTeamPlayers([]);
          return;
        }

        setMyTeamId(teamData.id);

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

        if (playersError) {
          console.error("Error fetching viewStage team players:", playersError);
          return;
        }

        const players = teamPlayersData
          .map((tp) => ({
            ...tp.squads,
            is_captain: tp.is_captain,
            is_substituted: tp.is_substituted,
            added_at: tp.added_at,
            removed_at: tp.removed_at,
            is_starter: tp.is_starter,
          }))
          .filter(Boolean);

        setMyTeamPlayers(players);
      } catch (e) {
        console.error("Exception loading viewStage team:", e);
      }
    };

    loadViewStageTeam();
  }, [tournamentId, selectedView, viewStage?.id, user]);

  const sourcePlayers = displayedPlayers.length ? displayedPlayers : myTeamPlayers;
  const captainId = sourcePlayers.find((p) => p.is_captain && !p.is_substituted)?.id;

  // ── Map roles to icons ────────────────────────────────────────────────────
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

  // ── Fetch historical player performance (for player cards) ────────────────
  useEffect(() => {
    if (!displayedPlayers || displayedPlayers.length === 0 || !tournamentId || !myTeamId) return;

    async function fetchPlayerPerformance() {
      try {
        const playerIds = displayedPlayers.map((p) => p.id);
        let query = supabase
          .from("player_performance_summary")
          .select("player_id, batting, bowling, fielding, bonus, fantasy_total")
          .in("player_id", playerIds)
          .eq("tournament_id", tournamentId);

        query = query.eq("team_id", myTeamId);

        const { data, error } = await query;

        if (error) {
          console.error("Error fetching player performance:", error);
          return;
        }

        const scoreMap = {};
        if (data) {
          data.forEach((row) => {
            if (!scoreMap[row.player_id]) {
              scoreMap[row.player_id] = { batting: 0, bowling: 0, fielding: 0, bonus: 0, total: 0 };
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
  }, [displayedPlayers, tournamentId, myTeamId]);

  // ── Fetch live scores ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!myTeamPlayers.length) return;

    const fetchLiveScores = async () => {
      const playerIds = myTeamPlayers.map((p) => p.id);
      const { data, error } = await supabase
        .from("live_scoring")
        .select("player_id, batting, bowling, fielding, bonus, total")
        .in("player_id", playerIds);

      if (error) {
        console.error("Error fetching live scores:", error);
        return;
      }

      const map = {};
      if (data) {
        data.forEach((row) => {
          if (!map[row.player_id]) map[row.player_id] = { batting: 0, bowling: 0, fielding: 0, bonus: 0, total: 0 };
          map[row.player_id].batting += Number(row.batting) || 0;
          map[row.player_id].bowling += Number(row.bowling) || 0;
          map[row.player_id].fielding += Number(row.fielding) || 0;
          map[row.player_id].bonus += Number(row.bonus) || 0;
          map[row.player_id].total += Number(row.total) || 0;
        });
      }
      setLivePlayerScores(map);
    };

    fetchLiveScores();

    const channel = supabase
      .channel("my_team_live_scores")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "live_scoring" },
        () => fetchLiveScores()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [myTeamPlayers]);

  // ── Fetch leaderboard cache (Base Scores & Position) ──────────────────────
  useEffect(() => {
    if (!tournamentId) return;
    if (selectedView !== "combined" && !myTeamId) {
      setLeaderboardPosition(null);
      setCachedStats({ batting: 0, bowling: 0, fielding: 0, bonus: 0, total: 0 });
      return;
    }

    async function fetchLeaderboardData() {
      try {
        let query = supabase
          .from("tournament_leaderboard_cache")
          .select("rank_position, batting_total, bowling_total, fielding_total, bonus_total, total")
          .eq("tournament_id", tournamentId);

        // Sum across all teams for 'combined', otherwise fetch single stage team
        if (selectedView === "combined" && allMyTeamIds.length > 0) {
          query = query.in("team_id", allMyTeamIds);
        } else if (myTeamId) {
          query = query.eq("team_id", myTeamId);
        }

        const { data, error } = await query;

        if (error) {
          console.error("Error fetching leaderboard cache:", error);
          return;
        }

        if (data && data.length > 0) {
          let stats = { batting: 0, bowling: 0, fielding: 0, bonus: 0, total: 0 };
          // Find the best rank if combining multiple cache rows
          let minRank = Math.min(...data.map(r => r.rank_position).filter(Boolean));

          data.forEach(row => {
            stats.batting += Number(row.batting_total || 0);
            stats.bowling += Number(row.bowling_total || 0);
            stats.fielding += Number(row.fielding_total || 0);
            stats.bonus += Number(row.bonus_total || 0);
            stats.total += Number(row.total || 0); 
          });

          setCachedStats(stats);
          setLeaderboardPosition(minRank === Infinity ? null : minRank);
        } else {
          setLeaderboardPosition(null);
          setCachedStats({ batting: 0, bowling: 0, fielding: 0, bonus: 0, total: 0 });
        }
      } catch (e) {
        console.error("Exception fetching leaderboard position:", e);
      }
    }

    fetchLeaderboardData();
  }, [myTeamId, tournamentId, selectedView, allMyTeamIds]);

  // ── Score calculation ─────────────────────────────────────────────────────
  const getDisplayScore = (playerId) => {
    const isCaptain = captainId === playerId;
    const multiplier = isCaptain ? 2 : 1;

    const base = playerScores[playerId] || { batting: 0, bowling: 0, fielding: 0, bonus: 0, total: 0 };
    const live = livePlayerScores[playerId] || { batting: 0, bowling: 0, fielding: 0, bonus: 0, total: 0 };

    if (!isLive) return { 
      batting: (base.batting || 0),
      bowling: (base.bowling || 0),
      fielding: (base.fielding || 0),
      bonus: (base.bonus || 0),
      total: (base.total || 0),
      delta: 0, deltaBatting: 0, deltaBowling: 0, deltaFielding: 0, deltaBonus: 0 
    };

    return {
      batting: (base.batting || 0) + (live.batting * multiplier),
      bowling: (base.bowling || 0) + (live.bowling* multiplier),
      fielding: (base.fielding || 0) +(live.fielding * multiplier),
      bonus: (base.bonus || 0) + (live.bonus * multiplier),
      total: (base.total || 0) + (live.total * multiplier),
      delta: live.total * multiplier,
      deltaBatting: live.batting * multiplier,
      deltaBowling: live.bowling * multiplier,
      deltaFielding: live.fielding * multiplier,
      deltaBonus: live.bonus * multiplier,
    };
  };

  // ── Totals (Cache + Live Deltas) ──────────────────────────────────────────
  
  // Isolate the live deltas coming from current active players
  const liveDeltaBatting   = sourcePlayers.reduce((sum, p) => sum + getDisplayScore(p.id).deltaBatting, 0);
  const liveDeltaBowling   = sourcePlayers.reduce((sum, p) => sum + getDisplayScore(p.id).deltaBowling, 0);
  const liveDeltaFielding  = sourcePlayers.reduce((sum, p) => sum + getDisplayScore(p.id).deltaFielding, 0);
  const liveDeltaBonus     = sourcePlayers.reduce((sum, p) => sum + getDisplayScore(p.id).deltaBonus, 0);
  const liveDeltaTotal     = sourcePlayers.reduce((sum, p) => sum + getDisplayScore(p.id).delta, 0);

  // Top header numbers derived from Cache +/- Live Delta
  const displayBatting = cachedStats.batting + liveDeltaBatting;
  const displayBowling = cachedStats.bowling + liveDeltaBowling;
  const displayFieldingBonus = (cachedStats.fielding + cachedStats.bonus) + (liveDeltaFielding + liveDeltaBonus);
  const displayTotalPoints = cachedStats.total + liveDeltaTotal;

  // ── Apply substitution status ─────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;

    const applySubstitutionStatus = async () => {
      try {
        if (!myTeamPlayers || myTeamPlayers.length === 0) {
          if (mounted) setDisplayedPlayers([]);
          return;
        }

        if (!myTeamId) {
          if (mounted) setDisplayedPlayers(myTeamPlayers);
          return;
        }

        const { data, error } = await supabase
          .from("substitutions")
          .select("player_out_id, player_in_id")
          .eq("team_id", myTeamId)
          .eq("status", "completed");

        if (error) {
          console.error("Error fetching substitutions:", error);
          if (mounted) setDisplayedPlayers(myTeamPlayers);
          return;
        }

        const outSet = new Set((data || []).map((r) => r.player_out_id).filter(Boolean));
        const inSet  = new Set((data || []).map((r) => r.player_in_id).filter(Boolean));

        const mapped = myTeamPlayers.map((p) => ({
          ...p,
          is_substituted:    Boolean(outSet.has(p.id)),
          is_substituted_in: Boolean(inSet.has(p.id)),
        }));

        if (mounted) setDisplayedPlayers(mapped);
      } catch (e) {
        console.error("Exception checking substitutions:", e);
        if (mounted) setDisplayedPlayers(myTeamPlayers);
      }
    };

    applySubstitutionStatus();
    return () => { mounted = false; };
  }, [myTeamPlayers, myTeamId]);

  // ── Sort players: captain first, then active, then substituted out ────────
  const activePlayers = sourcePlayers.filter((p) => !p.is_substituted);
  const substitutedOutPlayers = sourcePlayers.filter((p) => p.is_substituted);

  const sortedActivePlayers = [...activePlayers].sort((a, b) => {
    if (captainId === a.id) return -1;
    if (captainId === b.id) return 1;
    return 0;
  });

  const sortedPlayers = [...sortedActivePlayers, ...substitutedOutPlayers];

  const goToPlayerProfile = (event, playerId) => {
    event.stopPropagation();
    if (!playerId) return;
    navigate(`/player/${playerId}`);
  };

  // ── Button Render Logic ───────────────────────────────────────────────────
  
  const super8Stage = stages.find(s => (s.stage_name || "").toLowerCase().includes("super"));
  const showPickSuper8 = super8Stage && !super8Stage.is_locked;

  let showSubButton = activityState === "live"; 
  if (showSubButton) {
    const stageToCheck = selectedView === "combined" ? viewStage : stages.find(s => s.id === selectedView);
    if (stageToCheck) {
      const stageName = (stageToCheck.stage_name || "").toLowerCase();
      if (stageName.includes("group")) {
        showSubButton = new Date() <= new Date(stageToCheck.ends_at);
      } else if (stageName.includes("super")) {
        showSubButton = stageToCheck.is_locked === true;
      }
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-dark-500 text-white py-4 md:py-8">
      <div className="max-w-6xl mx-auto px-3 sm:px-4 space-y-4 md:space-y-6">

        {/* Header Section */}
        <div className="bg-card-light rounded-2xl shadow-card p-4 sm:p-6">
          <div className="mb-4 sm:mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <h1 className="text-2xl sm:text-3xl font-bold text-primary-500 mb-1 sm:mb-2">
                {teamName || "Your Team"}
              </h1>
              <div className="flex items-center gap-3">
                <select
                  value={selectedView}
                  onChange={(e) => setSelectedView(e.target.value)}
                  className="bg-dark-600 text-gray-400 text-center rounded-lg px-3 py-1.5 text-sm font-medium border border-gray-600 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                >
                  <option value="combined">Combined</option>
                  {stages.map((stage) => (
                    <option key={stage.id} value={stage.id}>
                      {stage.stage_name}
                    </option>
                  ))}
                </select>
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

          {/* Stats Grid */}
          <div className="grid grid-cols-3 grid-rows-2 gap-2 sm:gap-4">
            <button
              type="button"
              onClick={() => navigate("/leaderboard")}
              className="flex flex-col items-center justify-center bg-dark-500 rounded-lg p-3 sm:p-4 hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-primary-500"
              aria-label="View leaderboard"
            >
              <div className="text-xl sm:text-3xl font-bold text-primary-500 mb-1 sm:mb-2">
                {leaderboardPosition ? `#${leaderboardPosition}` : "—"}
              </div>
              <p className="text-xs sm:text-sm text-gray-400 text-center">Leaderboard</p>
            </button>

            <div className="flex flex-col items-center justify-center bg-dark-500 rounded-lg p-3 sm:p-4">
              <div className="text-xl sm:text-3xl font-bold text-primary-500 mb-1 sm:mb-2">
                {displayTotalPoints}
              </div>
              <p className="text-xs sm:text-sm text-gray-400 text-center">Points</p>
            </div>

            <div className="flex flex-col items-center justify-center bg-dark-500 rounded-lg p-3 sm:p-4">
              <p className="text-xl sm:text-3xl font-bold text-primary-500 mb-1 sm:mb-2">{substitutionsRemaining}</p>
              <p className="text-xs sm:text-sm text-gray-400 text-center">Subs Left</p>
            </div>

            <div className="flex flex-col items-center justify-center bg-dark-500 rounded-lg p-3 sm:p-4">
              <p className="text-xl sm:text-3xl font-medium text-gray-400 mb-1 sm:mb-2">{displayBatting}</p>
              <p className="text-xs sm:text-sm text-gray-400 text-center">Batting</p>
            </div>

            <div className="flex flex-col items-center justify-center bg-dark-500 rounded-lg p-3 sm:p-4">
              <p className="text-xl sm:text-3xl font-medium text-gray-400 mb-1 sm:mb-2">{displayBowling}</p>
              <p className="text-xs sm:text-sm text-gray-400 text-center">Bowling</p>
            </div>

            <div className="flex flex-col items-center justify-center bg-dark-500 rounded-lg p-3 sm:p-4">
              <p className="text-xl sm:text-3xl font-medium text-gray-400 mb-1 sm:mb-2">{displayFieldingBonus}</p>
              <p className="text-xs sm:text-sm text-gray-400 text-center">Fielding/Bonus</p>
            </div>

            {showPickSuper8 && (
              <div className="col-span-3 mt-2 flex justify-center">
                <button
                  onClick={() => navigate("/team")}
                  className="px-4 sm:px-6 py-2 sm:py-3 rounded-full text-black text-sm sm:text-base font-semibold transition-colors bg-primary-500 hover:bg-primary-600"
                >
                  Pick Super 8 Team
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Selected Players List */}
        <div className="bg-card-light rounded-2xl shadow-card p-4 sm:p-6">
          <h2 className="text-lg sm:text-xl font-bold text-primary-500 mb-3 sm:mb-4">
            Players
          </h2>

          {myTeamPlayers.length === 0 ? (
            <div className="text-center py-6 sm:py-8">
              <p className="text-gray-400 mb-3">No players selected yet</p>
              {viewStage && (
                <p className="text-sm text-gray-500 mb-4">
                  You don't have a team for this view.
                </p>
              )}
              <button
                onClick={() => navigate("/team")}
                className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-black font-semibold rounded-full transition-colors"
              >
                Build Team for This Stage
              </button>
            </div>
          ) : (
            <div className="space-y-2 sm:overflow-x-auto">

              {/* Mobile Card View */}
              <div className="sm:hidden space-y-2">
                {sortedPlayers.map((player) => (
                  <React.Fragment key={player.id}>
                    {(() => {
                      const scores = getDisplayScore(player.id);
                      return (
                        <div
                          className={`${
                            player.is_substituted
                              ? "bg-gray-600"
                              : `bg-gradient-to-br ${TEAM_COLORS_gradient[player.team_name] || "from-gray-700 to-gray-900"}`
                          } rounded-lg overflow-hidden relative`}
                        >
                          {player.multiplier && player.multiplier !== 1 && (
                            <div className="absolute top-0 right-3 z-10 flex items-center justify-center text-gray-800 rounded-full w-5 h-5 text-xs font-bold">
                              ★{player.multiplier}
                            </div>
                          )}
                          <div
                            onClick={() => setExpandedPlayerId(expandedPlayerId === player.id ? null : player.id)}
                            className={`w-full p-3 flex items-center justify-between gap-2 cursor-pointer ${
                              player.is_substituted ? "hover:bg-gray-500" : "hover:bg-dark-400"
                            } transition-colors`}
                          >
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <div className="flex-shrink-0">
                                {getRoleIcon((player.role || "").toLowerCase()) && (
                                  <img
                                    src={getRoleIcon((player.role || "").toLowerCase())}
                                    alt={player.role}
                                    className={`w-8 h-8 object-contain ${player.is_substituted ? "opacity-50" : ""}`}
                                  />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between text-center gap-1">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      goToPlayerProfile(e, player.id);
                                    }}
                                    className={`w-full text-sm font-semibold text-center truncate focus:outline-none hover:underline ${
                                      player.is_substituted
                                        ? "text-gray-100"
                                        : captainId === player.id
                                          ? "text-yellow-400"
                                          : "text-white"
                                    }`}
                                  >
                                    {player.name}
                                  </button>
                                </div>
                                <p className={`text-xs ${player.is_substituted ? "text-gray-500" : "text-gray-300"} truncate`}>
                                  {player.team_name || "Unknown"}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 flex-shrink-0">
                              <p className={`w-full text-left text-sm font-bold ${player.is_substituted ? "text-gray-600" : "text-primary-500"}`}>
                                {scores.total}
                                {isLive && scores.delta !== 0 && (
                                  <span className={`ml-1 text-xs ${scores.delta < 0 ? "text-red-400" : "text-green-400"}`}>
                                    {scores.delta > 0 ? "+" : ""}{scores.delta}
                                  </span>
                                )}
                              </p>
                              <svg
                                className={`w-6 h-6 transition-transform ${expandedPlayerId === player.id ? "rotate-180" : ""} ${
                                  player.is_substituted ? "text-gray-400" : "text-gray-300"
                                }`}
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                              </svg>
                            </div>
                          </div>

                          {expandedPlayerId === player.id && (
                            <div className={`border-t ${player.is_substituted ? "border-gray-600 bg-gray-700" : "border-gray-600 bg-dark-600"} p-3 space-y-2`}>
                              <div className="grid grid-cols-2 gap-2">
                                {[
                                  { label: "Batting",  val: scores.batting,  delta: scores.deltaBatting },
                                  { label: "Bowling",  val: scores.bowling,  delta: scores.deltaBowling },
                                  { label: "Fielding", val: scores.fielding, delta: scores.deltaFielding },
                                  { label: "Bonus",    val: scores.bonus,    delta: scores.deltaBonus },
                                ].map(({ label, val, delta }) => (
                                  <div key={label} className={`${player.is_substituted ? "bg-gray-600" : "bg-dark-500"} rounded p-2`}>
                                    <p className={`text-xs ${player.is_substituted ? "text-gray-500" : "text-gray-400"} mb-1`}>{label}</p>
                                    <p className={`text-lg font-bold ${player.is_substituted ? "text-gray-400" : "text-primary-500"}`}>
                                      {val}
                                      {isLive && delta !== 0 && (
                                        <span className={`ml-1 text-xs ${delta < 0 ? "text-red-400" : "text-green-400"}`}>
                                          {delta > 0 ? "+" : ""}{delta}
                                        </span>
                                      )}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </React.Fragment>
                ))}
              </div>

              {/* Desktop Table View */}
              <table className="w-full border-separate border-spacing-y-2 hidden sm:table">
                <thead>
                  <tr className="border-b border-gray-600">
                    <th className="text-center py-3 px-4 font-semibold text-gray-300">Player</th>
                    <th className="text-center py-3 px-4 font-semibold text-gray-300">Team</th>
                    <th className="text-center py-3 px-4 font-semibold text-gray-300">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPlayers.map((player) => (
                    <React.Fragment key={player.id}>
                      {(() => {
                        const scores = getDisplayScore(player.id);
                        return (
                          <>
                            <tr
                              onClick={() => setExpandedPlayerId(expandedPlayerId === player.id ? null : player.id)}
                              className={`border-gray-700 ${
                                player.is_substituted
                                  ? "bg-gray-600"
                                  : `bg-gradient-to-br ${TEAM_COLORS_gradient[player.team_name] || "from-gray-700 to-gray-900"}`
                              } transition-colors cursor-pointer`}
                            >
                              <td className="py-3 px-4 rounded-l-xl">
                                <div className="flex items-center relative">
                                  <div className="absolute left-0 flex-shrink-0">
                                    {getRoleIcon((player.role || "").toLowerCase()) && (
                                      <img
                                        src={getRoleIcon((player.role || "").toLowerCase())}
                                        alt={player.role}
                                        title={player.role}
                                        className={`w-10 h-10 object-contain ${player.is_substituted ? "opacity-50" : ""}`}
                                      />
                                    )}
                                  </div>
                                  <div className="flex-1 flex items-center justify-center gap-2">
                                    <button
                                      type="button"
                                      onClick={(e) => goToPlayerProfile(e, player.id)}
                                      className={`font-semibold items-center focus:outline-none ${
                                        player.is_substituted
                                          ? "text-gray-400"
                                          : captainId === player.id
                                            ? "text-yellow-400"
                                            : "text-white"
                                      }`}
                                    >
                                      {player.name}
                                    </button>
                                    {player.is_substituted_in && (
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
                              <td className={`py-3 px-4 text-center text-lg font-bold rounded-r-xl ${player.is_substituted ? "text-gray-400" : "text-primary-500"}`}>
                                {scores.total}
                                {isLive && scores.delta !== 0 && (
                                  <span className={`ml-1 text-xs ${scores.delta < 0 ? "text-red-400" : "text-green-400"}`}>
                                    {scores.delta > 0 ? "+" : ""}{scores.delta}
                                  </span>
                                )}
                              </td>
                            </tr>

                            {expandedPlayerId === player.id && (
                              <tr className={`w-full max-w-md border-b ${
                                player.is_substituted ? "bg-gray-600 border-gray-600" : `${TEAM_COLORS[player.team_name] || "bg-dark-600"} border-gray-700`
                              }`}>
                                <td colSpan="3" className="py-4 px-4 flex justify-center w-full">
                                  <div className="grid grid-cols-4 gap-4 w-full max-w-md">
                                    {[
                                      { label: "Batting",  val: scores.batting,  delta: scores.deltaBatting },
                                      { label: "Bowling",  val: scores.bowling,  delta: scores.deltaBowling },
                                      { label: "Fielding", val: scores.fielding, delta: scores.deltaFielding },
                                      { label: "Bonus",    val: scores.bonus,    delta: scores.deltaBonus },
                                    ].map(({ label, val, delta }) => (
                                      <div key={label} className={`${player.is_substituted ? "bg-gray-700" : "bg-dark-500"} rounded-lg p-3 text-center`}>
                                        <p className={`text-sm mb-2 ${player.is_substituted ? "text-gray-500" : "text-gray-400"}`}>{label}</p>
                                        <p className={`text-2xl font-bold ${player.is_substituted ? "text-gray-400" : "text-primary-500"}`}>
                                          {val}
                                          {isLive && delta !== 0 && (
                                            <span className={`ml-1 text-xs ${delta < 0 ? "text-red-400" : "text-green-400"}`}>
                                              {delta > 0 ? "+" : ""}{delta}
                                            </span>
                                          )}
                                        </p>
                                      </div>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </>
                        );
                      })()}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center sm:justify-end">
          {showSubButton && (
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
          )}
        </div>

        {/* Substitution Modal */}
        <SubstitutionModal
          isOpen={isSubstitutionModalOpen}
          onClose={() => setIsSubstitutionModalOpen(false)}
          selectedPlayers={myTeamPlayers}
          captain={captainId}
          teamId={myTeamId}
          tournamentId={tournamentId}
        />

      </div>
    </div>
  );
}