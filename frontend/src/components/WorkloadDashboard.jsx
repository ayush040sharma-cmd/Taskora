import { useState, useEffect } from "react";
import api from "../api/api";
import WorkloadBar from "./WorkloadBar";

const TYPE_LABELS = { rfp: "RFP", upgrade: "Upgrade", normal: "Normal" };
const TYPE_CAP    = { rfp: 60, upgrade: 35, normal: 15 };

export default function WorkloadDashboard({ workspaceId }) {
  const [data, setData]     = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const res = await api.get(`/workload?workspace_id=${workspaceId}`);
      setData(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [workspaceId]);

  if (loading) return <div className="wl-loading"><div className="spinner" />Loading workload…</div>;
  if (!data.length) return (
    <div className="wl-empty">
      <div style={{ fontSize: 40 }}>👥</div>
      <p>No active tasks assigned yet.<br />Assign tasks to team members to see their workload.</p>
    </div>
  );

  const overloaded = data.filter(u => u.load_percent >= 90).length;
  const moderate   = data.filter(u => u.load_percent >= 70 && u.load_percent < 90).length;
  const available  = data.filter(u => u.load_percent < 70).length;

  return (
    <div className="wl-root">
      {/* Team summary */}
      <div className="wl-summary">
        <div className="wl-summary-card overloaded">
          <div className="wl-summary-num">{overloaded}</div>
          <div className="wl-summary-label">🔴 Overloaded</div>
        </div>
        <div className="wl-summary-card moderate">
          <div className="wl-summary-num">{moderate}</div>
          <div className="wl-summary-label">🟡 Moderate</div>
        </div>
        <div className="wl-summary-card available">
          <div className="wl-summary-num">{available}</div>
          <div className="wl-summary-label">🟢 Available</div>
        </div>
        <div className="wl-summary-card total">
          <div className="wl-summary-num">{data.length}</div>
          <div className="wl-summary-label">👥 Team size</div>
        </div>
      </div>

      {/* Per-member cards */}
      <div className="wl-grid">
        {data.map((member) => (
          <div key={member.user_id} className={`wl-card wl-card--${member.status}`}>
            {/* Header */}
            <div className="wl-card-header">
              <div className="wl-avatar">{member.name.slice(0,2).toUpperCase()}</div>
              <div className="wl-card-info">
                <div className="wl-card-name">{member.name}</div>
                <div className="wl-card-email">{member.email}</div>
              </div>
              <div className={`wl-status-badge wl-status--${member.status}`}>
                {member.status === "overloaded" ? "🔴 Overloaded"
                  : member.status === "moderate"  ? "🟡 Moderate"
                  : "🟢 Available"}
              </div>
            </div>

            {/* Workload battery */}
            <WorkloadBar percent={member.load_percent} />

            {/* Capacity detail */}
            <div className="wl-capacity-row">
              <span>Used: <strong>{member.used_capacity}%</strong></span>
              <span>Max: <strong>{member.max_capacity}%</strong></span>
              <span>Free: <strong>{Math.max(0, member.max_capacity - member.used_capacity)}%</strong></span>
            </div>

            {/* Tasks list */}
            <div className="wl-tasks-title">Active tasks ({member.tasks.length})</div>
            <div className="wl-tasks-list">
              {member.tasks.map((t) => (
                <div key={t.id} className="wl-task-row">
                  <div className="wl-task-left">
                    <span className={`wl-type-badge wl-type--${t.type}`}>
                      {TYPE_LABELS[t.type] || "Normal"}
                    </span>
                    <span className="wl-task-title">{t.title}</span>
                  </div>
                  <div className="wl-task-right">
                    <span className="wl-task-cap">-{t.effective_capacity}%</span>
                    <div className="wl-task-progress-mini">
                      <div style={{
                        width: `${t.progress || 0}%`,
                        height: "4px",
                        borderRadius: "2px",
                        background: t.progress >= 70 ? "#00875a" : t.progress >= 30 ? "#ff8b00" : "#de350b",
                      }} />
                    </div>
                  </div>
                </div>
              ))}
              {!member.tasks.length && (
                <div className="wl-no-tasks">No active tasks</div>
              )}
            </div>

            {/* Warning banner */}
            {member.status === "overloaded" && (
              <div className="wl-warning">
                ⚠️ Do not assign more tasks — this member is at full capacity
              </div>
            )}
            {member.status === "available" && (
              <div className="wl-available-note">
                ✅ Can take up to {Math.floor((member.max_capacity - member.used_capacity) / 15)} more normal tasks
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
