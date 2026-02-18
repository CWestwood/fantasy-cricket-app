import "./index.css";
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
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
import AdminStats from "./pages/AdminStats";
import { useState, useEffect } from "react";
import { TeamProvider, useTeam } from "./context/TeamContext";
import BottomNavbar from "./components/ui/BottomNavbar";
import Header from "./components/ui/header";
import { supabase } from "./utils/supabaseClient";
import TournamentRules from './pages/TournamentRules';
import Footer from "./components/ui/Footer";
import { Analytics } from "@vercel/analytics/react";
import SubstitutionLog from "./pages/Substitutions";
import TournamentTracker from "./pages/TournamentTracker";

const Layout = ({ children }) => (
  <div className="flex flex-col min-h-screen bg-dark-500">
    <Header />
    <main className="flex-1 w-full">
      {children}
    </main>
    <Footer />
    <BottomNavbar onNavigate={() => {}} />
  </div>
);

function AppContent() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [session, setSession] = useState(null);
  const { teamId, loading: teamLoading, canPick, user, activeStage } = useTeam();
  const navigate = useNavigate();

  useEffect(() => {
    let authListener = null;
    const initializeAuth = async () => {
      try {
        if (!supabase) throw new Error("Supabase client is not configured");
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        setSession(sessionData?.session || null);
        const { data } = supabase.auth.onAuthStateChange((event, newSession) => {
          setSession(newSession || null);
        });
        authListener = data;
        setIsLoading(false);
      } catch (err) {
        setError(err.message || "Failed to initialize authentication");
        setIsLoading(false);
      }
    };
    initializeAuth();
    return () => authListener?.subscription?.unsubscribe();
  }, []);

  if (isLoading || (session && teamLoading)) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
        <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full">
          <h2 className="text-xl font-bold text-gray-900 mb-2 text-center">Something went wrong</h2>
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

  const defaultLoggedInRoute = canPick
    ? "/team"
    : teamId
    ? "/my-team"
    : "/leaderboard";

  return (
    <Routes>
      <Route
        path="/"
        element={session ? <Navigate to={defaultLoggedInRoute} replace /> : <Landing />}
      />
      <Route
        path="/login"
        element={session ? <Navigate to="/" replace /> : <Login />}
      />
      <Route
        path="/team"
        element={
          session ? (
            canPick ? (
              <Layout><TeamSelection onNavigate={() => {}} /></Layout>
            ) : (
              // User clicked button but can't pick — show error card instead of redirect
              <Layout>
                <div className="flex items-center justify-center min-h-screen">
                  <div className="bg-red-900/30 border border-red-500 rounded-lg p-6 max-w-md">
                    <h2 className="text-xl font-bold text-red-400 mb-2">Selection Closed</h2>
                    <p className="text-gray-300 mb-4">Team selection is currently closed for this stage.</p>
                    <div className="mb-4 p-3 bg-black/40 rounded text-xs font-mono text-gray-400 space-y-1 text-left">
                      <p><span className="text-gray-500">Status:</span> {activeStage?.reason}</p>
                    </div>
                    <button onClick={() => navigate("/my-team")} className="w-full px-4 py-2 bg-primary-500 text-black rounded-lg font-semibold">
                      Go to My Team
                    </button>
                  </div>
                </div>
              </Layout>
            )
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route path="/profile" element={session ? <Layout><ProfilePage /></Layout> : <Navigate to="/login" replace />} />
      <Route path="/my-team" element={session ? <Layout><MyTeamPage onNavigate={() => {}} /></Layout> : <Navigate to="/login" replace />} />
      <Route path="/leaderboard" element={session ? <Layout><LeaderboardPage onNavigate={() => {}} /></Layout> : <Navigate to="/login" replace />} />
      <Route path="/schedule" element={session ? <Layout><Schedule /></Layout> : <Navigate to="/login" replace />} />
      <Route path="/tournament-rules" element={session ? <Layout><TournamentRules /></Layout> : <Navigate to="/login" replace />} />
      <Route path="/substitutionlog" element={session ? <Layout><SubstitutionLog /></Layout> : <Navigate to="/login" replace />} />
      <Route path="/tracker" element={session ? <Layout><TournamentTracker /></Layout> : <Navigate to="/login" replace />} />
      <Route path="/team/:teamId" element={session ? <Layout><TeamDetail /></Layout> : <Navigate to="/login" replace />} />
      <Route path="/player-stats" element={session ? <Layout><PlayerStats /></Layout> : <Navigate to="/login" replace />} />
      <Route path="/player/:playerId" element={session ? <Layout><PlayerProfile /></Layout> : <Navigate to="/login" replace />} />
      <Route path="/admin/stats" element={session ? <Layout><AdminStats /></Layout> : <Navigate to="/login" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <Router>
      <TeamProvider>
        <AppContent />
        <Analytics />
      </TeamProvider>
    </Router>
  );
}

export default App;