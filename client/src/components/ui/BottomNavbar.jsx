import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FiBarChart2, FiCalendar, FiMenu, FiX, FiClipboard, FiBook } from "react-icons/fi";
import { GoTrophy } from "react-icons/go";
import { MdOutlineSportsCricket } from "react-icons/md";
import { supabase } from "../../utils/supabaseClient";
import { useTeam } from "../../context/TeamContext";
import { ClipboardDocumentCheckIcon } from "@heroicons/react/16/solid";

const NavItem = ({ icon, label, onClick }) => (
  <button
    onClick={onClick}
    className="flex flex-col items-center justify-center w-full h-full text-gray-400 hover:text-white transition-colors"
  >
    {icon}
    <span className="text-xs mt-1">{label}</span>
  </button>
);

const BottomNavbar = ({ onNavigate }) => {
  const [isVisible, setIsVisible] = useState(true);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const navigate = useNavigate();
  const { isTeamLocked, activityState } = useTeam();
  const isRegistering = activityState === "registering";

  useEffect(() => {
    let lastScrollY = window.scrollY;
    const handleScroll = () => {
      if (window.scrollY > lastScrollY && window.scrollY > 100) {
        setIsVisible(false);
      } else {
        setIsVisible(true);
      }
      lastScrollY = window.scrollY;
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  // Define navbar items per state
  const navItems = isRegistering
    ? [
        { icon: <FiClipboard size={22} />, label: "Team Selection", route: "/team" },
        { icon: <MdOutlineSportsCricket size={22} style={{ transform: "rotate(190deg)" }} />, label: "My Team", route: "/my-team" },
        { icon: <FiCalendar size={22} />, label: "Schedule", route: "/schedule" },
        { icon: <FiBook size={22} />, label: "Rules", route: "/tournament-rules" },
      ]
    : [
        { icon: <MdOutlineSportsCricket size={22} style={{ transform: "rotate(190deg)" }} />, label: "My Team", route: "/my-team" },
        { icon: <FiBarChart2 size={22} />, label: "Player Stats", route: "/player-stats" },
        { icon: <GoTrophy size={22} />, label: "Leaderboard", route: "/leaderboard" },  
        { icon: <FiCalendar size={22} />, label: "Schedule", route: "/schedule" },
      ];

  // Items that only appear in the sidebar menu (not in navbar)
  const sidebarOnlyItems = isRegistering
    ? [] // nothing extra during registration
    : [
        { label: "Tournament Rules", route: "/tournament-rules" },
        {label: "Substitution Log", route: "/substitutionlog" }

      ];

  return (
    <>
      <nav
        className={`fixed bottom-0 left-0 right-0 h-16 bg-dark-600/80 backdrop-blur-sm border-t border-dark-400 z-40 transition-transform duration-300 ease-in-out ${
          isVisible ? "translate-y-0" : "translate-y-full"
        }`}
      >
        {/* 4 items + Menu button = 5 columns, always consistent */}
        <div className="max-w-5xl mx-auto h-full grid grid-cols-5">
          {navItems.map((item) => (
            <NavItem
              key={item.label}
              icon={item.icon}
              label={item.label}
              onClick={() => navigate(item.route)}
            />
          ))}
          <NavItem
            icon={<FiMenu size={22} />}
            label="Menu"
            onClick={() => setIsMenuOpen(true)}
          />
        </div>
      </nav>

      {/* Sidebar Menu */}
      <div
        className={`fixed top-0 right-0 h-full w-64 bg-dark-600 shadow-xl transform ${
          isMenuOpen ? "translate-x-0" : "translate-x-full"
        } transition-transform duration-300 ease-in-out z-50`}
      >
        <div className="p-4">
          <div className="flex justify-between items-center mb-8">
            <h3 className="text-xl font-bold text-primary-500">Menu</h3>
            <button onClick={() => setIsMenuOpen(false)}>
              <FiX size={24} className="text-gray-400 hover:text-white" />
            </button>
          </div>
          <div className="flex flex-col space-y-4">
            {sidebarOnlyItems.map((item) => (
              <button
                key={item.label}
                onClick={() => { navigate(item.route); setIsMenuOpen(false); }}
                className="text-left w-full px-3 py-2 rounded-md text-base font-medium text-gray-300 hover:text-white hover:bg-dark-400"
              >
                {item.label}
              </button>
            ))}
            <button
              onClick={handleLogout}
              className="text-left w-full px-3 py-2 rounded-md text-base font-medium text-gray-300 hover:text-white hover:bg-dark-400"
            >
              Log Out
            </button>
          </div>
        </div>
      </div>

      {isMenuOpen && (
        <div className="fixed inset-0 bg-black opacity-50 z-40" onClick={() => setIsMenuOpen(false)} />
      )}
    </>
  );
};

export default BottomNavbar;