import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FiBarChart2, FiCalendar, FiMenu, FiX, FiClipboard } from "react-icons/fi";
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
  const { isTeamLocked } = useTeam();

  // Effect to handle showing/hiding the navbar on scroll
  useEffect(() => {
    let lastScrollY = window.scrollY;

    const handleScroll = () => {
      if (window.scrollY > lastScrollY && window.scrollY > 100) {
        // Scrolling down
        setIsVisible(false);
      } else {
        // Scrolling up
        setIsVisible(true);
      }
      lastScrollY = window.scrollY;
    };

    window.addEventListener("scroll", handleScroll);
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  return (
    <>
      {/* Main Navigation Bar */}
      <nav
        className={`fixed bottom-0 left-0 right-0 h-16 bg-dark-600/80 backdrop-blur-sm border-t border-dark-400 z-40 transition-transform duration-300 ease-in-out ${
          isVisible ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className={`max-w-5xl mx-auto h-full grid ${isTeamLocked ? 'grid-cols-4' : 'grid-cols-5'}`}>
          {!isTeamLocked && (
            <NavItem
              icon={<FiClipboard size={22} />}
              label="Team Selection"
              onClick={() => navigate("/team")}
            />
          )}
          <NavItem
            icon={<MdOutlineSportsCricket size={22} style={{ transform: 'rotate(190deg)' }} />}
            label="My Team"
            onClick={() => navigate("/my-team")}
          />
          <NavItem
            icon={<FiBarChart2 size={22} />}
            label="Player Stats"
            onClick={() => navigate("/player-stats")}
          />
          
          <NavItem
            icon={<FiCalendar size={22} />}
            label="Schedule"
            onClick={() => navigate("/schedule")}
          />
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
            {/* Add other menu items here */}
            <button 
              onClick={() => navigate("/leaderboard")} 
              className="text-left w-full px-3 py-2 rounded-md text-base font-medium text-gray-300 hover:text-white hover:bg-dark-400"
            > 
            Leaderboard
            </button>
            <button
              onClick={handleLogout}
              className="text-left w-full px-3 py-2 rounded-md text-base font-medium text-gray-300 hover:text-white hover:bg-dark-400"
            >
              Log Out
            </button>
          </div>
        </div>
      </div>

      {/* Overlay for mobile menu */}
      {isMenuOpen && (
        <div
          className="fixed inset-0 bg-black opacity-50 z-40"
          onClick={() => setIsMenuOpen(false)}
        ></div>
      )}
    </>
  );
};

export default BottomNavbar;