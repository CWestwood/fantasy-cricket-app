import React, { useEffect, useState } from "react";
import { useTeam } from "../../context/TeamContext";
import { supabase } from "../../utils/supabaseClient";
import logoNoBackground from "../../assets/images/logo-no-background.svg";

const Footer = () => {
  const { tournamentId } = useTeam();
  const [tournamentName, setTournamentName] = useState("");

  useEffect(() => {
    const fetchTournamentName = async () => {
      if (!tournamentId) return;
      
      const { data, error } = await supabase
        .from("tournaments")
        .select("name")
        .eq("id", tournamentId)
        .single();

      if (data) {
        setTournamentName(data.name);
      }
    };

    fetchTournamentName();
  }, [tournamentId]);

  return (
    <footer className="bg-dark-600 border-t border-dark-400 py-8 mt-auto">
      <div className="max-w-5xl mx-auto px-4 flex flex-col items-center justify-center space-y-4">
           
        <div className="text-center">
          <p className="text-gray-500 font-medium text-lg mb-2">Mad Sports</p>
          {tournamentName && (
            <p className="text-gray-500 font-medium mb-1">{tournamentName}</p>
          )}
          <p className="text-xs text-gray-500">
            &copy; {new Date().getFullYear()} All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;