import { useState, useEffect } from "react";
import api from "../api/api";

// ── Donut Chart (pure SVG) ────────────────────────────────────────────────────
function DonutChart({ data, total }) {
  const SIZE = 160;
  const R = 56;
  const C = 2 * Math.PI * R;
  const cx = SIZE / 2;
  const cy = SIZE / 2;

  const COLORS = { todo: "#94a3b8", inprogress: "#6366f1", done: "#10b981" };
  const LABELS = { todo: "To Do", inprogress: "In Progress", done: "Done" };

  let offset = 0;
  const slices = data.map(({ status, count }) => {
    const pct   = total ? count / total : 0;
    const dash  = pct * C;
    const gap   = C - dash;
    const slice = { status, count, pct, dash, gap, offset };
    offset += dash;
    return slice;
  });

  if (total === 0) {
    return (
      <div className="sum-donut-empty">
        <svg width={SIZE} height={SIZE}>
          <circle cx={cx} cy={cy} r={R} fill="none" stroke="#e2e8f0" strokeWidth={18} />
        </svg>
        <p>No tasks yet</p>
      </div>
    );
  }

  return (
    <div className="sum-donut-wrap">
      <svg width={SIZE} height={SIZE}>
        {slices.map(s => (
          <circle
            key={s.status}
            cx={cx} cy={cy} r={R}
            fill="none"
            stroke={COLORS[s.status] || "#cbd5e1"}
            strokeWidth={18}
            strokeDasharray={`${s.dash} ${s.gap}`}
            strokeDashoffset={-s.offset + C / 4}
            strokeLinecap="butt"
            style={{ transition: "stroke-dasharray 0.4s ease" }}
          />
        ))}
        <text x={cx} y={cy - 8} textAnchor="middle" fontSize="22" fontWeight="800" fill="#0f172a">{total}</text>
        <text x={cx} y={cy + 12} textAnchor="middle" fontSize="11" fill="#64748b">Total tasks</text>
      </svg>
      <div className="sum-donut-legend">
        {slices.map(s => (
          <div key={s.status} className="sum-legend-item">
            <div className="sum-legend-dot" style={{ background: COLORS[s.status] }} />
            <span className="sum-legend-label">{LABELS[s.status] || s.status}</span>
            <span className="sum-legend-count">{s.count}</span>
            <span className="sum-legend-pct">{Math.round(s.pct * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Priority / Type Bar ───────────────────────────────────────────────────────
function HorizBar({ label, count, total, color }) {
  const pct = total ? Math.round((count / total) * 100) : 0;
  return (
    <div className="sum-hbar-row">
      <div className="sum-hbar-label">{label}</div>
      <div className="sum-hbar-track">
        <div className="sum-hbar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="sum-hbar-meta">
        <span className="sum-hbar-count">{count}</span>
        <span className="sum-hbar-pct">{pct}%</span>
      </div>
    </div>
  );
}

// ── Activity Feed ─────────────────────────────────────────────────────────────
function timeAgo(ts) {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const PRIORITY_COLORS = { high: "#ef4444", medium: "#f59e0b", low: "#10b981" };

// ── Auto-Classification Config ────────────────────────────────────────────────
// Add / edit type strings here — matching is case-insensitive.
// Any type not found falls into "Other".
const CATEGORY_MAP = {
  "New Work":    ["feature", "story", "rfp", "enhancement", "epic", "new", "request"],
  "Fixes":       ["bug", "incident", "hotfix", "defect", "fix", "patch"],
  "Maintenance": ["chore", "tech debt", "upgrade", "refactor", "dependency", "normal", "maintenance", "update"],
  "Knowledge":   ["documentation", "research", "spike", "test", "doc", "analysis"],
  "Risk":        ["security", "compliance", "vulnerability", "audit", "risk"],
};

const CATEGORY_COLORS = {
  "New Work":    "#6366f1",
  "Fixes":       "#ef4444",
  "Maintenance": "#f59e0b",
  "Knowledge":   "#14b8a6",
  "Risk":        "#f97316",
  "Other":       "#94a3b8",
};

// Classify a raw type string → category name
function classifyType(rawType = "") {
  const t = rawType.toLowerCase().trim();
  for (const [category, keywords] of Object.entries(CATEGORY_MAP)) {
    if (keywords.some(k => t === k || t.includes(k))) return category;
  }
  return "Other";
}

// Aggregate type_breakdown rows into category counts
function buildCategoryBreakdown(typeBreakdown) {
  const counts = {};
  typeBreakdown.forEach(({ type, count }) => {
    const cat = classifyType(type);
    counts[cat] = (counts[cat] || 0) + parseInt(count);
  });
  // Return in defined order, only non-zero + Other
  const ordered = [...Object.keys(CATEGORY_MAP), "Other"];
  return ordered
    .filter(cat => counts[cat] > 0)
    .map(cat => ({ category: cat, count: counts[cat] }));
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function SummaryDashboard({ workspaceId }) {
  const [data, setData]         = useState(null);
  const [workload, setWorkload] = useState([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    if (!workspaceId) { setLoading(false); return; }
    setLoading(true);
    Promise.all([
      api.get(`/workspaces/${workspaceId}/summary`),
      api.get(`/workload?workspace_id=${workspaceId}`),
    ])
      .then(([sumRes, wlRes]) => { setData(sumRes.data); setWorkload(wlRes.data || []); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [workspaceId]);

  if (loading) return <div className="wl-loading">Loading summary…</div>;
  if (!data)   return <div className="wl-empty">Select a workspace to see the summary.</div>;

  const { stats, status_breakdown, priority_breakdown, type_breakdown, recent_activity } = data;

  // normalise status rows into a fixed ordered array
  const statusMap = { todo: 0, inprogress: 0, done: 0 };
  status_breakdown.forEach(r => { statusMap[r.status] = parseInt(r.count); });
  const statusRows = Object.entries(statusMap).map(([status, count]) => ({ status, count }));
  const totalTasks = parseInt(stats.total_tasks);

  const PRIORITY_ORDER = ["high", "medium", "low"];
  const priorityMap = {};
  priority_breakdown.forEach(r => { priorityMap[r.priority] = parseInt(r.count); });

  const categoryBreakdown = buildCategoryBreakdown(type_breakdown);

  const statCards = [
    { label: "Completed this week", value: stats.completed_this_week, icon: "✅", color: "#10b981", bg: "#f0fdf4" },
    { label: "Created this week",   value: stats.created_this_week,   icon: "➕", color: "#6366f1", bg: "#f5f3ff" },
    { label: "Due in next 7 days",  value: stats.due_soon,            icon: "⏰", color: "#f59e0b", bg: "#fffbeb" },
    { label: "Active tasks",        value: stats.active_tasks,        icon: "🔄", color: "#3b82f6", bg: "#eff6ff" },
  ];

  return (
    <div className="sum-root">
      {/* ── Stat cards ── */}
      <div className="sum-stat-row">
        {statCards.map(c => (
          <div key={c.label} className="sum-stat-card" style={{ borderTop: `3px solid ${c.color}` }}>
            <div className="sum-stat-icon" style={{ background: c.bg }}>{c.icon}</div>
            <div className="sum-stat-body">
              <div className="sum-stat-value" style={{ color: c.color }}>{c.value}</div>
              <div className="sum-stat-label">{c.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="sum-grid">
        {/* ── Status donut ── */}
        <div className="sum-card">
          <div className="sum-card-title">Status overview</div>
          <DonutChart data={statusRows} total={totalTasks} />
        </div>

        {/* ── Priority breakdown ── */}
        <div className="sum-card">
          <div className="sum-card-title">Priority breakdown</div>
          <div className="sum-bars">
            {PRIORITY_ORDER.map(p => (
              <HorizBar
                key={p}
                label={p.charAt(0).toUpperCase() + p.slice(1)}
                count={priorityMap[p] || 0}
                total={totalTasks}
                color={PRIORITY_COLORS[p]}
              />
            ))}
            {totalTasks === 0 && <div className="sum-empty-note">No tasks yet</div>}
          </div>
        </div>

        {/* ── Recent activity ── */}
        <div className="sum-card sum-card--wide">
          <div className="sum-card-title">Recent activity</div>
          {recent_activity.length === 0 ? (
            <div className="sum-empty-note">No activity yet — create some tasks!</div>
          ) : (
            <div className="sum-activity-list">
              {recent_activity.map((a, i) => (
                <div key={i} className="sum-activity-row">
                  <div
                    className="sum-activity-dot"
                    style={{ background: a.event === "completed" ? "#10b981" : "#6366f1" }}
                  />
                  <div className="sum-activity-body">
                    <span className="sum-activity-action">
                      {a.event === "completed" ? "Completed" : "Created"}
                    </span>{" "}
                    <span className="sum-activity-title">"{a.title}"</span>
                    {a.priority && (
                      <span
                        className="sum-activity-badge"
                        style={{ background: PRIORITY_COLORS[a.priority] + "22", color: PRIORITY_COLORS[a.priority] }}
                      >
                        {a.priority}
                      </span>
                    )}
                  </div>
                  <div className="sum-activity-time">{timeAgo(a.event_time)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Work classification ── */}
        <div className="sum-card">
          <div className="sum-card-title">Types of work</div>
          <div className="sum-classify-legend">
            {Object.entries(CATEGORY_COLORS).filter(([c]) => c !== "Other").map(([cat, color]) => (
              <span key={cat} className="sum-classify-pill" style={{ background: color + "18", color }}>
                <span className="sum-classify-dot" style={{ background: color }} />{cat}
              </span>
            ))}
          </div>
          <div className="sum-bars" style={{ marginTop: 14 }}>
            {categoryBreakdown.length === 0 ? (
              <div className="sum-empty-note">No tasks yet</div>
            ) : (
              categoryBreakdown.map(({ category, count }) => (
                <HorizBar
                  key={category}
                  label={category}
                  count={count}
                  total={totalTasks}
                  color={CATEGORY_COLORS[category] || CATEGORY_COLORS["Other"]}
                />
              ))
            )}
          </div>
        </div>

        {/* ── Team Workload ── */}
        <div className="sum-card">
        <div className="sum-card-title">Team workload</div>
        <p className="sum-wl-sub">Monitor the capacity of your team</p>

        {workload.length === 0 ? (
          <div className="sum-empty-note">No assigned tasks yet — assign tasks to team members to see workload.</div>
        ) : (
          <div className="sum-wl-table">
            <div className="sum-wl-header">
              <span>Assignee</span>
              <span>Work distribution</span>
            </div>
            {workload.map(member => {
              const pct     = Math.min(100, Math.round(member.load_percent || 0));
              const color   = pct >= 90 ? "#ef4444" : pct >= 70 ? "#f59e0b" : "#10b981";
              const initials = member.name?.slice(0, 2).toUpperCase() || "??";
              return (
                <div key={member.user_id} className="sum-wl-row">
                  <div className="sum-wl-assignee">
                    <div className="sum-wl-avatar" style={{ background: color }}>{initials}</div>
                    <div>
                      <div className="sum-wl-name">{member.name}</div>
                      <div className="sum-wl-task-count">{member.task_count} task{member.task_count !== 1 ? "s" : ""}</div>
                    </div>
                  </div>
                  <div className="sum-wl-bar-wrap">
                    <div className="sum-wl-bar-track">
                      <div className="sum-wl-bar-fill" style={{ width: `${pct}%`, background: color }} />
                      <span className="sum-wl-bar-label">{pct}%</span>
                    </div>
                    <span className={`sum-wl-status sum-wl-status--${member.status}`}>{member.status}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
