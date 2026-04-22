import { useState, useEffect, useCallback } from "react";
import api from "../api/api";

// ── Action config ────────────────────────────────────────────────────────────
const ACTION_MAP = {
  task_created:    { icon: "✚", label: (m) => `created "${m.task_title}"`,                        color: "#10b981", bg: "#f0fdf4" },
  task_completed:  { icon: "✓", label: (m) => `completed "${m.task_title}"`,                       color: "#10b981", bg: "#f0fdf4" },
  task_moved:      { icon: "→", label: (m) => `moved "${m.task_title}" to ${STATUS_LABEL[m.to] || m.to}`, color: "#6366f1", bg: "#eef2ff" },
  task_assigned:   { icon: "👤", label: (m) => `assigned "${m.task_title}"`,                       color: "#6366f1", bg: "#eef2ff" },
  task_renamed:    { icon: "✏", label: (m) => `renamed task to "${m.task_title}"`,                 color: "#6366f1", bg: "#eef2ff" },
  task_deleted:    { icon: "✕", label: (m) => `deleted "${m.task_title}"`,                         color: "#ef4444", bg: "#fef2f2" },
  leave_started:   { icon: "🏖", label: ()  => "started leave",                                    color: "#f59e0b", bg: "#fffbeb" },
  leave_ended:     { icon: "👋", label: ()  => "returned from leave",                              color: "#10b981", bg: "#f0fdf4" },
  travel_mode_on:  { icon: "✈️", label: ()  => "turned on travel mode",                            color: "#38bdf8", bg: "#f0f9ff" },
  travel_mode_off: { icon: "🏠", label: ()  => "turned off travel mode",                           color: "#64748b", bg: "#f8fafc" },
  capacity_changed:{ icon: "⚙", label: ()  => "updated capacity settings",                        color: "#8b5cf6", bg: "#f5f3ff" },
  task_assigned:   { icon: "🔀", label: (m) => `assigned "${m.task_title}"`,                       color: "#6366f1", bg: "#eef2ff" },
  approval_approved:{ icon: "✅", label: (m) => `approved assignment for "${m.task_title || "task"}"`, color: "#10b981", bg: "#f0fdf4" },
  approval_rejected:{ icon: "❌", label: (m) => `rejected assignment for "${m.task_title || "task"}"`, color: "#ef4444", bg: "#fef2f2" },
};

const STATUS_LABEL = { todo: "To Do", inprogress: "In Progress", done: "Done" };

const FILTERS = [
  { id: "all",   label: "All" },
  { id: "tasks", label: "Tasks" },
  { id: "team",  label: "Team" },
];

const TASK_ACTIONS = ["task_created","task_completed","task_moved","task_assigned","task_renamed","task_deleted","approval_approved","approval_rejected"];
const TEAM_ACTIONS = ["leave_started","leave_ended","travel_mode_on","travel_mode_off","capacity_changed"];

// ── Helpers ──────────────────────────────────────────────────────────────────
function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr)) / 1000;
  if (diff < 60)        return "just now";
  if (diff < 3600)      return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)     return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function dayLabel(dateStr) {
  const d     = new Date(dateStr);
  const today = new Date(); today.setHours(0,0,0,0);
  const yest  = new Date(today); yest.setDate(yest.getDate() - 1);
  const day   = new Date(d);    day.setHours(0,0,0,0);
  if (day >= today) return "Today";
  if (day >= yest)  return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

function getInitials(name = "") {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0,2) || "?";
}

const AVATAR_COLORS = ["#6366f1","#8b5cf6","#06b6d4","#10b981","#f59e0b","#ef4444","#ec4899"];
function avatarColor(name = "") {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

function parseMeta(raw) {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try { return JSON.parse(raw); } catch { return {}; }
}

// ── Item component ────────────────────────────────────────────────────────────
function FeedItem({ entry }) {
  const meta    = parseMeta(entry.meta);
  const config  = ACTION_MAP[entry.action] || { icon: "📝", label: () => entry.action?.replace(/_/g, " "), color: "#64748b", bg: "#f8fafc" };
  const label   = config.label(meta);
  const name    = entry.actor_name || "Someone";

  return (
    <div className="af-item">
      {/* Avatar */}
      <div className="af-avatar" style={{ background: avatarColor(name) }}>
        {getInitials(name)}
      </div>

      {/* Content */}
      <div className="af-content">
        <div className="af-text">
          <span className="af-actor">{name}</span>
          {" "}
          <span className="af-action">{label}</span>
        </div>
        <div className="af-time">{timeAgo(entry.created_at)}</div>
      </div>

      {/* Action badge */}
      <div className="af-badge" style={{ background: config.bg, color: config.color }}>
        {config.icon}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ActivityFeed({ workspaceId }) {
  const [entries, setEntries]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState("all");
  const [page, setPage]         = useState(0);
  const [hasMore, setHasMore]   = useState(false);
  const PAGE = 30;

  const load = useCallback(async (reset = true) => {
    if (!workspaceId) return;
    const off = reset ? 0 : page * PAGE;
    setLoading(true);
    try {
      const { data } = await api.get(`/audit?workspace_id=${workspaceId}&limit=${PAGE + 1}&offset=${off}`);
      const rows = data.slice(0, PAGE);
      setHasMore(data.length > PAGE);
      setEntries(prev => reset ? rows : [...prev, ...rows]);
      if (!reset) setPage(p => p + 1);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [workspaceId, page]);

  useEffect(() => { load(true); }, [workspaceId]); // eslint-disable-line

  // Auto-refresh every 30 s
  useEffect(() => {
    const id = setInterval(() => load(true), 30_000);
    return () => clearInterval(id);
  }, [workspaceId]); // eslint-disable-line

  // ── Filter ────────────────────────────────────────────────────────────────
  const visible = entries.filter(e => {
    if (filter === "tasks") return TASK_ACTIONS.includes(e.action);
    if (filter === "team")  return TEAM_ACTIONS.includes(e.action);
    return true;
  });

  // ── Group by day ──────────────────────────────────────────────────────────
  const groups = [];
  let lastDay = null;
  visible.forEach(e => {
    const label = dayLabel(e.created_at);
    if (label !== lastDay) { groups.push({ label, items: [] }); lastDay = label; }
    groups[groups.length - 1].items.push(e);
  });

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="af-root">
      {/* Header bar */}
      <div className="af-header">
        <div className="af-filters">
          {FILTERS.map(f => (
            <button
              key={f.id}
              className={`af-filter-btn ${filter === f.id ? "active" : ""}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button className="af-refresh-btn" onClick={() => load(true)} disabled={loading} title="Refresh">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
            style={{ animation: loading ? "spin 1s linear infinite" : "none" }}>
            <polyline points="23 4 23 10 17 10"/>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
          Refresh
        </button>
      </div>

      {/* Feed */}
      <div className="af-list">
        {loading && entries.length === 0 ? (
          <div className="af-empty">
            <div className="af-spinner" />
            <span>Loading activity…</span>
          </div>
        ) : visible.length === 0 ? (
          <div className="af-empty">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
            <span>No activity yet</span>
            <p>Actions like creating tasks, moving them, and assigning people will appear here.</p>
          </div>
        ) : (
          <>
            {groups.map(g => (
              <div key={g.label} className="af-group">
                <div className="af-day-label">{g.label}</div>
                {g.items.map(e => <FeedItem key={e.id} entry={e} />)}
              </div>
            ))}
            {hasMore && (
              <button className="af-load-more" onClick={() => load(false)} disabled={loading}>
                {loading ? "Loading…" : "Load more"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
