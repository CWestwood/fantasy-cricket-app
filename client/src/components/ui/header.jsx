import React from "react";
import logoNoBackground from "../../assets/images/logo-no-background.svg";
import { FiUser } from "react-icons/fi";
import { useTeam } from "../../context/TeamContext";

const Header = ({ onNavigate }) => {
  const { user } = useTeam();

  return (
    <header className="bg-card-dark text-white p-3 shadow-card sticky top-0 z-50">
      <div className="max-w-5xl mx-auto flex justify-between items-center h-12">
        {/* Left: Logo */}
        <div className="flex-1 flex justify-start">
          <img src={logoNoBackground} alt="Logo" className="h-10 w-auto" />
        </div>

        {/* Center: Tournament Name */}
        <div className="flex-1 text-center">
          <h1 className="text-md font-bold text-primary-500 whitespace-nowrap">
            Mad Cricket World Cup
          </h1>
        </div>

        {/* Right: User Profile */}
        <div className="flex-1 flex justify-end">
          {user && (
            <button
              onClick={() => onNavigate("profile")}
              className="bg-dark-500 p-2 rounded-full hover:bg-gray-700 transition-colors"
            >
              <FiUser size={22} className="text-gray-300" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;