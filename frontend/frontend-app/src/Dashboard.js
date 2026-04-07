import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5000";

const NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard", roles: ["user", "analyst", "admin"] },
  { key: "training", label: "Model Training", roles: ["analyst", "admin"] },
  { key: "logs", label: "Traffic Logs", roles: ["analyst", "admin"] },
  {
    key: "performance",
    label: "Model Performance",
    roles: ["analyst", "admin"],
  },
  { key: "controls", label: "Admin Controls", roles: ["admin"] },
];

const formatTime = (value) => {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleString();
};

const formatPercent = (value) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "-";
  }
  return `${Number(value).toFixed(2)}%`;
};

const metricToPercent = (value) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "-";
  }
  return `${(Number(value) * 100).toFixed(2)}%`;
};

const authConfig = (token) => ({
  headers: { Authorization: `Bearer ${token}` },
});

const isForbidden = (error) => error?.response?.status === 403;

const isUnauthorized = (error) => error?.response?.status === 401;

function EmptyState({ text }) {
  return <div className="empty-state">{text}</div>;
}

function SectionHeader({ title, subtitle, action }) {
  return (
    <div className="section-header">
      <div>
        <h3 className="section-title">{title}</h3>
        {subtitle && <p className="section-subtitle">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

function MetricCard({ label, value }) {
  return (
    <div className="metric-card">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
    </div>
  );
}

function DashboardView({ token, onLogout }) {
  const [attacks, setAttacks] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    const loadDashboard = async () => {
      try {
        const res = await axios.get(
          `${API_BASE}/api/dashboard`,
          authConfig(token),
        );
        if (mounted) {
          setAttacks(res.data);
          setError("");
        }
      } catch (err) {
        if (!mounted) {
          return;
        }
        if (isUnauthorized(err)) {
          onLogout();
          return;
        }
        setError("Failed to load dashboard data");
      }
    };

    loadDashboard();
    const interval = setInterval(loadDashboard, 4000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [token, onLogout]);

  return (
    <div className="panel-card">
      <SectionHeader
        title="Attack Timeline"
        subtitle="Shows detected attacks with detection time, model confidence, source IP, and device ID"
      />

      {error && <div className="error-text">{error}</div>}

      {!error && attacks.length === 0 && (
        <EmptyState text="No attack events found yet." />
      )}

      {attacks.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Attack</th>
                <th>Type</th>
                <th>Attack Time</th>
                <th>ML Accuracy</th>
                <th>Source IP</th>
                <th>Device ID</th>
              </tr>
            </thead>
            <tbody>
              {attacks.map((item) => (
                <tr key={item.id}>
                  <td>
                    <span className="badge danger">{item.prediction}</span>
                  </td>
                  <td>{item.attackType || item.activityType || "unknown"}</td>
                  <td>{formatTime(item.recordedTime)}</td>
                  <td>{formatPercent(item.mlAccuracy)}</td>
                  <td>{item.sourceIp || "-"}</td>
                  <td>{item.deviceId || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ModelTrainingView({ token, onLogout }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [metrics, setMetrics] = useState(null);

  const submitTraining = async (event) => {
    event.preventDefault();

    if (!file) {
      setError("Please choose a CSV dataset before training.");
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");

    const formData = new FormData();
    formData.append("dataset", file);

    try {
      const headers = authConfig(token).headers;
      const res = await axios.post(`${API_BASE}/api/model/train`, formData, {
        headers: {
          ...headers,
          "Content-Type": "multipart/form-data",
        },
      });

      setMessage(res.data.message || "Model updated successfully");
      setMetrics(res.data.metrics || null);
      setFile(null);
    } catch (err) {
      if (isUnauthorized(err)) {
        onLogout();
        return;
      }
      if (isForbidden(err)) {
        setError("You are not allowed to train the model.");
        return;
      }
      setError(err.response?.data?.message || "Training request failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="panel-card">
      <SectionHeader
        title="Model Training"
        subtitle="Upload a CSV dataset, retrain the models, and update the existing model file"
      />

      <form onSubmit={submitTraining} className="training-form">
        <label className="upload-control">
          <span>Dataset (.csv)</span>
          <input
            type="file"
            accept=".csv"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </label>
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? "Training in progress..." : "Train And Update Model"}
        </button>
      </form>

      {file && <div className="info-text">Selected file: {file.name}</div>}
      {message && <div className="success-text">{message}</div>}
      {error && <div className="error-text">{error}</div>}

      {metrics && (
        <div className="metrics-grid">
          <MetricCard label="Dataset Samples" value={metrics.sample_count} />
          <MetricCard label="Feature Count" value={metrics.feature_count} />
          <MetricCard
            label="Trained At"
            value={formatTime(metrics.trained_at)}
          />
        </div>
      )}
    </div>
  );
}

function TrafficLogsView({ token, onLogout, role }) {
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [blockingId, setBlockingId] = useState("");

  useEffect(() => {
    let mounted = true;

    const loadLogs = async () => {
      try {
        const res = await axios.get(`${API_BASE}/api/logs`, authConfig(token));
        if (mounted) {
          setLogs(res.data);
          setError("");
        }
      } catch (err) {
        if (!mounted) {
          return;
        }
        if (isUnauthorized(err)) {
          onLogout();
          return;
        }
        if (isForbidden(err)) {
          setError("You are not allowed to view traffic logs.");
          return;
        }
        setError("Failed to load traffic logs.");
      }
    };

    loadLogs();
    const interval = setInterval(loadLogs, 5000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [token, onLogout]);

  return (
    <div className="panel-card">
      <SectionHeader
        title="Traffic Logs"
        subtitle="Activity feed with prediction, time, confidence, and activity type"
      />

      {error && <div className="error-text">{error}</div>}
      {message && <div className="success-text">{message}</div>}

      {!error && logs.length === 0 && (
        <EmptyState text="No traffic logs available yet." />
      )}

      {logs.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Activity</th>
                <th>Recorded Time</th>
                <th>ML Accuracy</th>
                <th>Source IP</th>
                <th>Device ID</th>
                {role === "admin" && <th>Action</th>}
              </tr>
            </thead>
            <tbody>
              {logs.map((item) => {
                const hasBlockTarget = Boolean(item.sourceIp || item.deviceId);

                const blockFromLog = async () => {
                  if (!hasBlockTarget) {
                    return;
                  }

                  setError("");
                  setMessage("");
                  setBlockingId(item.id);

                  try {
                    const res = await axios.post(
                      `${API_BASE}/api/admin/block`,
                      {
                        ip: item.sourceIp || undefined,
                        deviceId: item.deviceId || undefined,
                        reason: `Blocked from traffic log (${item.activityType || item.attackType || "unknown"})`,
                      },
                      authConfig(token),
                    );
                    setMessage(res.data.message || "Blocked successfully.");
                  } catch (err) {
                    if (isUnauthorized(err)) {
                      onLogout();
                      return;
                    }
                    setError(
                      err.response?.data?.message || "Failed to block target.",
                    );
                  } finally {
                    setBlockingId("");
                  }
                };

                return (
                  <tr key={item.id}>
                    <td>
                      <span
                        className={`badge ${item.prediction === "ATTACK" ? "danger" : "ok"}`}
                      >
                        {item.prediction}
                      </span>
                    </td>
                    <td>{item.activityType || item.attackType || "normal"}</td>
                    <td>{formatTime(item.recordedTime)}</td>
                    <td>{formatPercent(item.mlAccuracy)}</td>
                    <td>{item.sourceIp || "-"}</td>
                    <td>{item.deviceId || "-"}</td>
                    {role === "admin" && (
                      <td>
                        <button
                          className="btn btn-secondary"
                          onClick={blockFromLog}
                          disabled={!hasBlockTarget || blockingId === item.id}
                        >
                          {blockingId === item.id ? "Blocking..." : "Block"}
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ModelPerformanceView({ token, onLogout }) {
  const [metrics, setMetrics] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const loadMetrics = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(
        `${API_BASE}/api/model/performance`,
        authConfig(token),
      );
      setMetrics(res.data);
      setError("");
    } catch (err) {
      if (isUnauthorized(err)) {
        onLogout();
        return;
      }
      if (isForbidden(err)) {
        setError("You are not allowed to view model performance.");
        return;
      }
      setError(
        err.response?.data?.message ||
          "Failed to load model performance metrics.",
      );
    } finally {
      setLoading(false);
    }
  }, [token, onLogout]);

  useEffect(() => {
    loadMetrics();
  }, [loadMetrics]);

  const renderModelBlock = (title, block) => {
    if (!block) {
      return null;
    }

    return (
      <div className="panel-card nested">
        <h4 className="sub-title">{title}</h4>
        <div className="metrics-grid">
          <MetricCard
            label="Accuracy"
            value={metricToPercent(block.accuracy)}
          />
          <MetricCard
            label="Precision"
            value={metricToPercent(block.precision)}
          />
          <MetricCard label="Recall" value={metricToPercent(block.recall)} />
          <MetricCard
            label="F1 Score"
            value={metricToPercent(block.f1_score)}
          />
          <MetricCard label="AUC ROC" value={metricToPercent(block.auc_roc)} />
        </div>
        <div className="metrics-grid compact">
          <MetricCard label="TP" value={block.confusion_matrix?.tp ?? "-"} />
          <MetricCard label="TN" value={block.confusion_matrix?.tn ?? "-"} />
          <MetricCard label="FP" value={block.confusion_matrix?.fp ?? "-"} />
          <MetricCard label="FN" value={block.confusion_matrix?.fn ?? "-"} />
        </div>
      </div>
    );
  };

  return (
    <div className="panel-card">
      <SectionHeader
        title="Model Performance"
        subtitle="Validation metrics for Random Forest and XGBoost"
        action={
          <button
            className="btn btn-secondary"
            onClick={loadMetrics}
            disabled={loading}
          >
            {loading ? "Refreshing..." : "Refresh Metrics"}
          </button>
        }
      />

      {error && <div className="error-text">{error}</div>}

      {metrics && (
        <>
          <div className="info-text">
            Last trained: {formatTime(metrics.trained_at)} | Samples:{" "}
            {metrics.sample_count}
          </div>
          {renderModelBlock("Random Forest", metrics.random_forest)}
          {renderModelBlock("XGBoost", metrics.xgboost)}
        </>
      )}
    </div>
  );
}

function AdminControlsView({ token, onLogout, currentUser, onUserUpdate }) {
  const [users, setUsers] = useState([]);
  const [blocked, setBlocked] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [blockForm, setBlockForm] = useState({
    ip: "",
    deviceId: "",
    reason: "",
  });

  const loadData = useCallback(async () => {
    try {
      const [usersRes, blockedRes] = await Promise.all([
        axios.get(`${API_BASE}/api/admin/users`, authConfig(token)),
        axios.get(`${API_BASE}/api/admin/blocked`, authConfig(token)),
      ]);
      setUsers(usersRes.data);
      setBlocked(blockedRes.data);
      setError("");
    } catch (err) {
      if (isUnauthorized(err)) {
        onLogout();
        return;
      }
      setError(
        err.response?.data?.message || "Failed to load admin controls data.",
      );
    }
  }, [token, onLogout]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const blockEntity = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!blockForm.ip.trim() && !blockForm.deviceId.trim()) {
      setError("Provide an IP or Device ID to block.");
      return;
    }

    try {
      const res = await axios.post(
        `${API_BASE}/api/admin/block`,
        {
          ip: blockForm.ip.trim() || undefined,
          deviceId: blockForm.deviceId.trim() || undefined,
          reason: blockForm.reason.trim() || undefined,
        },
        authConfig(token),
      );
      setMessage(res.data.message || "Blocked successfully.");
      setBlockForm({ ip: "", deviceId: "", reason: "" });
      loadData();
    } catch (err) {
      if (isUnauthorized(err)) {
        onLogout();
        return;
      }
      setError(err.response?.data?.message || "Failed to block target.");
    }
  };

  const promoteUser = async (userId, role) => {
    setError("");
    setMessage("");
    try {
      const res = await axios.put(
        `${API_BASE}/api/admin/promote/${userId}`,
        { role },
        authConfig(token),
      );

      setMessage(res.data.message || "Role updated.");
      setUsers((prev) =>
        prev.map((user) => (user._id === userId ? { ...user, role } : user)),
      );

      if (currentUser?.id === userId || currentUser?._id === userId) {
        onUserUpdate({ ...currentUser, role });
      }
    } catch (err) {
      if (isUnauthorized(err)) {
        onLogout();
        return;
      }
      setError(err.response?.data?.message || "Failed to update role.");
    }
  };

  return (
    <div className="panel-card">
      <SectionHeader
        title="Admin Controls"
        subtitle="Block IP/device access and promote user roles"
        action={
          <button className="btn btn-secondary" onClick={loadData}>
            Refresh
          </button>
        }
      />

      {message && <div className="success-text">{message}</div>}
      {error && <div className="error-text">{error}</div>}

      <form onSubmit={blockEntity} className="admin-form">
        <input
          className="input-control"
          placeholder="IP address"
          value={blockForm.ip}
          onChange={(e) =>
            setBlockForm((prev) => ({ ...prev, ip: e.target.value }))
          }
        />
        <input
          className="input-control"
          placeholder="Device ID"
          value={blockForm.deviceId}
          onChange={(e) =>
            setBlockForm((prev) => ({ ...prev, deviceId: e.target.value }))
          }
        />
        <input
          className="input-control"
          placeholder="Reason (optional)"
          value={blockForm.reason}
          onChange={(e) =>
            setBlockForm((prev) => ({ ...prev, reason: e.target.value }))
          }
        />
        <button type="submit" className="btn btn-primary">
          Block Target
        </button>
      </form>

      <div className="admin-grid">
        <div className="panel-card nested">
          <h4 className="sub-title">User Role Management</h4>
          {users.length === 0 && <EmptyState text="No users found." />}
          {users.length > 0 && (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Promote</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((userItem) => (
                    <tr key={userItem._id}>
                      <td>{userItem.username || "-"}</td>
                      <td>{userItem.email}</td>
                      <td>
                        <span className="badge neutral">{userItem.role}</span>
                      </td>
                      <td>
                        <select
                          className="select-control"
                          value={userItem.role}
                          onChange={(e) =>
                            promoteUser(userItem._id, e.target.value)
                          }
                        >
                          <option value="user">user</option>
                          <option value="analyst">analyst</option>
                          <option value="admin">admin</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="panel-card nested">
          <h4 className="sub-title">Blocked Entities</h4>
          {blocked.length === 0 && (
            <EmptyState text="No blocked entities yet." />
          )}
          {blocked.length > 0 && (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>IP</th>
                    <th>Device</th>
                    <th>Reason</th>
                    <th>Blocked At</th>
                  </tr>
                </thead>
                <tbody>
                  {blocked.map((item) => (
                    <tr key={item._id}>
                      <td>{item.ip || "-"}</td>
                      <td>{item.deviceId || "-"}</td>
                      <td>{item.reason || "-"}</td>
                      <td>{formatTime(item.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Dashboard({ token, user, onLogout, onUserUpdate }) {
  const role = String(user?.role || "user").toLowerCase();

  const allowedNav = useMemo(
    () => NAV_ITEMS.filter((item) => item.roles.includes(role)),
    [role],
  );

  const [active, setActive] = useState(() => allowedNav[0]?.key || "dashboard");

  useEffect(() => {
    if (!allowedNav.some((item) => item.key === active)) {
      setActive(allowedNav[0]?.key || "dashboard");
    }
  }, [allowedNav, active]);

  const renderSection = () => {
    switch (active) {
      case "dashboard":
        return <DashboardView token={token} onLogout={onLogout} />;
      case "training":
        return <ModelTrainingView token={token} onLogout={onLogout} />;
      case "logs":
        return (
          <TrafficLogsView token={token} onLogout={onLogout} role={role} />
        );
      case "performance":
        return <ModelPerformanceView token={token} onLogout={onLogout} />;
      case "controls":
        return (
          <AdminControlsView
            token={token}
            onLogout={onLogout}
            currentUser={user}
            onUserUpdate={onUserUpdate}
          />
        );
      default:
        return <DashboardView token={token} onLogout={onLogout} />;
    }
  };

  return (
    <div className="workspace-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">REAL-TIME IDS CONTROL CENTER</p>
          <h1 className="workspace-title">
            Network Intrusion Detection Console
          </h1>
        </div>
        <div className="topbar-actions">
          <span className="badge neutral">Role: {role}</span>
          <span className="user-chip">{user?.email}</span>
          <button className="btn btn-secondary" onClick={onLogout}>
            Logout
          </button>
        </div>
      </header>

      <nav className="navbar">
        {allowedNav.map((item) => (
          <button
            key={item.key}
            className={`nav-item ${active === item.key ? "active" : ""}`}
            onClick={() => setActive(item.key)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <main className="workspace-content">{renderSection()}</main>
    </div>
  );
}
