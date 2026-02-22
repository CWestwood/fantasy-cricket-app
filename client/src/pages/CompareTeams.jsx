import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { TEAM_COLORS_gradient, TEAM_HEX_COLORS } from "../constants/colors";
import { useTeam } from "../context/TeamContext";
import { supabase } from "../utils/supabaseClient";
import BatIcon from "../assets/icons/bat_white.svg";
import BallIcon from "../assets/icons/ball_white.svg";
import AllrounderIcon from "../assets/icons/allrounder_white.svg";
import WkglovesIcon from "../assets/icons/wkgloves_white.svg";

export default function TeamComparePage() {
  const { opponentTeamId } = useParams(); // e.g. /compare/:opponentTeamId
  const navigate = useNavigate();

  const { tournamentId, user } = useTeam();

  // ── State ─────────────────────────────────────────────────────────────────
  const [myTeam, setMyTeam] = useState({ id: null, name: "", players: [] });
  const [theirTeam, setTheirTeam] = useState({ id: null, name: "", players: [] });
  const [myScores, setMyScores] = useState({});
  const [theirScores, setTheirScores] = useState({});
  const [loading, setLoading] = useState(true);
  const [allTeams, setAllTeams] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [stages, setStages] = useState([]);
  const [selectedStageId, setSelectedStageId] = useState(null);
  const [opponentUserId, setOpponentUserId] = useState(null);

  // ── Role icons ─────────────────────────────────────────────────────────────
  const roleIconMap = {
    batter: BatIcon,
    bowler: BallIcon,
    allrounder: AllrounderIcon,
    wicketkeeper: WkglovesIcon,
  };
  const getRoleIcon = (role) => roleIconMap[(role || "").toLowerCase()] || null;

  // ── Fetch Stages ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!tournamentId) return;
    const fetchStages = async () => {
      const { data } = await supabase
        .from("tournament_stages")
        .select("id, stage_name")
        .eq("tournament_id", tournamentId)
        .order("id");
      if (data) setStages(data);
    };
    fetchStages();
  }, [tournamentId]);

  // ── Fetch All Teams (for selection list and dropdown) ──────────────────────
  useEffect(() => {
    if (!tournamentId || !user?.id) return;

    const fetchAllTeams = async () => {
      // Only show loading if we are in selection mode (no opponent yet)
      if (!opponentTeamId) setLoading(true);
      try {
        const { data, error } = await supabase
          .from("teams")
          .select("id, team_name, user_id, stage_id, users(username)")
          .eq("tournament_id", tournamentId)
          .neq("user_id", user.id) // Exclude own team
          .order("team_name");

        if (error) throw error;
        setAllTeams(data || []);
      } catch (err) {
        console.error("Error fetching teams list:", err);
      } finally {
        if (!opponentTeamId) setLoading(false);
      }
    };
    fetchAllTeams();
  }, [tournamentId, user?.id, opponentTeamId]);

  // ── Mode 2: Resolve Opponent & Stage from URL ──────────────────────────────
  useEffect(() => {
    if (!opponentTeamId) {
      setOpponentUserId(null);
      return;
    }

    const resolveOpponent = async () => {
      // We don't set loading=true here to avoid flashing if we just switch stages later
      const { data } = await supabase
        .from("teams")
        .select("user_id, stage_id")
        .eq("id", opponentTeamId)
        .maybeSingle();

      if (data) {
        setOpponentUserId(data.user_id);
        // Force stage to match the URL team initially so deep linking works
        setSelectedStageId(data.stage_id);
      }
    };
    resolveOpponent();
  }, [opponentTeamId]);

  // ── Mode 2: Fetch Comparison Data ──────────────────────────────────────────
  useEffect(() => {
    if (!opponentUserId || !selectedStageId || !user?.id || !tournamentId) return;

    const load = async () => {
      setLoading(true);
      try {
        // 1. Fetch My team for the selected stage
        const { data: myTeamData } = await supabase
          .from("teams")
          .select("id, team_name")
          .eq("user_id", user.id)
          .eq("tournament_id", tournamentId)
          .eq("stage_id", selectedStageId)
          .maybeSingle();

        // 2. Fetch Their team for the selected stage
        const { data: theirTeamData } = await supabase
          .from("teams")
          .select("id, team_name")
          .eq("user_id", opponentUserId)
          .eq("tournament_id", tournamentId)
          .eq("stage_id", selectedStageId)
          .maybeSingle();

        const fetchPlayers = async (teamId) => {
          if (!teamId) return [];
          const { data } = await supabase
            .from("team_players")
            .select(`player_id, is_captain, is_substituted, squads:player_id (*)`)
            .eq("team_id", teamId);
          return (data || [])
            .map((tp) => ({
              ...tp.squads,
              is_captain: tp.is_captain,
              is_substituted: tp.is_substituted,
            }))
            .filter(Boolean);
        };

        const fetchScores = async (teamId, playerIds) => {
          if (!teamId || !playerIds.length) return {};
          const { data } = await supabase
            .from("player_performance_summary")
            .select("player_id, batting, bowling, fielding, bonus, fantasy_total")
            .in("player_id", playerIds)
            .eq("tournament_id", tournamentId)
            .eq("team_id", teamId);
          const map = {};
          (data || []).forEach((row) => {
            if (!map[row.player_id])
              map[row.player_id] = { batting: 0, bowling: 0, fielding: 0, bonus: 0, total: 0 };
            map[row.player_id].batting  += row.batting || 0;
            map[row.player_id].bowling  += row.bowling || 0;
            map[row.player_id].fielding += row.fielding || 0;
            map[row.player_id].bonus    += row.bonus || 0;
            map[row.player_id].total    += row.fantasy_total || 0;
          });
          return map;
        };

        const myPlayers    = await fetchPlayers(myTeamData?.id);
        const theirPlayers = await fetchPlayers(theirTeamData?.id);

        const myPts    = await fetchScores(myTeamData?.id,    myPlayers.map((p) => p.id));
        const theirPts = await fetchScores(theirTeamData?.id, theirPlayers.map((p) => p.id));

        setMyTeam({ id: myTeamData?.id, name: myTeamData?.team_name || "My Team", players: myPlayers });
        setTheirTeam({ id: theirTeamData?.id, name: theirTeamData?.team_name || "Opponent", players: theirPlayers });
        setMyScores(myPts);
        setTheirScores(theirPts);
      } catch (e) {
        console.error("Error loading comparison:", e);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [tournamentId, user, opponentUserId, selectedStageId]);

  // ── Derived sets ──────────────────────────────────────────────────────────
  const myIds    = new Set(myTeam.players.map((p) => p.id));
  const theirIds = new Set(theirTeam.players.map((p) => p.id));

  const uniqueToMe    = myTeam.players.filter((p) => !theirIds.has(p.id));
  const uniqueToThem  = theirTeam.players.filter((p) => !myIds.has(p.id));
  const sharedByBoth  = myTeam.players.filter((p) => theirIds.has(p.id));

  const diffCount = uniqueToMe.length; // always equals uniqueToThem.length

  const myCaptainId    = myTeam.players.find((p) => p.is_captain && !p.is_substituted)?.id;
  const theirCaptainId = theirTeam.players.find((p) => p.is_captain && !p.is_substituted)?.id;

  const myTotal    = Object.values(myScores).reduce((s, v) => s + (v.total || 0), 0);
  const theirTotal = Object.values(theirScores).reduce((s, v) => s + (v.total || 0), 0);

  // ── Player card ────────────────────────────────────────────────────────────
  const PlayerCard = ({ player, scoreMap, captainId, side }) => {
    const isCaptain = captainId === player.id;
    const scores    = scoreMap[player.id] || { batting: 0, bowling: 0, fielding: 0, bonus: 0, total: 0 };
    const icon      = getRoleIcon(player.role);

    return (
      <button
        type="button"
        onClick={() => navigate(`/player/${player.id}`)}
        className={`
          relative w-full rounded-xl overflow-hidden text-left transition-transform hover:scale-[1.02] active:scale-[0.99]
          bg-gradient-to-br ${TEAM_COLORS_gradient[player.team_name] || "from-gray-700 to-gray-900"}
          ${isCaptain ? "ring-2 ring-yellow-400 ring-offset-1 ring-offset-dark-500" : ""}
        `}
      >
        {isCaptain && (
          <span className="absolute top-1.5 right-2 text-yellow-400 text-xs font-bold z-10">★ C</span>
        )}
        <div className="p-3 flex items-center gap-2">
          {icon && (
            <img
              src={icon}
              alt={player.role}
              className={`w-7 h-7 object-contain flex-shrink-0 ${player.is_substituted ? "opacity-40" : ""}`}
            />
          )}
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-semibold truncate ${isCaptain ? "text-yellow-400" : "text-white"} ${player.is_substituted ? "opacity-50" : ""}`}>
              {player.name}
            </p>
            <p className="text-xs text-gray-400 truncate">{player.team_name}</p>
          </div>
          <p className="text-sm font-bold text-primary-500 flex-shrink-0">{scores.total}</p>
        </div>
      </button>
    );
  };

  // ── Shared player card (side-by-side points) ───────────────────────────────
  const SharedPlayerCard = ({ player }) => {
    const isMyCaptain    = myCaptainId === player.id;
    const isTheirCaptain = theirCaptainId === player.id;
    const myS    = myScores[player.id]    || { total: 0 };
    const theirS = theirScores[player.id] || { total: 0 };
    const diff   = myS.total - theirS.total;
    const icon   = getRoleIcon(player.role);
    const isCaptainEither = isMyCaptain || isTheirCaptain;

    return (
      <button
        type="button"
        onClick={() => navigate(`/player/${player.id}`)}
        className={`
          relative w-full rounded-xl overflow-hidden text-left transition-transform hover:scale-[1.02] active:scale-[0.99]
          bg-gradient-to-br ${TEAM_COLORS_gradient[player.team_name] || "from-gray-700 to-gray-900"}
          ${isCaptainEither ? "ring-2 ring-yellow-400 ring-offset-1 ring-offset-dark-500" : ""}
        `}
      >
        {isCaptainEither && (
          <span className="absolute top-1.5 right-2 text-yellow-400 text-xs font-bold z-10">★ C</span>
        )}
        <div className="p-3 flex items-center gap-2">
          {icon && (
            <img src={icon} alt={player.role} className="w-7 h-7 object-contain flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-semibold truncate ${isCaptainEither ? "text-yellow-400" : "text-white"}`}>
              {player.name}
            </p>
            <p className="text-xs text-gray-400 truncate">{player.team_name}</p>
          </div>
          {/* Points comparison */}
          <div className="flex items-center gap-2 flex-shrink-0 text-xs">
            <span className="font-bold text-primary-500">{myS.total}</span>
            <span className="text-gray-500">vs</span>
            <span className="font-bold text-gray-300">{theirS.total}</span>
            {diff !== 0 && (
              <span className={`font-semibold ${diff > 0 ? "text-green-400" : "text-red-400"}`}>
                ({diff > 0 ? "+" : ""}{diff})
              </span>
            )}
          </div>
        </div>
      </button>
    );
  };

  // ── Section header ─────────────────────────────────────────────────────────
  const SectionHeader = ({ label }) => (
    <div className="flex items-center gap-3 my-4">
      <div className="h-px flex-1 bg-gray-700" />
      <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest whitespace-nowrap">{label}</span>
      <div className="h-px flex-1 bg-gray-700" />
    </div>
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-dark-500 flex items-center justify-center">
        <div className="text-gray-400 text-sm animate-pulse">Loading comparison…</div>
      </div>
    );
  }

  // ── Render Selection Mode ──────────────────────────────────────────────────
  if (!opponentTeamId && !loading) {
    const filteredTeams = allTeams.filter(t => 
      t.team_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.users?.username || "").toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
      <div className="min-h-screen bg-dark-500 text-white py-4 md:py-8">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 space-y-6">
          <div className="bg-card-light rounded-2xl shadow-card p-6">
            <h1 className="text-2xl sm:text-3xl font-bold text-primary-500 mb-2">Compare Teams</h1>
            <p className="text-gray-400 mb-6">Select a team to compare against yours.</p>
            
            <input
              type="text"
              placeholder="Search teams or managers..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-dark-500 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-primary-500 transition-colors"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredTeams.map((team) => {
              const teamColor = TEAM_HEX_COLORS[team.team_name] || "#374151";
              return (
                <button
                  key={team.id}
                  onClick={() => navigate(`/compare/${team.id}`)}
                  className="bg-card-light p-4 rounded-xl shadow-card border border-transparent hover:border-primary-500 transition-all text-left group"
                >
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-inner"
                      style={{ backgroundColor: teamColor }}
                    >
                      {team.team_name.substring(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-white truncate group-hover:text-primary-400 transition-colors">
                        {team.team_name}
                      </p>
                      <p className="text-xs text-gray-400 truncate">
                        {team.users?.username || "Unknown"}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
            {filteredTeams.length === 0 && (
              <div className="col-span-full text-center py-8 text-gray-500">
                No teams found matching "{searchTerm}"
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-500 text-white py-4 md:py-8">
      <div className="max-w-5xl mx-auto px-3 sm:px-4 space-y-4 md:space-y-6">

        {/* ── Header ── */}
        <div className="bg-card-light rounded-2xl shadow-card p-4 sm:p-6">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors text-sm mb-4"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <h1 className="text-2xl sm:text-3xl font-bold text-primary-500">Team Comparison</h1>
            
            {/* Opponent Selector Dropdown */}
            <div className="relative w-full sm:w-auto">
              <select
                className="w-full sm:w-64 appearance-none bg-dark-600 text-white pl-4 pr-10 py-2 rounded-lg border border-gray-600 focus:outline-none focus:border-primary-500 cursor-pointer text-sm truncate"
                value={theirTeam.id || ""}
                onChange={(e) => {
                  if (e.target.value) navigate(`/compare/${e.target.value}`);
                }}
              >
                <option value="" disabled>Change Opponent</option>
                {allTeams.map(t => {
                  const stageName = stages.find(s => s.id === t.stage_id)?.stage_name;
                  return (
                    <option key={t.id} value={t.id}>
                      {t.team_name} ({t.users?.username}) {stageName ? `- ${stageName}` : ""}
                    </option>
                  );
                })}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-400">
                <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
              </div>
            </div>
          </div>

          {/* Stage Selector */}
          {stages.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-6">
              {stages.map((stage) => (
                <button
                  key={stage.id}
                  onClick={() => setSelectedStageId(stage.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    selectedStageId === stage.id
                      ? "bg-primary-500 text-black"
                      : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                  }`}
                >
                  {stage.stage_name}
                </button>
              ))}
            </div>
          )}

          {/* Score banner */}
          <div className="grid grid-cols-3 items-center gap-2 bg-dark-500 rounded-xl p-4">
            <div className="text-center">
              <p className="text-xs text-gray-400 mb-1 truncate">{myTeam.name}</p>
              <p className={`text-2xl sm:text-3xl font-bold ${myTotal >= theirTotal ? "text-primary-500" : "text-gray-300"}`}>
                {myTotal}
              </p>
            </div>

            <div className="flex flex-col items-center gap-1">
              {/* Diff pill */}
              <div className={`px-3 py-1 rounded-full text-xs font-bold ${
                myTotal > theirTotal
                  ? "bg-primary-500/20 text-primary-400"
                  : myTotal < theirTotal
                    ? "bg-red-500/20 text-red-400"
                    : "bg-gray-700 text-gray-400"
              }`}>
                {myTotal > theirTotal ? `+${myTotal - theirTotal}` : myTotal < theirTotal ? `${myTotal - theirTotal}` : "Tied"}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                <span className="text-primary-400 font-semibold">{diffCount}</span> diff{diffCount !== 1 ? "s" : ""}
              </p>
            </div>

            <div className="text-center">
              <p className="text-xs text-gray-400 mb-1 truncate">{theirTeam.name}</p>
              <p className={`text-2xl sm:text-3xl font-bold ${theirTotal > myTotal ? "text-primary-500" : "text-gray-300"}`}>
                {theirTotal}
              </p>
            </div>
          </div>
        </div>

        {/* ── Different Picks ── */}
        {diffCount > 0 && (
          <div className="bg-card-light rounded-2xl shadow-card p-4 sm:p-6">
            <h2 className="text-lg sm:text-xl font-bold text-primary-500">
              Different Picks
              <span className="ml-2 text-sm font-normal text-gray-400">({diffCount} unique each)</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              {/* My unique picks */}
              <div>
                <SectionHeader label={`Only in ${myTeam.name}`} />
                <div className="space-y-2">
                  {uniqueToMe.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-3">No unique picks</p>
                  ) : (
                    uniqueToMe.map((player) => (
                      <PlayerCard
                        key={player.id}
                        player={player}
                        scoreMap={myScores}
                        captainId={myCaptainId}
                        side="mine"
                      />
                    ))
                  )}
                </div>
              </div>

              {/* Their unique picks */}
              <div>
                <SectionHeader label={`Only in ${theirTeam.name}`} />
                <div className="space-y-2">
                  {uniqueToThem.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-3">No unique picks</p>
                  ) : (
                    uniqueToThem.map((player) => (
                      <PlayerCard
                        key={player.id}
                        player={player}
                        scoreMap={theirScores}
                        captainId={theirCaptainId}
                        side="theirs"
                      />
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Same Picks ── */}
        {sharedByBoth.length > 0 && (
          <div className="bg-card-light rounded-2xl shadow-card p-4 sm:p-6">
            <h2 className="text-lg sm:text-xl font-bold text-primary-500">
              Same Picks
              <span className="ml-2 text-sm font-normal text-gray-400">({sharedByBoth.length} players)</span>
            </h2>
            <p className="text-xs text-gray-500 mt-1 mb-4">
              Points shown as <span className="text-primary-400">yours</span> vs <span className="text-gray-300">theirs</span>
              {" · "}captain score may differ due to multiplier
            </p>

            <div className="space-y-2">
              {sharedByBoth.map((player) => (
                <SharedPlayerCard key={player.id} player={player} />
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && myTeam.players.length === 0 && theirTeam.players.length === 0 && (
          <div className="bg-card-light rounded-2xl shadow-card p-8 text-center">
            <p className="text-gray-400">Could not load teams for comparison.</p>
            <button
              onClick={() => navigate(-1)}
              className="mt-4 px-5 py-2 bg-primary-500 hover:bg-primary-600 text-black font-semibold rounded-full text-sm transition-colors"
            >
              Go Back
            </button>
          </div>
        )}

      </div>
    </div>
  );
}