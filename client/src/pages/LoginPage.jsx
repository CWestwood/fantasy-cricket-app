import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../utils/supabaseClient";
import Button from "../components/ui/Button";
import Input from "../components/ui/Input";
import logoNoBackground from "../assets/images/logo-no-background.svg";

const Login = ({ onNavigate = () => {} }) => {
  const navigate = useNavigate();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const handleEmailAuth = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        // On signup, Supabase may require email confirmation depending on settings.
        if (data?.user) {
          setEmailSent(true);
          // If the user is signed in immediately, navigate to team selection
          navigate("/team");
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        if (data?.user) {
          navigate("/team");
        }
      }
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError("");
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
      });
      if (error) throw error;
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-dark-500 text-white p-4 sm:p-6">
      <div className="w-full max-w-md space-y-6">
        <header className="text-center">
          <img
            src={logoNoBackground}
            alt="Logo"
            className="mx-auto w-128 h-128 sm:w-64 sm:h-64 md:w-96 md:h-96"
          />
          <h1 className="text-lg sm:text-xl font-bold text-primary-500 mt-4">
            T20 Cricket World Cup 2026
          </h1>
          <p className="text-sm text-gray-400">Fantasy Tournament</p>
        </header>

        {emailSent && (
          <div className="bg-blue-900 bg-opacity-80 border-l-4 border-blue-500 text-blue-100 p-4 rounded-xl shadow-sm">
            <p className="text-sm leading-relaxed">
              ✓ Check your email for authentication! Please verify your email to complete sign-up.
            </p>
          </div>
        )}

        {/* Card */}
        <div className="bg-card-light rounded-2xl shadow-card px-4 py-4 sm:px-6 sm:py-6">
          <form className="space-y-2" onSubmit={handleEmailAuth}>
            <Input
              id="email"
              label="Email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />

            <Input
              id="password"
              label="Password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            {error && <div className="text-sm text-red-400">{error}</div>}

            <div>
              <Button
                type="submit"
                className="w-full py-3 text-base rounded-full text-dark-500"
                variant="primary"
              >
                {loading ? "Loading..." : isSignUp ? "Sign Up" : "Sign In"}
              </Button>
            </div>
          </form>

          <div className="my-6 flex items-center">
            <div className="flex-1 h-px bg-[#3a3a3a]" />
            <div className="px-3 text-xs text-gray-400">Or</div>
            <div className="flex-1 h-px bg-[#3a3a3a]" />
          </div>

          <Button
            type="button"
            onClick={handleGoogleSignIn}
            className="w-full flex items-center justify-center gap-3 py-3 rounded-full bg-primary text-dark-500"
            variant=""
          >
            <img
              className="h-5 w-5"
              src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
              alt="Google logo"
            />
            Continue with Google
          </Button>

          <div className="mt-5 text-center">
            <button
              type="button"
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-sm text-primary-600 font-medium hover:underline"
            >
              {isSignUp
                ? "Already have an account? Sign in"
                : "Don't have an account? Sign up"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
