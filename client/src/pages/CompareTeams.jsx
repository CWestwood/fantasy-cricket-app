import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { TEAM_COLORS_gradient, TEAM_HEX_COLORS } from "../constants/colors";
import { useTeam } from "../context/TeamContext";
import { supabase } from "../utils/supabaseClient";
import BatIcon from "../assets/icons/bat_white.svg";
import BallIcon from "../assets/icons/ball_white.svg";
import AllrounderIcon from "../assets/icons/allrounder_white.svg";
import WkglovesIcon from "../assets/icons/wkgloves_white.svg";

// ── Role icons ────────────────────────────────────────────────────────────────
const roleIconMap = {
  batter: BatIcon,
  bowler: BallIcon,
  allrounder: AllrounderIcon,
  wicketkeeper: WkglovesIcon,
};
const getRoleIcon = (role) => roleIconMap[(role || "").toLowerCase()] || null;

// ── Data helpers ──────────────────────────────────────────────────────────────
const fetchPlayersForTeam = async (teamId) => {
  if (!teamId) return [];
  const { data } = await supabase
    .from("team_players")
    .select(`player_id, is_captain, is_substituted, squads:player_id (*)`)
    .eq("team_id", teamId);
  return (data || [])
    .map((tp) => ({ ...tp.squads, is_captain: tp.is_captain, is_substituted: tp.is_substituted }))
    .filter(Boolean);
};

const fetchScoresForTeam = async (teamId, playerIds, tournamentId) => {
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
    map[row.player_id].batting  += row.batting  || 0;
    map[row.player_id].bowling  += row.bowling  || 0;
    map[row.player_id].fielding += row.fielding || 0;
    map[row.player_id].bonus    += row.bonus    || 0;
    map[row.player_id].total    += row.fantasy_total || 0;
  });
  return map;
};

// ── Team Selector Panel ───────────────────────────────────────────────────────
function TeamSelectorPanel({ label, allTeams, stages, selectedTeamId, onSelect, filterStageId }) {
  const [search, setSearch] = useState("");

  const filtered = allTeams.filter((t) => {
    const q = search.toLowerCase();
    const matchesStage = filterStageId ? t.stage_id === filterStageId : true;
    const matchesSearch = (t.team_name || "").toLowerCase().includes(q) ||
                          (t.users?.username || "").toLowerCase().includes(q);
    return matchesStage && matchesSearch;
  });

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">{label}</p>
      </div>
      <input
        type="text"
        placeholder="Search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full px-2 py-2 mb-1 rounded-lg bg-dark-600 border border-gray-700 text-white placeholder-gray-500 text-[10px] focus:outline-none focus:border-primary-500 transition-colors"
      />
      <div className="overflow-y-auto space-y-1 pr-0.5" style={{ maxHeight: '60vh', minHeight: '300px' }}>
        {filtered.length === 0 && (
          <p className="text-xs text-gray-500 text-center py-6">No teams found</p>
        )}
        {filtered.map((team) => {
          const isSelected = team.id === selectedTeamId;
          const stageName  = stages.find((s) => s.id === team.stage_id)?.stage_name;
          const initials   = (team.team_name || "??").substring(0, 2).toUpperCase();
          const color      = TEAM_HEX_COLORS?.[team.team_name] || "#374151";

          return (
            <button
              key={team.id}
              onClick={() => onSelect(team.id)}
              className={`w-full flex items-center gap-2 p-2 rounded-lg text-left transition-all border ${
                isSelected
                  ? "border-primary-500 bg-primary-500/10"
                  : "border-transparent hover:bg-dark-600"
              }`}
            >
              
              <div className="min-w-0 flex-1">
                <p className={`text-[10px] font-semibold truncate ${isSelected ? "text-primary-400" : "text-white"}`}>
                  {team.team_name}
                </p>
                <p className="text-[10px] text-gray-500 truncate">
                  {team.users?.username || "Unknown"}
                </p>
              </div>
              {isSelected && (
                <svg className="w-3.5 h-3.5 text-primary-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                </svg>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Compact Player Card (used in the "Different Picks" columns) ───────────────
function PlayerCard({ player, score, isCaptain }) {
  const navigate = useNavigate();
  const icon  = getRoleIcon(player.role);
  const total = score?.total || 0;

  return (
    <button
      type="button"
      onClick={() => navigate(`/player/${player.id}`)}
      className={`
        relative w-full rounded-lg overflow-hidden text-left transition-transform
        hover:scale-[1.02] active:scale-[0.98]
        bg-gradient-to-br ${TEAM_COLORS_gradient[player.team_name] || "from-gray-700 to-gray-900"}
        ${isCaptain ? "ring-2 ring-yellow-400 ring-offset-1 ring-offset-dark-500" : ""}
      `}
    >
      {isCaptain && (
        <span className="absolute top-1 right-1 text-yellow-400 text-[9px] font-bold z-10 leading-none">★C</span>
      )}
      <div className="p-2 flex items-center gap-1.5">
        {icon && (
          <img src={icon} alt={player.role} className="w-5 h-5 object-contain flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className={`text-[11px] font-semibold truncate leading-tight ${isCaptain ? "text-yellow-400" : "text-white"}`}>
            {player.name}
          </p>
          <p className="text-[9px] text-gray-400 truncate">{player.team_name}</p>
        </div>
        <p className="text-[11px] font-bold text-primary-500 flex-shrink-0">{total}</p>
      </div>
    </button>
  );
}

// ── Shared Player Card — both scores side by side in one row ──────────────────
function SharedPlayerCard({ player, leftScore, rightScore, leftCaptainId, rightCaptainId }) {
  const navigate = useNavigate();
  const isLeftCaptain   = leftCaptainId  === player.id;
  const isRightCaptain  = rightCaptainId === player.id;
  const isCaptainEither = isLeftCaptain || isRightCaptain;
  const icon   = getRoleIcon(player.role);
  const lTotal = leftScore?.total  || 0;
  const rTotal = rightScore?.total || 0;
  const diff   = lTotal - rTotal;

  return (
    <button
      type="button"
      onClick={() => navigate(`/player/${player.id}`)}
      className={`
        relative w-full rounded-lg overflow-hidden text-left transition-transform
        hover:scale-[1.02] active:scale-[0.98]
        bg-gradient-to-br ${TEAM_COLORS_gradient[player.team_name] || "from-gray-700 to-gray-900"}
        ${isCaptainEither ? "ring-2 ring-yellow-400 ring-offset-1 ring-offset-dark-500" : ""}
      `}
    >
      {isCaptainEither && (
        <span className="absolute top-1 right-1 text-yellow-400 text-[9px] font-bold z-10 leading-none">★C</span>
      )}
      <div className="p-2 flex items-center gap-1.5">
        {icon && <img src={icon} alt={player.role} className="w-5 h-5 object-contain flex-shrink-0" />}
        <p className={`flex-1 text-[11px] font-semibold truncate ${isCaptainEither ? "text-yellow-400" : "text-white"}`}>
          {player.name}
        </p>
        {/* Score strip */}
        <div className="flex items-center gap-1 flex-shrink-0 font-bold">
          <span className={`text-[11px] w-5 text-right ${isLeftCaptain ? "text-yellow-400" : "text-primary-500"}`}>
            {lTotal}
          </span>
          <span className="text-gray-600 text-[10px]">|</span>
          <span className={`text-[11px] w-5 text-left ${isRightCaptain ? "text-yellow-400" : "text-gray-300"}`}>
            {rTotal}
          </span>
          <span className={`text-[10px] w-7 text-right ${diff > 0 ? "text-green-400" : diff < 0 ? "text-red-400" : "text-gray-600"}`}>
            {diff > 0 ? `+${diff}` : diff < 0 ? `${diff}` : "="}
          </span>
        </div>
      </div>
    </button>
  );
}

// ── Score Banner ──────────────────────────────────────────────────────────────
function ScoreBanner({ leftName, rightName, leftTotal, rightTotal, diffCount }) {
  const diff = leftTotal - rightTotal;
  return (
    <div className="grid grid-cols-3 items-center gap-2 bg-dark-500 rounded-xl p-4">
      <div className="text-center">
        <p className="text-xs text-gray-400 mb-1 truncate">{leftName || "Team A"}</p>
        <p className={`text-2xl sm:text-3xl font-bold ${leftTotal >= rightTotal ? "text-primary-500" : "text-gray-300"}`}>
          {leftTotal}
        </p>
      </div>
      <div className="flex flex-col items-center gap-1">
        <div className={`px-3 py-1 rounded-full text-xs font-bold ${
          diff > 0 ? "bg-primary-500/20 text-primary-400"
          : diff < 0 ? "bg-red-500/20 text-red-400"
          : "bg-gray-700 text-gray-400"
        }`}>
          {diff > 0 ? `+${diff}` : diff < 0 ? `${diff}` : "Tied"}
        </div>
        <p className="text-xs text-gray-500 mt-0.5">
          <span className="text-primary-400 font-semibold">{diffCount}</span>{" "}
          diff{diffCount !== 1 ? "s" : ""}
        </p>
      </div>
      <div className="text-center">
        <p className="text-xs text-gray-400 mb-1 truncate">{rightName || "Team B"}</p>
        <p className={`text-2xl sm:text-3xl font-bold ${rightTotal > leftTotal ? "text-primary-500" : "text-gray-300"}`}>
          {rightTotal}
        </p>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function TeamComparePage() {
  const navigate = useNavigate();
  const { tournamentId } = useTeam();

  const [allTeams,     setAllTeams]     = useState([]);
  const [stages,       setStages]       = useState([]);
  const [leftTeamId,   setLeftTeamId]   = useState(null);
  const [rightTeamId,  setRightTeamId]  = useState(null);
  const [leftTeam,     setLeftTeam]     = useState({ id: null, name: "", players: [] });
  const [rightTeam,    setRightTeam]    = useState({ id: null, name: "", players: [] });
  const [leftScores,   setLeftScores]   = useState({});
  const [rightScores,  setRightScores]  = useState({});
  const [loadingLeft,  setLoadingLeft]  = useState(false);
  const [loadingRight, setLoadingRight] = useState(false);
  const [loadingList,  setLoadingList]  = useState(true);
  const [showPicker,   setShowPicker]   = useState(true);
  const [filterStageId, setFilterStageId] = useState(null);

  // ── Fetch stages + all teams ──────────────────────────────────────────────
  useEffect(() => {
    if (!tournamentId) return;
    const init = async () => {
      setLoadingList(true);
      const [{ data: stagesData }, { data: teamsData }] = await Promise.all([
        supabase.from("tournament_stages").select("id, stage_name").eq("tournament_id", tournamentId).order("id"),
        supabase.from("teams").select("id, team_name, user_id, stage_id, users(username)").eq("tournament_id", tournamentId).order("team_name"),
      ]);
      if (stagesData) {
        setStages(stagesData);
        // Default to Super8s if available, otherwise first stage
        const defaultStage = stagesData.find(s => s.stage_name.includes("Super8")) || stagesData[0];
        if (defaultStage) setFilterStageId(defaultStage.id);
      }
      if (teamsData)  setAllTeams(teamsData);
      setLoadingList(false);
    };
    init();
  }, [tournamentId]);

  // ── Load a team on selection ──────────────────────────────────────────────
  const loadTeam = useCallback(async (teamId, side) => {
    const setLoading = side === "left" ? setLoadingLeft : setLoadingRight;
    const setTeam    = side === "left" ? setLeftTeam    : setRightTeam;
    const setScores  = side === "left" ? setLeftScores  : setRightScores;

    if (!teamId) {
      setTeam({ id: null, name: "", players: [] });
      setScores({});
      return;
    }
    setLoading(true);
    try {
      const meta    = allTeams.find((t) => t.id === teamId);
      const players = await fetchPlayersForTeam(teamId);
      const scores  = await fetchScoresForTeam(teamId, players.map((p) => p.id), tournamentId);
      setTeam({ id: teamId, name: meta?.team_name || "Team", players });
      setScores(scores);
    } catch (e) {
      console.error(`Error loading ${side} team:`, e);
    } finally {
      setLoading(false);
    }
  }, [allTeams, tournamentId]);

  useEffect(() => { loadTeam(leftTeamId,  "left");  }, [leftTeamId,  loadTeam]);
  useEffect(() => { loadTeam(rightTeamId, "right"); }, [rightTeamId, loadTeam]);

  // ── Derived sets ──────────────────────────────────────────────────────────
  const leftIds  = new Set(leftTeam.players.map((p) => p.id));
  const rightIds = new Set(rightTeam.players.map((p) => p.id));

  const uniqueLeft  = leftTeam.players.filter((p)  => !rightIds.has(p.id));
  const uniqueRight = rightTeam.players.filter((p) => !leftIds.has(p.id));
  const shared      = leftTeam.players.filter((p)  => rightIds.has(p.id));
  const diffCount   = uniqueLeft.length;

  const leftCaptainId  = leftTeam.players.find((p)  => p.is_captain && !p.is_substituted)?.id;
  const rightCaptainId = rightTeam.players.find((p) => p.is_captain && !p.is_substituted)?.id;

  const leftTotal  = Object.values(leftScores).reduce((s, v)  => s + (v.total || 0), 0);
  const rightTotal = Object.values(rightScores).reduce((s, v) => s + (v.total || 0), 0);

  const bothSelected = !!(leftTeamId && rightTeamId);
  const isLoading    = loadingLeft || loadingRight;

  const handleLeftSelect  = (id) => { setLeftTeamId(id);  if (rightTeamId) setShowPicker(false); };
  const handleRightSelect = (id) => { setRightTeamId(id); if (leftTeamId)  setShowPicker(false); };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-dark-500 text-white py-4 md:py-8">
      <div className="max-w-5xl mx-auto px-3 sm:px-4 space-y-4 md:space-y-6">

        {/* ── Header card ── */}
        <div className="bg-card-light rounded-2xl shadow-card p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors text-sm"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>
            {bothSelected && (
              <button
                onClick={() => setShowPicker(!showPicker)}
                className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                  showPicker ? "bg-primary-500/20 text-primary-400" : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l4-4 4 4M8 15l4 4 4-4"/>
                </svg>
                {showPicker ? "Hide Picker" : "Change Teams"}
              </button>
            )}
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold text-primary-500 mb-4">Team Comparison</h1>

          {/* Stage Toggle */}
          {stages.length > 0 && (
            <div className="flex justify-center mb-6">
              <div className="bg-dark-600 p-1 rounded-full inline-flex">
                {stages.map((stage) => {
                  const isActive = filterStageId === stage.id;
                  let label = stage.stage_name;
                  if (label.includes("Super8")) label = "Super8s";
                  else if (label.includes("Group")) label = "Group";

                  return (
                    <button
                      key={stage.id}
                      onClick={() => setFilterStageId(stage.id)}
                      className={`px-6 py-2 rounded-full text-sm font-bold transition-all ${
                        isActive
                          ? "bg-primary-500 text-black shadow-lg"
                          : "text-gray-400 hover:text-white"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Team pickers — always 2 columns side by side */}
          {(showPicker || !bothSelected) && (
            <div className={`grid grid-cols-2 gap-3 mb-4 ${loadingList ? "opacity-50 pointer-events-none" : ""}`}>
              <div className="bg-dark-500 rounded-xl p-3">
                <TeamSelectorPanel
                  label="Team A"
                  allTeams={allTeams.filter((t) => t.id !== rightTeamId)}
                  stages={stages}
                  selectedTeamId={leftTeamId}
                  onSelect={handleLeftSelect}
                  filterStageId={filterStageId}
                />
              </div>
              <div className="bg-dark-500 rounded-xl p-3">
                <TeamSelectorPanel
                  label="Team B"
                  allTeams={allTeams.filter((t) => t.id !== leftTeamId)}
                  stages={stages}
                  selectedTeamId={rightTeamId}
                  onSelect={handleRightSelect}
                  filterStageId={filterStageId}
                />
              </div>
            </div>
          )}

          {/* Score banner */}
          {bothSelected && (
            <ScoreBanner
              leftName={leftTeam.name}
              rightName={rightTeam.name}
              leftTotal={leftTotal}
              rightTotal={rightTotal}
              diffCount={diffCount}
            />
          )}

          {!bothSelected && (
            <p className="text-xs text-gray-500 text-center pt-2">
              Select a team in each column above to start comparing.
            </p>
          )}
        </div>

        {/* ── Loading ── */}
        {isLoading && bothSelected && (
          <div className="flex items-center justify-center py-10">
            <p className="text-gray-400 text-sm animate-pulse">Loading players…</p>
          </div>
        )}

        {/* ── Comparison content ── */}
        {bothSelected && !isLoading && (
          <>
            {/* Different Picks */}
            {diffCount > 0 && (
              <div className="bg-card-light rounded-2xl shadow-card p-4 sm:p-6">
                <h2 className="text-lg sm:text-xl font-bold text-primary-500 mb-3">
                  Different Picks
                  <span className="ml-2 text-sm font-normal text-gray-400">({diffCount} unique each)</span>
                </h2>

                {/* Column headers — always visible at any width */}
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <p className="text-xs font-semibold text-gray-400 truncate text-center px-1">{leftTeam.name}</p>
                  <p className="text-xs font-semibold text-gray-400 truncate text-center px-1">{rightTeam.name}</p>
                </div>

                {/* Zip left + right unique players into paired rows */}
                <div className="space-y-1.5">
                  {Array.from({ length: Math.max(uniqueLeft.length, uniqueRight.length) }).map((_, i) => {
                    const lp = uniqueLeft[i];
                    const rp = uniqueRight[i];
                    return (
                      <div key={i} className="grid grid-cols-2 gap-2">
                        <div>
                          {lp ? (
                            <PlayerCard player={lp} score={leftScores[lp.id]} isCaptain={leftCaptainId === lp.id} />
                          ) : <div />}
                        </div>
                        <div>
                          {rp ? (
                            <PlayerCard player={rp} score={rightScores[rp.id]} isCaptain={rightCaptainId === rp.id} />
                          ) : <div />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Same Picks */}
            {shared.length > 0 && (
              <div className="bg-card-light rounded-2xl shadow-card p-4 sm:p-6">
                <h2 className="text-lg sm:text-xl font-bold text-primary-500">
                  Same Picks
                  <span className="ml-2 text-sm font-normal text-gray-400">({shared.length} players)</span>
                </h2>
                <p className="text-xs text-gray-500 mt-1 mb-3">
                  <span className="text-primary-400 font-semibold">{leftTeam.name}</span>
                  <span className="text-gray-600"> | </span>
                  <span className="text-gray-300 font-semibold">{rightTeam.name}</span>
                  <span className="text-gray-600"> · captain multiplier may differ</span>
                </p>
                <div className="space-y-1.5">
                  {shared.map((player) => (
                    <SharedPlayerCard
                      key={player.id}
                      player={player}
                      leftScore={leftScores[player.id]}
                      rightScore={rightScores[player.id]}
                      leftCaptainId={leftCaptainId}
                      rightCaptainId={rightCaptainId}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Both teams empty */}
            {leftTeam.players.length === 0 && rightTeam.players.length === 0 && (
              <div className="bg-card-light rounded-2xl shadow-card p-8 text-center">
                <p className="text-gray-400">No player data found for the selected teams.</p>
              </div>
            )}
          </>
        )}

      </div>
    </div>
  );
}