import React, { useEffect, useState } from "react";
import { supabase } from "../utils/supabaseClient";
import { useTeam } from "../context/TeamContext";

export default function SubstitutionLog() {
  // Only tournamentId and viewStage come from context.
  // activeStage is intentionally NOT used — it reflects the pickable stage
  // for TeamSelection and is irrelevant here.
  const { tournamentId, viewStage } = useTeam();

  const [loading, setLoading] = useState(true);
  const [substitutions, setSubstitutions] = useState([]);
  const [teamsStatus, setTeamsStatus] = useState([]);
  const [maxSubs, setMaxSubs] = useState(3);
  const [allStages, setAllStages] = useState([]);

  // Local stage selector — seeded from viewStage but user-controllable
  const [selectedStage, setSelectedStage] = useState(null);

  // Seed selectedStage from viewStage once it resolves
  useEffect(() => {
    if (viewStage && !selectedStage) {
      setSelectedStage(viewStage);
    }
  }, [viewStage]);

  // Load all stages for the selector tabs
  useEffect(() => {
    if (!tournamentId) return;
    const loadStages = async () => {
      const { data } = await supabase
        .from("tournament_stages")
        .select("id, stage_name")
        .eq("tournament_id", tournamentId)
        .order("id", { ascending: true });
      if (data) setAllStages(data);
    };
    loadStages();
  }, [tournamentId]);

  // Fetch substitution data scoped to selectedStage
  useEffect(() => {
    if (!tournamentId) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        // 1. Get max_subs for the selected stage specifically
        const settingsQuery = supabase
          .from("tournament_settings")
          .select("max_subs")
          .eq("tournament_id", tournamentId);

        const { data: settings } = selectedStage?.id
          ? await settingsQuery.eq("stage_id", selectedStage.id).maybeSingle()
          : await settingsQuery.maybeSingle();

        setMaxSubs(settings?.max_subs || 3);

        // 2. Fetch completed substitutions (all stages — shown with stage label)
        const { data: subsData, error: subsError } = await supabase
          .from("substitutions")
          .select(`
            id,
            requested_at,
            teams (team_name),
            stage_id,
            player_in:squads!player_in_id (name),
            player_out:squads!player_out_id (name)
          `)
          .eq("tournament_id", tournamentId)
          .eq("status", "completed")
          .order("requested_at", { ascending: false });

        if (subsError) throw subsError;

        // 3. Fetch stage names to label each substitution row
        const { data: stagesData } = await supabase
          .from("tournament_stages")
          .select("id, stage_name")
          .eq("tournament_id", tournamentId);

        const stageIdToName = {};
        stagesData?.forEach((s) => { stageIdToName[s.id] = s.stage_name; });

        setSubstitutions(
          (subsData || []).map((sub) => ({
            ...sub,
            stageName: sub.stage_id ? stageIdToName[sub.stage_id] : "-",
          }))
        );

        // 4. Fetch teams scoped to selectedStage for the subs-remaining grid
        const teamsQuery = supabase
          .from("teams")
          .select("id, team_name, subs_used, users (username)")
          .eq("tournament_id", tournamentId)
          .order("team_name");

        const { data: teamsData, error: teamsError } = selectedStage?.id
          ? await teamsQuery.eq("stage_id", selectedStage.id)
          : await teamsQuery;

        if (teamsError) throw teamsError;
        setTeamsStatus(teamsData || []);

      } catch (err) {
        console.error("Error fetching substitution log:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [tournamentId, selectedStage?.id]); // selectedStage.id not activeStage

  const formatDate = (dateString) => {
    const d = new Date(dateString);
    return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-500 flex items-center justify-center text-white">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-500 text-white py-4 sm:py-8">
      <div className="max-w-6xl mx-auto px-2 sm:px-4 space-y-6 sm:space-y-8">

        {/* Header with stage selector */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h1 className="text-2xl sm:text-3xl font-bold text-primary-500">
            Substitution Log
            {selectedStage && (
              <span className="ml-3 text-sm font-normal text-gray-400 bg-dark-600 px-2 py-1 rounded-full border border-gray-600 align-middle">
                {selectedStage.stage_name}
              </span>
            )}
          </h1>

          {/* Stage selector tabs — only shown when multiple stages exist */}
          {allStages.length > 1 && (
            <div className="flex gap-2">
              {allStages.map((stage) => (
                <button
                  key={stage.id}
                  onClick={() => setSelectedStage(stage)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    selectedStage?.id === stage.id
                      ? "bg-primary-500 text-black"
                      : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                  }`}
                >
                  {stage.stage_name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Section 1: Completed Substitutions */}
        <div className="bg-card-light rounded-2xl shadow-card p-4 sm:p-6">
          <h2 className="text-lg sm:text-xl font-bold text-white mb-4">
            Completed Substitutions
          </h2>
          {substitutions.length === 0 ? (
            <p className="text-gray-400">No substitutions have been made yet.</p>
          ) : (
            <>
              {/* Mobile View */}
              <div className="block sm:hidden space-y-3 max-h-96 overflow-y-auto pr-1">
                {substitutions.map((sub) => (
                  <div
                    key={sub.id}
                    className="bg-dark-500 p-3 rounded-lg border border-gray-700 flex items-center flex-col gap-1"
                  >
                    <div className="font-bold text-white text-sm">
                      {sub.teams?.team_name}
                      {sub.stageName && (
                        <span className="ml-2 text-xs font-normal text-gray-500">
                          ({sub.stageName})
                        </span>
                      )}
                    </div>
                    <div className="text-xs flex text-center items-center gap-x-2 gap-y-1">
                      <span className="text-red-400 text-center whitespace-nowrap">
                        OUT: {sub.player_out?.name}
                      </span>
                      <span className="text-green-400 text-center whitespace-nowrap">
                        IN: {sub.player_in?.name}
                      </span>
                    </div>
                    <div className="text-[10px] text-gray-400 mt-1">
                      {formatDate(sub.requested_at)}
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop View */}
              <div className="hidden sm:block overflow-auto max-h-96">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-gray-400 border-b border-gray-700">
                      <th className="pb-3 px-2">Time</th>
                      <th className="pb-3 px-2">Team</th>
                      <th className="pb-3 px-2">Stage</th>
                      <th className="pb-3 px-2">Out</th>
                      <th className="pb-3 px-2">In</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {substitutions.map((sub) => (
                      <tr key={sub.id} className="hover:bg-dark-600 transition-colors">
                        <td className="py-3 px-2 text-sm text-gray-300 whitespace-nowrap">
                          {formatDate(sub.requested_at)}
                        </td>
                        <td className="py-3 px-2 font-medium text-white">
                          {sub.teams?.team_name}
                        </td>
                        <td className="py-3 px-2 text-xs text-gray-400">
                          {sub.stageName}
                        </td>
                        <td className="py-3 px-2 text-red-400">{sub.player_out?.name}</td>
                        <td className="py-3 px-2 text-green-400">{sub.player_in?.name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* Section 2: Team Substitution Status */}
        <div className="bg-card-light rounded-2xl shadow-card p-4 sm:p-6">
          <h2 className="text-lg sm:text-xl font-bold text-white mb-4">
            Substitutions Remaining
          </h2>
          <div className="grid grid-cols-3 items-center gap-2 sm:gap-4">
            {teamsStatus.map((team) => {
              const used = team.subs_used || 0;
              const slots = Array.from({ length: maxSubs }, (_, i) =>
                i < used ? "red" : "green"
              );

              return (
                <div
                  key={team.id}
                  className="bg-dark-500 p-2 sm:p-4 rounded-lg sm:rounded-xl items-center flex flex-col sm:flex-row items-start sm:items-center justify-between border border-gray-700 gap-1 sm:gap-0"
                >
                  <div className="min-w-0 w-full pr-0 sm:pr-2">
                    <div className="font-semibold text-white truncate text-[10px] sm:text-base">
                      {team.team_name}
                    </div>
                    <div className="text-[9px] sm:text-xs text-gray-400 truncate">
                      {team.users?.username}
                    </div>
                  </div>
                  <div className="flex gap-0.5 sm:gap-1 flex-shrink-0 mt-1 sm:mt-0">
                    {slots.map((color, idx) => (
                      <div
                        key={idx}
                        className={`w-2 h-2 sm:w-4 sm:h-4 rounded-sm ${
                          color === "green" ? "bg-green-500" : "bg-red-500"
                        }`}
                        title={color === "green" ? "Available" : "Used"}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}