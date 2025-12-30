import "./index.css";
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from "react-router-dom";
import Login from "./pages/LoginPage";
import TeamSelection from "./pages/TeamSelection";
import Landing from "./pages/Landing";
import ProfilePage from "./pages/ProfilePage";
import MyTeamPage from "./pages/MyTeamPage";
import LeaderboardPage from "./pages/Leaderboard";
import Schedule from "./pages/Schedule";
import TeamDetail from "./pages/TeamDetail";
import PlayerProfile from "./pages/PlayerProfile";
import PlayerStats from "./pages/PlayerStats";
import { useState, useEffect } from "react";
import { TeamProvider, useTeam } from "./context/TeamContext";
import BottomNavbar from "./components/ui/BottomNavbar";
import Header from "./components/ui/header";
import { supabase } from "./utils/supabaseClient";

function AppContent() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [session, setSession] = useState(null);
  const location = useLocation();
  const { isTeamLocked } = useTeam();

  // This effect handles the initial load and auth state changes
  useEffect(() => {
    let authListener = null;

    const initializeAuth = async () => {
      try {
        // Verify Supabase is configured
        if (!supabase) {
          throw new Error("Supabase client is not configured");
        }

        // Check initial session
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.error("Error getting session:", sessionError);
          throw sessionError;
        }

        setSession(sessionData?.session || null);

        // Set up auth state listener for subsequent changes
        const { data } = supabase.auth.onAuthStateChange((event, newSession) => {
          setSession(newSession || null);
        });

        authListener = data;
        setIsLoading(false);
      } catch (err) {
        console.error("Auth initialization error:", err);
        setError(err.message || "Failed to initialize authentication");
        setIsLoading(false);
      }
    };

    initializeAuth();

    // Cleanup function
    return () => {
      if (authListener?.subscription) {
        authListener.subscription.unsubscribe();
      }
    };
  }, []);

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
        <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full">
          <div className="text-red-600 mb-4">
            <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2 text-center">
            Something went wrong
          </h2>
          <p className="text-gray-600 mb-4 text-center">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Reload Page
          </button>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/"
        element={
          session ? (
            isTeamLocked ? <Navigate to="/my-team" replace /> : <Navigate to="/team" replace />
          ) : (
            <Landing />
          )
        }
      />
      <Route
        path="/login"
        element={session ? (isTeamLocked ? <Navigate to="/my-team" replace /> : <Navigate to="/team" replace />) : <Login />}
      />
      <Route
        path="/team"
        element={
          session ? (
            isTeamLocked ? (
              <Navigate to="/my-team" replace />
            ) : (
              <>
                <Header />
                <main className="flex-1">
                  <TeamSelection onNavigate={() => {}} />
                </main>
                <BottomNavbar onNavigate={() => {}} />
              </>
            )
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
        <Route
          path="/profile"
          element={
            session ? (
              <>
                <Header />
                <main className="flex-1">
                  <ProfilePage />
                </main>
                <BottomNavbar onNavigate={() => {}} />
              </>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/my-team"
          element={
            session ? (
              <>
                <Header />
                <main className="flex-1">
                  <MyTeamPage onNavigate={() => {}} />
                </main>
                <BottomNavbar onNavigate={() => {}} />
              </>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/leaderboard"
          element={
            session ? (
              <>
                <Header />
                <main className="flex-1">
                  <LeaderboardPage onNavigate={() => {}} />
                </main>
                <BottomNavbar onNavigate={() => {}} />
              </>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/schedule"
          element={
            session ? (
              <>
                <Header />
                <main className="flex-1">
                  <Schedule />
                </main>
                <BottomNavbar onNavigate={() => {}} />
              </>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/team/:teamId"
          element={
            session ? (
              <>
                <Header />
                <main className="flex-1">
                  <TeamDetail />
                </main>
                <BottomNavbar onNavigate={() => {}} />
              </>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/player-stats"
          element={
            session ? (
              <>
                <Header />
                <main className="flex-1">
                  <PlayerStats />
                </main>
                <BottomNavbar onNavigate={() => {}} />
              </>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/player/:playerId"
          element={
            session ? (
              <>
                <Header />
                <main className="flex-1">
                  <PlayerProfile />
                </main>
                <BottomNavbar onNavigate={() => {}} />
              </>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
      </Routes>
  );
}

function App() {
  return (
    <Router>
      <TeamProvider>
        <AppContent />
      </TeamProvider>
    </Router>
  );
}

export default App;