import { useState, useEffect } from "react";
import api from "../api/api";
import WorkloadBar from "./WorkloadBar";

const TYPE_LABELS = {
  task: "Task", bug: "Bug", story: "Story",
  rfp: "RFP", proposal: "Proposal", presentation: "Presentation",
  upgrade: "Upgrade", poc: "POC",
};

export default function WorkloadDashboard({ workspaceId }) {
  const [data, setData]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [expanded, setExpanded] = useState({});

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

  const toggleExpand = (uid) =>
    setExpanded(prev => ({ ...prev, [uid]: !prev[uid] }));

  /* ── loading / empty states ── */
  if (loading) return (
    <div className="wl-loading"><div className="spinner" />Loading workload…</div>
  );
  if (!data.length) return (
    <div className="wl-empty">
      <div style={{ fontSize: 40 }}>👥</div>
      <p>No active tasks assigned yet.<br />
         Assign tasks to team members to see their workload.</p>
    </div>
  );

  const overloaded = data.filter(u => u.status === "overloaded").length;
  const moderate   = data.filter(u => u.status === "moderate").length;
  const available  = data.filter(u => u.status === "available").length;
  const onLeave    = data.filter(u => u.on_leave).length;

  return (
    <div className="wl-root">

      {/* ── Team summary strip ─────────────────────────────────── */}
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
        {onLeave > 0 && (
          <div className="wl-summary-card" style={{ background: "var(--bg-2)" }}>
            <div className="wl-summary-num">{onLeave}</div>
            <div className="wl-summary-label">✈️ On leave</div>
          </div>
        )}
        <div className="wl-summary-card total">
          <div className="wl-summary-num">{data.length}</div>
          <div className="wl-summary-label">👥 Team size</div>
        </div>
      </div>

      {/* ── Per-member cards ─────────────────────────────────────── */}
      <div className="wl-grid">
        {data.map((member) => {
          const isExpanded = expanded[member.user_id];
          const isOverloaded = member.status === "overloaded";
          const isFree       = member.status === "available";

          /* Slot message colour */
          const slotColor =
            member.days_until_free === 0 ? "#10b981"
            : member.days_until_free <= 3 ? "#f59e0b"
            : "#ef4444";

          return (
            <div key={member.user_id} className={`wl-card wl-card--${member.status}`}>

              {/* Header */}
              <div className="wl-card-header">
                <div className="wl-avatar">{member.name.slice(0, 2).toUpperCase()}</div>
                <div className="wl-card-info">
                  <div className="wl-card-name">{member.name}</div>
                  <div className="wl-card-email">{member.email}</div>
                </div>
                <div className={`wl-status-badge wl-status--${member.status}`}>
                  {member.on_leave        ? "✈️ On leave"
                   : isOverloaded         ? "🔴 Overloaded"
                   : member.status === "moderate" ? "🟡 Moderate"
                   :                        "🟢 Available"}
                </div>
              </div>

              {/* Travel indicator */}
              {member.travel_mode && !member.on_leave && (
                <div className="wl-travel-badge">✈️ Travel mode — reduced capacity</div>
              )}

              {/* Workload bar */}
              <WorkloadBar percent={member.load_percent} />

              {/* Hours breakdown */}
              <div className="wl-hours-row">
                <div className="wl-hours-item">
                  <span className="wl-hours-label">Daily cap</span>
                  <span className="wl-hours-value">{member.total_hours}h</span>
                </div>
                <div className="wl-hours-item">
                  <span className="wl-hours-label">Committed</span>
                  <span className="wl-hours-value" style={{
                    color: isOverloaded
                      ? "#ef4444"
                      : member.status === "moderate"
                      ? "#f59e0b"
                      : "#10b981",
                  }}>
                    {member.allocated_hours}h
                  </span>
                </div>
                <div className="wl-hours-item">
                  <span className="wl-hours-label">Free today</span>
                  <span className="wl-hours-value">{member.remaining_hours}h</span>
                </div>
                <div className="wl-hours-item">
                  <span className="wl-hours-label">Load</span>
                  <span className="wl-hours-value" style={{
                    fontWeight: 700,
                    color: isOverloaded
                      ? "#ef4444"
                      : member.status === "moderate"
                      ? "#f59e0b"
                      : "#10b981",
                  }}>
                    {member.load_percent}%
                  </span>
                </div>
              </div>

              {/* ── Next Available Slot ── */}
              {!member.on_leave && (
                <div className="wl-slot-row">
                  <span className="wl-slot-icon">🗓</span>
                  <span className="wl-slot-label">Next slot: </span>
                  <span className="wl-slot-value" style={{ color: slotColor }}>
                    {member.next_available_message || "—"}
                  </span>
                </div>
              )}

              {/* Total backlog */}
              {member.total_remaining_hours > 0 && (
                <div className="wl-remaining-total">
                  <span>Total backlog: </span>
                  <strong>{member.total_remaining_hours}h</strong>
                  <span className="wl-remaining-label">
                    {" "}across {member.task_count} task{member.task_count !== 1 ? "s" : ""}
                  </span>
                </div>
              )}

              {/* Load breakdown by type */}
              {member.load_breakdown && Object.keys(member.load_breakdown).length > 0 && (
                <div className="wl-breakdown">
                  {Object.entries(member.load_breakdown).map(([type, hrs]) => (
                    <span key={type} className={`wl-type-badge wl-type--${type}`}>
                      {TYPE_LABELS[type] ?? type} {hrs}h
                    </span>
                  ))}
                </div>
              )}

              {/* Tasks list (collapsible) */}
              <div
                className="wl-tasks-title"
                style={{ cursor: "pointer", userSelect: "none" }}
                onClick={() => toggleExpand(member.user_id)}
              >
                Active tasks ({member.tasks.length})
                <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.6 }}>
                  {isExpanded ? "▲ hide" : "▼ show"}
                </span>
              </div>

              {isExpanded && (
                <div className="wl-tasks-list">
                  {member.tasks.length === 0 && (
                    <div className="wl-no-tasks">No active tasks</div>
                  )}
                  {member.tasks.map((t) => (
                    <div key={t.id} className="wl-task-row">
                      <div className="wl-task-left">
                        <span className={`wl-type-badge wl-type--${t.type}`}>
                          {TYPE_LABELS[t.type] ?? t.type}
                        </span>
                        <span className="wl-task-title">{t.title}</span>
                      </div>
                      <div className="wl-task-right">
                        <span className="wl-task-hours" title="Remaining hours">
                          {t.remaining_hours}h
                        </span>
                        <div className="wl-task-progress-mini" title={`${t.progress}% done`}>
                          <div style={{
                            width: `${t.progress ?? 0}%`, height: "4px", borderRadius: "2px",
                            background: t.progress >= 70 ? "#00875a"
                                      : t.progress >= 30 ? "#ff8b00" : "#de350b",
                          }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Status banners */}
              {isOverloaded && (
                <div className="wl-warning">
                  ⚠️ Do not assign more tasks — at full capacity
                </div>
              )}
              {isFree && member.remaining_hours > 0 && (
                <div className="wl-available-note">
                  ✅ {member.remaining_hours}h free today — can take more work
                </div>
              )}
              {member.on_leave && (
                <div className="wl-warning">✈️ On leave — do not assign tasks</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
