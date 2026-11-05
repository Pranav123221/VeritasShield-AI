
import { useState } from "react";
import { supabase } from "../../lib/supabase";

type AuthProps = {
  isRecovery?: boolean;
};

export default function Auth({ isRecovery = false }: AuthProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      if (isRecovery) {
        const { error } = await supabase.auth.updateUser({
          password,
        });

        if (error) throw error;

        setMessage("Password updated successfully! Please sign in again.");
        return;
      }

      const { data, error } = isLogin
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

      if (error) throw error;

      if (!isLogin && !data.session) {
        setMessage("Signup successful! Please check your email to confirm.");
      }
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : "Authentication failed."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    if (!email.trim()) {
      setMessage("Please enter your registered email address first.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });

      if (error) throw error;

      setMessage("Password reset link sent. Please check your email.");
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : "Unable to send reset link."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>VeritasShield AI</h1>

        <h2>
          {isRecovery
            ? "Set New Password"
            : isLogin
              ? "Welcome Back"
              : "Create Account"}
        </h2>

        {!isRecovery && (
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        )}

        <input
          type="password"
          placeholder={
            isRecovery ? "New password" : "Password (minimum 6 characters)"
          }
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={6}
          required
        />

        {message && <p role="status">{message}</p>}

        <button type="submit" disabled={loading}>
          {loading
            ? "Please wait..."
            : isRecovery
              ? "Update Password"
              : isLogin
                ? "Sign In"
                : "Sign Up"}
        </button>

        {!isRecovery && (
          <>
            {isLogin && (
              <p>
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleForgotPassword}
                >
                  Forgot Password?
                </button>
              </p>
            )}

            <p>
              {isLogin ? "New user?" : "Already registered?"}{" "}
              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  setIsLogin(!isLogin);
                  setMessage("");
                }}
              >
                {isLogin ? "Create account" : "Sign in"}
              </button>
            </p>
          </>
        )}
      </form>
    </main>
  );
}
