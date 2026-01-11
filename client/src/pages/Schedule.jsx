import React, { useEffect, useState } from "react";
import { supabase } from "../utils/supabaseClient";
import { useTeam } from "../context/TeamContext";
import { TEAM_COLORS } from "../constants/colors";

export default function Schedule() {
  const { tournamentId } = useTeam();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [matches, setMatches] = useState([]);
  const [filteredMatches, setFilteredMatches] = useState([]);
  const [teams, setTeams] = useState([]);
  const [locations, setLocations] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState("");
  const [selectedLocation, setSelectedLocation] = useState("");

  useEffect(() => {
    if (!tournamentId) {
      setError("No tournament selected.");
      setLoading(false);
      return;
    }
    fetchMatches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId]);

  async function fetchMatches() {
    setError("");
    setLoading(true);
    try {
      const res = await supabase
        .from("matches")
        .select("*")
        .eq("tournament_id", tournamentId)
        .order("match_time", { ascending: true });

      console.debug("Schedule: matches ->", res);

      if (res.error) {
        console.error("Query error", res.error);
        setError(String(res.error.message || res.error));
        setMatches([]);
        setFilteredMatches([]);
      } else {
        const data = res.data || [];
        setMatches(data);
        setFilteredMatches(data);

        // Extract unique teams
        const teamSet = new Set();
        data.forEach((m) => {
          if (m.team1) teamSet.add(m.team1);
          if (m.team2) teamSet.add(m.team2);
        });
        setTeams(Array.from(teamSet).sort());

        // Extract unique locations
        const locSet = new Set();
        data.forEach((m) => {
          if (m.location) locSet.add(m.location);
        });
        setLocations(Array.from(locSet).sort());
      }
    } catch (e) {
      console.error(e);
      setError(String(e.message || e));
      setMatches([]);
      setFilteredMatches([]);
    } finally {
      setLoading(false);
    }
  }

  // Apply filters whenever filter values change
  useEffect(() => {
    let filtered = matches;

    if (selectedTeam) {
      filtered = filtered.filter(
        (m) => m.team1 === selectedTeam || m.team2 === selectedTeam
      );
    }

    if (selectedLocation) {
      filtered = filtered.filter((m) => m.location === selectedLocation);
    }

    setFilteredMatches(filtered);
  }, [selectedTeam, selectedLocation, matches]);

  const formatMatchTime = (isoString) => {
    if (!isoString) return "TBD";
    try {
      const date = new Date(isoString);
      // Use toLocaleString to convert to user's timezone
      return date.toLocaleString("en-US", {
        weekday: "long",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoString;
    }
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case "ns":
        return "bg-blue-900/30 text-blue-300 border-blue-600";
      case "live":
        return "bg-green-900/30 text-green-300 border-green-600";
      case "finished":
        return "bg-gray-900/30 text-gray-300 border-gray-600";
      case "cancelled":
        return "bg-red-900/30 text-red-300 border-red-600";
      default:
        return "bg-gray-700/30 text-gray-300 border-gray-600";
    }
  };

  const getTeamColor = (teamName) => {
    return TEAM_COLORS[teamName] || "bg-gray-600/70";
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-500 text-white py-6 flex items-center justify-center">
        <div className="text-gray-300">Loading schedule...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-500 text-white py-6">
      <div className="max-w-6xl mx-auto px-4 space-y-6">
        {/* Header */}
        <div className="bg-card-light rounded-2xl shadow-card p-4 sm:p-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-primary-500">
            Schedule
          </h1>
          <p className="text-sm text-gray-300 mt-1">
            {filteredMatches.length} match{filteredMatches.length !== 1 ? "es" : ""}
            {(selectedTeam || selectedLocation) && " (filtered)"}
          </p>
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-600 rounded-2xl p-4 text-red-200 text-sm">
            {error}
          </div>
        )}

        {/* Filters */}
        <div className="bg-card-light rounded-2xl shadow-card p-4 sm:p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Filter by Team
              </label>
              <select
                value={selectedTeam}
                onChange={(e) => setSelectedTeam(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-dark-100 text-center text-white border border-card-default focus:outline-none focus:border-primary-500"
              >
                <option value="">All Teams</option>
                {teams.map((team) => (
                  <option key={team} value={team}>
                    {team}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm text-center font-medium text-gray-300 mb-2">
                Filter by Location
              </label>
              <select
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-dark-100 text-center text-white border border-card-default focus:outline-none focus:border-primary-500"
              >
                <option value="">All Locations</option>
                {locations.map((location) => (
                  <option key={location} value={location}>
                    {location}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {(selectedTeam || selectedLocation) && (
            <button
              onClick={() => {
                setSelectedTeam("");
                setSelectedLocation("");
              }}
              className="mt-4 px-3 py-1 rounded-full bg-gray-700 text-sm hover:bg-gray-600"
            >
              Clear Filters
            </button>
          )}
        </div>

        {/* Matches List */}
        <div className="bg-card-light rounded-2xl shadow-card p-4 sm:p-6">
          {filteredMatches.length === 0 ? (
            <div className="text-gray-400 text-center py-8">
              {matches.length === 0
                ? "No matches scheduled."
                : "No matches match the selected filters."}
            </div>
          ) : (
            <div className="space-y-3">
              {/* Mobile card list */}
              <div className="sm:hidden space-y-3">
                {filteredMatches.map((match) => (
                  <div
                    key={match.id}
                    className={`rounded-lg p-4 border-l-4 border-primary-500 ${getTeamColor(match.team1 || "")}`}
                  >
                    <div className="space-y-2">
                      <div>
                       
                        <div className="font-semibold text-sm">
                          {match.team1 || "TBD"} vs {match.team2 || "TBD"}
                        </div>
                      </div>

                      <div>
                        
                        <div className="text-sm text-gray-300">
                          {match.location || "Location TBD"}
                        </div>
                      </div>

                      <div>
                        
                        <div className="text-sm text-gray-300">
                          {formatMatchTime(match.match_time)}
                        </div>
                      </div>
                        <div
                          className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(match.status)}`}
                        >
                          {match.match_note || "Scheduled"}
                        </div>
                      </div>
                  </div>
                ))}
              </div>

              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-centre text-sm text-gray-300 border-b border-gray-600">
                      <th className="py-3 px-4">Teams</th>
                      <th className="py-3 px-4">Location</th>
                      <th className="py-3 px-4">Match Time</th>
                      <th className="py-3 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMatches.map((match) => (
                      <tr
                        key={match.id}
                        className={`border-b border-gray-700 hover:bg-dark-400 transition-colors border-l-4 ${getTeamColor(match.team1 || "")}`}
                      >
                        <td className="py-3 px-4 font-semibold">
                          <div className="flex text-sm items-center gap-2">
                            <span>{match.team1 || "TBD"}</span>
                            <span className="text-gray-400 text-sm">vs</span>
                            <span>{match.team2 || "TBD"}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-sm  text-gray-300">
                          {match.location || "Location TBD"}
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-300">
                          {formatMatchTime(match.match_time)}
                        </td>
                        <td className="py-3 px-4">
                          <div
                            className={`inline-block px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(match.status)}`}
                          >
                            {match.match_note || "Scheduled"}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
