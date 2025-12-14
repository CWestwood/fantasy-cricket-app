import React from "react";
import { useNavigate } from "react-router-dom";
import Login from "./LoginPage";
import logoNoBackground from "../assets/images/logo-no-background.svg";

export default function Landing({ onNavigate }) {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-dark-500 text-white flex flex-col">
      <header className="py-10 px-6 max-w-md mx-auto w-full">
        <h1 className="text-4xl font-bold text-primary-500">
          Mad World Sports
        </h1>
        <p className="mt-2 text-gray-400">presents</p>
      </header>

      <main className="flex items-center justify-center px-4 py-0 pb-16">
        <div className="max-w-md w-full grid grid-cols-1 gap-4 items-center">
          <div className="bg-card-light rounded-2xl p-6">
            <div className="w-full h-64 bg-gradient-green rounded-2xl flex items-center justify-center">
              <img
                src={logoNoBackground}
                alt="Logo"
                className="mx-auto w-full h-auto max-w-xs md:max-w-sm lg:max-w-md"
              />
            </div>
            <h2 className="mt-4 text-2xl font-bold">
              Madwaleni <br />
              T20 Cricket World Cup <br />
              2026
            </h2>
            <p className="mt-2 text-gray-400">
              The 9th installment in the Madwaleni Fantasy Sport series.
            </p>
          </div>

          <div className="bg-card-light rounded-2xl py-4">
            <ul className="mt-0 space-y-5 text-gray-300">
              <li>Teams due: </li>
              <li>hh:mm dd-mm-2026</li>
            </ul>
            <ul className="mt-6 space-y-4 text-gray-400 text-m">
              <li> Sign up or sign in to start building your squad.</li>
            </ul>
          
          </div>
        </div>
      </main>

      <footer className="px-6 pb-6 mt-auto">
        <div className="max-w-md mx-auto w-full">
          <button
            onClick={() => navigate("/login")}
            className="fixed left-6 right-6 bottom-6 md:static md:bottom-auto md:left-auto md:right-auto w-auto md:w-full max-w-md mx-auto px-6 py-3 bg-primary-500 hover:bg-primary-600 text-black font-semibold rounded-full shadow-lg"
          >
            Sign up / Sign in
          </button>
        </div>
      </footer>
    </div>
  );
}
