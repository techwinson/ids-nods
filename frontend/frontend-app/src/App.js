import { useEffect, useState } from "react";
import axios from "axios";
import Login from "./Login";
import Dashboard from "./Dashboard";
import "./App.css";

const TOKEN_KEY = "ids-token";
const USER_KEY = "ids-user";
const THEME_KEY = "ids-theme";
const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5000";

const getStoredAuth = () => {
  const token = localStorage.getItem(TOKEN_KEY);
  const rawUser = localStorage.getItem(USER_KEY);
  if (!token) {
    return { token: null, user: null };
  }

  let user = null;
  if (rawUser) {
    try {
      user = JSON.parse(rawUser);
    } catch {
      user = null;
    }
  }

  return { token, user };
};

const getStoredTheme = () => {
  const storedTheme = localStorage.getItem(THEME_KEY);
  if (storedTheme === "light" || storedTheme === "dark") {
    return storedTheme;
  }

  if (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    return "dark";
  }

  return "light";
};

function App() {
  const [auth, setAuth] = useState(getStoredAuth);
  const [theme, setTheme] = useState(getStoredTheme);
  const [loadingProfile, setLoadingProfile] = useState(
    Boolean(auth.token && !auth.user),
  );

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (auth.token) {
      localStorage.setItem(TOKEN_KEY, auth.token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }

    if (auth.user) {
      localStorage.setItem(USER_KEY, JSON.stringify(auth.user));
    } else {
      localStorage.removeItem(USER_KEY);
    }
  }, [auth]);

  useEffect(() => {
    if (!auth.token) {
      setLoadingProfile(false);
      return;
    }

    if (auth.user) {
      setLoadingProfile(false);
      return;
    }

    let mounted = true;
    const fetchProfile = async () => {
      setLoadingProfile(true);
      try {
        const res = await axios.get(`${API_BASE}/api/auth/me`, {
          headers: { Authorization: `Bearer ${auth.token}` },
        });
        if (mounted) {
          setAuth((prev) => ({ ...prev, user: res.data.user }));
        }
      } catch {
        if (mounted) {
          setAuth({ token: null, user: null });
        }
      } finally {
        if (mounted) {
          setLoadingProfile(false);
        }
      }
    };

    fetchProfile();

    return () => {
      mounted = false;
    };
  }, [auth.token, auth.user]);

  const handleAuthSuccess = ({ token, user }) => {
    setAuth({ token, user });
  };

  const handleLogout = () => {
    setAuth({ token: null, user: null });
  };

  const renderApp = () => {
    if (!auth.token) {
      return <Login onAuthSuccess={handleAuthSuccess} />;
    }

    if (loadingProfile || !auth.user) {
      return (
        <div className="page-shell">
          <div className="loading-card">Loading profile...</div>
        </div>
      );
    }

    return (
      <Dashboard
        token={auth.token}
        user={auth.user}
        onLogout={handleLogout}
        onUserUpdate={(user) => setAuth((prev) => ({ ...prev, user }))}
      />
    );
  };

  const isDark = theme === "dark";

  return (
    <>
      <button
        type="button"
        className="theme-toggle"
        aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
        aria-pressed={isDark}
        title={`Switch to ${isDark ? "light" : "dark"} mode`}
        onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
      >
        <span className="theme-toggle-track" aria-hidden="true">
          <span className="theme-toggle-thumb" />
        </span>
        <span className="theme-toggle-text">
          {isDark ? "Dark" : "Light"} mode
        </span>
      </button>

      {renderApp()}
    </>
  );
}

export default App;
