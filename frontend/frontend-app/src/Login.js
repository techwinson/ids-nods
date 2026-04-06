import axios from "axios";
import { useState } from "react";

const AUTH_URL = "http://localhost:5000/api/auth";

export default function Login({ onAuthSuccess }) {
  const [form, setForm] = useState({ email: "", password: "", username: "" });
  const [mode, setMode] = useState("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");

    const email = form.email.trim();
    const password = form.password;
    if (!email || !password) {
      setError("Email and password are required");
      return;
    }

    setLoading(true);
    try {
      const url =
        mode === "login" ? `${AUTH_URL}/login` : `${AUTH_URL}/register`;
      const payload =
        mode === "login"
          ? { email, password }
          : { email, password, username: form.username?.trim() || undefined };

      const res = await axios.post(url, payload);
      onAuthSuccess({ token: res.data.token, user: res.data.user });
      setMessage(mode === "login" ? "Logged in" : "Account created");
    } catch (err) {
      const apiMessage = err.response?.data?.message || "Request failed";
      setError(apiMessage);
    } finally {
      setLoading(false);
    }
  };

  const switchMode = () => {
    setMode(mode === "login" ? "register" : "login");
    setError("");
    setMessage("");
  };

  return (
    <div className="page-shell auth-shell">
      <div className="ambient-circle ambient-1" />
      <div className="ambient-circle ambient-2" />
      <div className="auth-card">
        <p className="eyebrow">IDS PLATFORM</p>
        <h2 className="auth-title">
          {mode === "login" ? "Welcome Back" : "Create Account"}
        </h2>
        <form onSubmit={handleSubmit} className="auth-form">
          {mode === "register" && (
            <input
              placeholder="username"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              className="input-control"
            />
          )}
          <input
            placeholder="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="input-control"
          />
          <input
            placeholder="password"
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="input-control"
          />
          {error && <div className="error-text">{error}</div>}
          {message && <div className="success-text">{message}</div>}
          <button type="submit" disabled={loading} className="btn btn-primary">
            {loading
              ? "Please wait..."
              : mode === "login"
                ? "Login"
                : "Register"}
          </button>
        </form>
        <button
          type="button"
          onClick={switchMode}
          className="btn btn-secondary"
        >
          {mode === "login"
            ? "Need an account? Register"
            : "Have an account? Login"}
        </button>
      </div>
    </div>
  );
}
