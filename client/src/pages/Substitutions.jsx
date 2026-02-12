import React, { useEffect, useState } from "react";
import { supabase } from "../utils/supabaseClient";
import { useTeam } from "../context/TeamContext";

export default function SubstitutionLog() {
  const { tournamentId } = useTeam();
  const [loading, setLoading] = useState(true);
  const [substitutions, setSubstitutions] = useState([]);
  const [teamsStatus, setTeamsStatus] = useState([]);
  const [maxSubs, setMaxSubs] = useState(3);

  useEffect(() => {
    if (!tournamentId) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        // 1. Get Max Subs setting
        const { data: settings } = await supabase
          .from('tournament_settings')
          .select('max_subs')
          .eq('tournament_id', tournamentId)
          .single();
        
        const currentMaxSubs = settings?.max_subs || 3;
        setMaxSubs(currentMaxSubs);

        // 2. Fetch Completed Substitutions
        const { data: subsData, error: subsError } = await supabase
          .from('substitutions')
          .select(`
            id,
            requested_at,
            teams (team_name),
            player_in:squads!player_in_id (name),
            player_out:squads!player_out_id (name)
          `)
          .eq('tournament_id', tournamentId)
          .eq('status', 'completed')
          .order('requested_at', { ascending: false });

        if (subsError) throw subsError;
        setSubstitutions(subsData || []);

        // 3. Fetch Teams and Subs Used
        const { data: teamsData, error: teamsError } = await supabase
          .from('teams')
          .select('id, team_name, subs_used, users (username)')
          .eq('tournament_id', tournamentId)
          .order('team_name');

        if (teamsError) throw teamsError;
        setTeamsStatus(teamsData || []);

      } catch (error) {
        console.error("Error fetching substitution log:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [tournamentId]);

  const formatDate = (dateString) => {
    const d = new Date(dateString.replace(' ', 'T') + 'Z');

    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');

    return `${day}-${month}-${year} ${hours}:${minutes}`;
    };

  if (loading) return <div className="min-h-screen bg-dark-500 flex items-center justify-center text-white">Loading...</div>;

  return (
    <div className="min-h-screen bg-dark-500 text-white py-4 sm:py-8">
      <div className="max-w-6xl mx-auto px-2 sm:px-4 space-y-6 sm:space-y-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-primary-500 mb-4 sm:mb-6">Substitution Log</h1>

        {/* Section 1: Completed Substitutions */}
        <div className="bg-card-light rounded-2xl shadow-card p-4 sm:p-6">
          <h2 className="text-lg sm:text-xl font-bold text-white mb-4">Completed Substitutions</h2>
          {substitutions.length === 0 ? (
            <p className="text-gray-400">No substitutions have been made yet.</p>
          ) : (
            <>
              {/* Mobile View */}
              <div className="block sm:hidden space-y-3 max-h-96 overflow-y-auto pr-1">
                {substitutions.map((sub) => (
                  <div key={sub.id} className="bg-dark-500 p-3 rounded-lg border border-gray-700 flex  items-center flex-col gap-1">
                    <div className="font-bold text-white text-sm">{sub.teams?.team_name}</div>
                    <div className="text-xs flex text-center items-center gap-x-2 gap-y-1">
                      <span className="text-red-400 text-center whitespace-nowrap">OUT: {sub.player_out?.name}</span>
                      <span className="text-green-400 text-center whitespace-nowrap">IN: {sub.player_in?.name}</span>
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
                      <th className="pb-3 px-2">Out</th>
                      <th className="pb-3 px-2">In</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {substitutions.map((sub) => (
                      <tr key={sub.id} className="hover:bg-dark-600 transition-colors">
                        <td className="py-3 px-2 text-sm text-gray-300 whitespace-nowrap">{formatDate(sub.requested_at)}</td>
                        <td className="py-3 px-2 font-medium text-white">{sub.teams?.team_name}</td>
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
          <h2 className="text-lg sm:text-xl font-bold text-white mb-4">Substitutions Remaining</h2>
          <div className="grid grid-cols-3 items-center gap-2 sm:gap-4">
            {teamsStatus.map((team) => {
              const used = team.subs_used || 0;
              const slots = [];
              
              // Generate blocks: Red for used, Green for available
              for (let i = 0; i < maxSubs; i++) {
                 if (i < used) {
                     slots.push('red');
                 } else {
                     slots.push('green');
                 }
              }

              return (
                <div key={team.id} className="bg-dark-500 p-2 sm:p-4 rounded-lg sm:rounded-xl items-center flex flex-col sm:flex-row items-start sm:items-center justify-between border border-gray-700 gap-1 sm:gap-0">
                  <div className="min-w-0 w-full pr-0 sm:pr-2">
                    <div className="font-semibold text-white truncate text-[10px] sm:text-base">{team.team_name}</div>
                    <div className="text-[9px] sm:text-xs text-gray-400 truncate">{team.users?.username}</div>
                  </div>
                  <div className="flex gap-0.5 sm:gap-1 flex-shrink-0 mt-1 sm:mt-0">
                    {slots.map((color, idx) => (
                      <div 
                        key={idx} 
                        className={`w-2 h-2 sm:w-4 sm:h-4 rounded-sm ${color === 'green' ? 'bg-green-500' : 'bg-red-500'}`}
                        title={color === 'green' ? 'Available' : 'Used'}
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
