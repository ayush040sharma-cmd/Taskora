import { useState, useEffect, useCallback } from "react";
import api from "../api/api";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Cell,
  PieChart, Pie,
  AreaChart, Area,
} from "recharts";

// CSS-var strings — safe for JSX inline styles (div/span/etc.)
const C = {
  ok:        "var(--tk-status-ok)",
  okBg:      "var(--tk-status-ok-bg)",
  warn:      "var(--tk-status-warn)",
  warnBg:    "var(--tk-status-warn-bg)",
  danger:    "var(--tk-status-danger)",
  dangerBg:  "var(--tk-status-danger-bg)",
  accent:    "var(--tk-accent)",
  accentBg:  "var(--tk-accent-glow)",
  text:      "var(--tk-text-primary)",
  secondary: "var(--tk-text-secondary)",
  muted:     "var(--tk-text-muted)",
  card:      "var(--tk-card)",
  border:    "var(--tk-border)",
  bg:        "var(--tk-bg-elevated)",
};

// Actual hex values for Recharts SVG props (CSS vars don't work as SVG presentation attrs)
// All values are exact matches to tokens.css
const HC = {
  ok:     "#22C55E",  // --tk-status-ok
  warn:   "#F59E0B",  // --tk-status-warn
  danger: "#EF4444",  // --tk-status-danger
  accent: "#3B82F6",  // --tk-accent (substituted for #6366f1 indigo — FLAGGED: not in tokens)
  muted:  "#475569",  // --tk-text-muted
  border: "#1E293B",  // --tk-border
  bg:     "#0F172A",  // --tk-bg-elevated
  card:   "#0B1220",  // --tk-card
};

// Card style shared across ManagerOverview panels
const cardStyle = {
  background: C.card,
  border: `1px solid ${HC.border}`,
  borderRadius: "var(--tk-radius-card)",
  padding: "20px 24px",
};

function loadColor(pct) {
  return pct > 100 ? HC.danger : pct >= 80 ? HC.warn : HC.ok;
}

function timeAgo(ts) {
  const d = (Date.now() - new Date(ts)) / 1000;
  if (d < 60)    return "just now";
  if (d < 3600)  return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

// ─── StatCard ─────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, sub, color, bg, trend, critical }) {
  const c   = critical && Number(value) > 0 ? C.danger   : (color || C.accent);
  const cBg = critical && Number(value) > 0 ? C.dangerBg : (bg    || C.accentBg);
  return (
    <div className="mo-stat-card" style={{ borderTop: `3px solid ${c}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div className="mo-stat-icon" style={{ background: cBg }}>{icon}</div>
        <div className="mo-stat-label">{label}</div>
      </div>
      <div className="mo-stat-value" style={{ color: c }}>{value}</div>
      {sub && <div className="mo-stat-sub">{sub}</div>}
      {trend !== undefined && (
        <div className="mo-stat-trend" style={{ color: trend >= 0 ? C.ok : C.danger }}>
          {trend >= 0 ? "▲" : "▼"} {Math.abs(trend)} vs last week
        </div>
      )}
    </div>
  );
}

// ─── WorkloadChart ────────────────────────────────────────────────────────────
function WorkloadChart({ team }) {
  const data = team.map(m => ({
    name: m.name.split(" ")[0],
    load: m.load_percent || 0,
    status: m.status,
    on_leave: m.on_leave,
  }));

  const ChartTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const row = data.find(d => d.name === label) || {};
    return (
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", fontSize: 13 }}>
        <div style={{ fontWeight: 700, color: C.text, marginBottom: 4 }}>{label}</div>
        <div style={{ color: loadColor(row.load) }}>Load: <strong>{row.load}%</strong></div>
        {row.on_leave && <div style={{ color: C.muted }}>🏖 On Leave</div>}
      </div>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 16, left: -20, bottom: 0 }} barSize={32}>
        <CartesianGrid strokeDasharray="3 3" stroke={HC.border} vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 12, fill: HC.muted }} axisLine={false} tickLine={false} />
        <YAxis domain={[0, Math.max(120, ...data.map(d => d.load))]} tick={{ fontSize: 11, fill: HC.muted }} axisLine={false} tickLine={false} unit="%" />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: HC.bg }} />
        <Bar dataKey="load" radius={[6, 6, 0, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.on_leave ? HC.muted : loadColor(d.load)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── StatusChart ──────────────────────────────────────────────────────────────
function StatusChart({ tasks }) {
  const counts = { todo: 0, inprogress: 0, done: 0 };
  tasks.forEach(t => {
    const s = t.status === "in_progress" ? "inprogress" : t.status;
    if (counts[s] !== undefined) counts[s]++;
  });
  const data = [
    { name: "To Do",       value: counts.todo,        color: HC.muted  },
    { name: "In Progress", value: counts.inprogress,  color: HC.accent },
    { name: "Done",        value: counts.done,        color: HC.ok     },
  ].filter(d => d.value > 0);

  const total    = tasks.length;
  const doneRate = total > 0 ? Math.round((counts.done / total) * 100) : 0;

  const CustomLabel = ({ cx, cy }) => (
    <>
      <text x={cx} y={cy - 8} textAnchor="middle" fontSize={26} fontWeight={800}
        style={{ fill: "var(--tk-text-primary)", fontFamily: "var(--tk-font-display)" }}>
        {doneRate}%
      </text>
      <text x={cx} y={cy + 14} textAnchor="middle" fontSize={12} style={{ fill: "var(--tk-text-muted)" }}>
        complete
      </text>
    </>
  );

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
      <ResponsiveContainer width={160} height={160}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={50} outerRadius={72}
            dataKey="value" startAngle={90} endAngle={-270}
            labelLine={false} label={data.length > 0 ? CustomLabel : false}
          >
            {data.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Pie>
          <Tooltip formatter={(v, n) => [v, n]} contentStyle={{ background: HC.card, border: `1px solid ${HC.border}`, borderRadius: 8, color: HC.accent }} />
        </PieChart>
      </ResponsiveContainer>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
        {[
          { label: "To Do",       count: counts.todo,       color: HC.muted  },
          { label: "In Progress", count: counts.inprogress, color: HC.accent },
          { label: "Done",        count: counts.done,       color: HC.ok     },
        ].map(r => (
          <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div className="mo-legend-dot" style={{ background: r.color }} />
            <div className="mo-legend-label">{r.label}</div>
            <div className="mo-legend-count">{r.count}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── PriorityChart ────────────────────────────────────────────────────────────
function PriorityChart({ tasks }) {
  const open = tasks.filter(t => t.status !== "done");
  const counts = { high: 0, medium: 0, low: 0 };
  open.forEach(t => { if (counts[t.priority] !== undefined) counts[t.priority]++; });

  const data = [
    { name: "High",   value: counts.high,   color: HC.danger },
    { name: "Medium", value: counts.medium, color: HC.warn   },
    { name: "Low",    value: counts.low,    color: HC.ok     },
  ];
  const max = Math.max(...data.map(d => d.value), 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {data.map(d => (
        <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: d.color, flexShrink: 0 }} />
          <div style={{ width: 56, fontSize: 13, color: C.secondary, fontWeight: 500 }}>{d.name}</div>
          <div className="tk-progress-track" style={{ flex: 1 }}>
            <div style={{
              height: "100%", width: `${(d.value / max) * 100}%`,
              background: d.color, borderRadius: 4, transition: "width 0.6s",
            }} />
          </div>
          <div style={{ width: 28, textAlign: "right", fontSize: 14, fontWeight: 700, color: C.text }}>
            {d.value}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── ProgressChart ────────────────────────────────────────────────────────────
function ProgressChart({ tasks }) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const short = d.toLocaleDateString("en-US", { weekday: "short" });
    const full  = d.toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric" });
    d.setHours(23, 59, 59, 999);
    const completed = tasks.filter(t =>
      t.status === "done" && t.completed_at &&
      Math.abs(new Date(t.completed_at) - d) < 86400000
    ).length;
    return { label: short, completed, full };
  });

  const ChartTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 13 }}>
        <div style={{ fontWeight: 600, color: C.text }}>{payload[0]?.payload?.full || label}</div>
        <div style={{ color: C.accent }}>{payload[0]?.value} tasks completed</div>
      </div>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={160}>
      <AreaChart data={days} margin={{ top: 4, right: 8, left: -28, bottom: 0 }}>
        <defs>
          <linearGradient id="prog-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={HC.accent} stopOpacity={0.25} />
            <stop offset="100%" stopColor={HC.accent} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={HC.border} vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: HC.muted }} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: HC.muted }} axisLine={false} tickLine={false} />
        <Tooltip content={<ChartTooltip />} />
        <Area type="monotone" dataKey="completed" stroke={HC.accent} strokeWidth={2.5}
          fill="url(#prog-grad)" dot={{ fill: HC.accent, r: 4 }} activeDot={{ r: 6 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── OverloadedUsers ──────────────────────────────────────────────────────────
function OverloadedUsers({ team, onRebalance }) {
  const overloaded = team.filter(m => m.load_percent > 80 && !m.on_leave)
    .sort((a, b) => b.load_percent - a.load_percent);

  if (!overloaded.length) {
    return (
      <div style={{ textAlign: "center", padding: "32px 0" }}>
        <div style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
        <div style={{ fontWeight: 600, color: C.ok }}>Everyone is balanced</div>
        <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>No team members are overloaded</div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {overloaded.map(m => {
        const pct   = m.load_percent || 0;
        const color = loadColor(pct);
        const isOver = pct > 100;
        return (
          <div key={m.user_id} className={`mo-member-row ${isOver ? "mo-member-row--over" : "mo-member-row--warn"}`}>
            <div className="tk-avatar" style={{ width: 38, height: 38, fontSize: 13, flexShrink: 0 }}>
              {m.name?.slice(0, 2).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{m.name}</span>
                {m.travel_mode && (
                  <span className="tk-pill tk-pill--ok" style={{ fontSize: 10, padding: "1px 6px" }}>✈ Travelling</span>
                )}
              </div>
              <div className="tk-progress-track" style={{ height: 7 }}>
                <div style={{
                  height: "100%", width: `${Math.min(100, pct)}%`,
                  background: color, borderRadius: 4, transition: "width 0.5s",
                }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5, fontSize: 12, color: C.secondary }}>
                <span>{m.task_count} active tasks · {m.total_remaining_hours || 0}h remaining</span>
                <span style={{ fontWeight: 700, color }}>{pct}% load</span>
              </div>
            </div>
          </div>
        );
      })}
      <button className="tk-btn-primary" onClick={onRebalance}
        style={{ marginTop: 4, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        ⚖️ Go to Simulation — Rebalance Work
      </button>
    </div>
  );
}

// ─── AtRiskTasks ─────────────────────────────────────────────────────────────
function AtRiskTasks({ tasks }) {
  const today  = new Date();
  const atRisk = tasks
    .filter(t => t.status !== "done" && (
      (t.risk_score && t.risk_score >= 40) ||
      (t.due_date && new Date(t.due_date) < today)
    ))
    .sort((a, b) => (b.risk_score || 0) - (a.risk_score || 0))
    .slice(0, 8);

  if (!atRisk.length) {
    return (
      <div style={{ textAlign: "center", padding: "32px 0" }}>
        <div style={{ fontSize: 36, marginBottom: 8 }}>🛡️</div>
        <div style={{ fontWeight: 600, color: C.ok }}>No tasks at risk</div>
        <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>All tasks are on track</div>
      </div>
    );
  }

  const riskColor = (score, overdue) => {
    if (overdue || score >= 70) return C.danger;
    if (score >= 40)            return C.warn;
    return C.ok;
  };
  const riskBg = (score, overdue) => {
    if (overdue || score >= 70) return C.dangerBg;
    if (score >= 40)            return C.warnBg;
    return C.okBg;
  };
  const riskLabel = (score, overdue) => {
    if (overdue)       return "Overdue";
    if (score >= 70)   return "High Risk";
    if (score >= 40)   return "Medium Risk";
    return "Low Risk";
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {atRisk.map(t => {
        const overdue = t.due_date && new Date(t.due_date) < today;
        const color   = riskColor(t.risk_score, overdue);
        const bg      = riskBg(t.risk_score, overdue);
        const label   = riskLabel(t.risk_score, overdue);

        return (
          <div key={t.id} className="mo-risk-row" style={{ borderLeft: `3px solid ${color}` }}>
            <div className="tk-avatar" style={{ width: 30, height: 30, fontSize: 10, flexShrink: 0 }}>
              {(t.assignee_name?.slice(0, 2) || "??").toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {t.title}
              </div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                {t.assignee_name || "Unassigned"}
                {t.due_date && (
                  <span style={{ marginLeft: 8, color: overdue ? C.danger : C.muted }}>
                    · Due {new Date(t.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                )}
              </div>
            </div>
            <div style={{ flexShrink: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color, background: bg, padding: "3px 9px", borderRadius: 20 }}>
                {t.risk_score ? `${t.risk_score}%` : ""} {label}
              </div>
              {t.priority && (
                <div style={{
                  fontSize: 10, textAlign: "center", marginTop: 3, fontWeight: 600,
                  color: t.priority === "high" || t.priority === "critical" ? C.danger
                       : t.priority === "medium" ? C.warn : C.ok,
                }}>
                  {t.priority?.toUpperCase()}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── TaskList ─────────────────────────────────────────────────────────────────
function TaskList({ tasks }) {
  const [open, setOpen] = useState(false);
  const recent = [...tasks].sort((a, b) => {
    const aDate = a.completed_at || a.created_at || 0;
    const bDate = b.completed_at || b.created_at || 0;
    return new Date(bDate) - new Date(aDate);
  }).slice(0, 12);

  const STATUS_PILL = {
    todo:       { pillClass: "", style: { background: HC.bg, color: HC.muted }, label: "To Do" },
    inprogress: { pillClass: "", style: { background: `${HC.accent}22`, color: HC.accent }, label: "In Progress" },
    done:       { pillClass: "", style: { background: `${HC.ok}22`, color: HC.ok }, label: "Done" },
  };

  return (
    <div className="mo-card" style={{ overflow: "hidden", padding: 0 }}>
      <div
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", userSelect: "none", padding: "20px 24px" }}
        onClick={() => setOpen(v => !v)}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 16 }}>📋</span>
          <span style={{ fontWeight: 700, color: C.text, fontSize: 15 }}>Recent Tasks</span>
          <span style={{ fontSize: 12, background: C.bg, color: C.secondary, padding: "2px 8px", borderRadius: 20, border: `1px solid ${C.border}` }}>
            {tasks.length} total
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: C.muted }}>Low priority section</span>
          <span style={{ fontSize: 18, color: C.muted, transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}>⌄</span>
        </div>
      </div>

      {open && (
        <div style={{ padding: "0 24px 20px" }}>
          <div className="mo-task-table-header">
            <span>Task</span><span>Assignee</span><span>Status</span><span>Priority</span><span>Date</span>
          </div>
          {recent.map(t => {
            const pill = STATUS_PILL[t.status] || STATUS_PILL.todo;
            const priColor = t.priority === "high" || t.priority === "critical" ? C.danger
                           : t.priority === "medium" ? C.warn : C.ok;
            return (
              <div key={t.id} className="mo-task-row">
                <div style={{ fontSize: 13, fontWeight: 500, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {t.title}
                </div>
                <div style={{ fontSize: 12, color: C.secondary }}>
                  {t.assignee_name ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div className="tk-avatar" style={{ width: 22, height: 22, fontSize: 8 }}>
                        {t.assignee_name.slice(0, 2).toUpperCase()}
                      </div>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {t.assignee_name.split(" ")[0]}
                      </span>
                    </div>
                  ) : (
                    <span style={{ color: C.muted }}>Unassigned</span>
                  )}
                </div>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 6, ...pill.style }}>
                    {pill.label}
                  </span>
                </div>
                <div>
                  {t.priority && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: priColor }}>
                      {t.priority.charAt(0).toUpperCase() + t.priority.slice(1)}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: C.muted }}>{timeAgo(t.completed_at || t.created_at)}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Activity Feed ────────────────────────────────────────────────────────────
function ActivityFeed({ workspaceId }) {
  const [logs,    setLogs]    = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!workspaceId) return;
    api.get(`/audit?workspace_id=${workspaceId}&limit=12`)
      .then(r => setLogs(r.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [workspaceId]);

  const ICON = {
    task_assigned: "📋", approval_requested: "⏳", approval_approved: "✅",
    approval_rejected: "❌", capacity_changed: "⚙️", task_created: "➕",
    travel_mode_on: "✈️", leave_started: "🏖️",
  };

  if (loading) return <div style={{ color: C.muted, fontSize: 13, textAlign: "center", padding: "24px 0" }}>Loading…</div>;
  if (!logs.length) return <div style={{ color: C.muted, fontSize: 13, textAlign: "center", padding: "24px 0" }}>No recent activity</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {logs.map((l, i) => (
        <div key={l.id} className="mo-activity-row" style={{ borderBottom: i < logs.length - 1 ? `1px solid ${C.border}` : "none" }}>
          <div className="mo-activity-icon">{ICON[l.action] || "📝"}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, color: C.text, lineHeight: 1.4 }}>
              <strong>{l.actor_name || "Someone"}</strong>{" "}
              <span style={{ color: C.secondary }}>{l.action?.replace(/_/g, " ")}</span>
              {l.meta?.task_title && <span style={{ color: C.accent }}> "{l.meta.task_title}"</span>}
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{timeAgo(l.created_at)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── CategoryChart ────────────────────────────────────────────────────────────
function CategoryChart({ tasks, team }) {
  const TYPE_COLORS = {
    task: HC.accent, bug: HC.danger, story: "#8b5cf6", rfp: "#f59e0b",
    proposal: "#06b6d4", presentation: "#ec4899", upgrade: "#14b8a6",
    poc: "#a78bfa",
  };
  const activeTasks = tasks.filter(t => t.status !== "done");
  const memberMap = {};
  activeTasks.forEach(t => {
    const name = t.assignee_name?.split(" ")[0] || "Unassigned";
    const type = t.task_type || t.type || "task";
    if (!memberMap[name]) memberMap[name] = {};
    memberMap[name][type] = (memberMap[name][type] || 0) + 1;
  });
  const entries = Object.entries(memberMap).slice(0, 6);
  if (!entries.length) return (
    <div style={{ color:C.muted, textAlign:"center", padding:"36px 0", fontSize:13 }}>No active tasks to categorize</div>
  );
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14, marginTop:8 }}>
      {entries.map(([name, types]) => {
        const total = Object.values(types).reduce((s,v)=>s+v,0);
        return (
          <div key={name}>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:5 }}>
              <span style={{ fontWeight:600, color:C.text }}>{name}</span>
              <span style={{ color:C.muted }}>{total} tasks</span>
            </div>
            <div style={{ display:"flex", height:20, borderRadius:6, overflow:"hidden", gap:2 }}>
              {Object.entries(types).map(([type,count])=>(
                <div key={type} title={`${type}: ${count}`}
                  style={{ flex:count, background:TYPE_COLORS[type]||HC.muted, minWidth:4, display:"flex", alignItems:"center", justifyContent:"center", transition:"flex 0.4s" }}>
                  {count>1&&<span style={{ fontSize:9, color:"#fff", fontWeight:700 }}>{count}</span>}
                </div>
              ))}
            </div>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginTop:4 }}>
              {Object.entries(types).map(([type,count])=>(
                <span key={type} style={{ fontSize:10, color:TYPE_COLORS[type]||HC.muted, fontWeight:600 }}>{type} {count}</span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── VelocityChart ────────────────────────────────────────────────────────────
function VelocityChart({ tasks, team }) {
  const weekAgo = new Date(Date.now() - 7*86400000);
  const done = tasks.filter(t => t.status==="done" && t.status_changed_at && new Date(t.status_changed_at)>=weekAgo);
  const byMember = {};
  done.forEach(t => {
    const name = t.assignee_name?.split(" ")[0] || "Unassigned";
    byMember[name] = (byMember[name]||0) + 1;
  });
  const entries = Object.entries(byMember).sort((a,b)=>b[1]-a[1]);
  if (!entries.length) return (
    <div style={{ color:C.muted, textAlign:"center", padding:"36px 0", fontSize:13 }}>No tasks completed this week yet</div>
  );
  const max = Math.max(...entries.map(([,v])=>v), 1);
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12, marginTop:8 }}>
      {entries.map(([name,count])=>(
        <div key={name} style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ width:70, fontSize:13, fontWeight:600, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{name}</div>
          <div className="tk-progress-track" style={{ flex:1, height:10, borderRadius:5 }}>
            <div style={{ height:"100%", width:`${(count/max)*100}%`, background:HC.ok, borderRadius:5, transition:"width 0.6s" }} />
          </div>
          <div style={{ width:24, textAlign:"right", fontSize:15, fontWeight:800, color:HC.ok }}>{count}</div>
        </div>
      ))}
    </div>
  );
}

// ─── TeamActivityFeed ─────────────────────────────────────────────────────────
function TeamActivityFeed({ tasks, workspaceId }) {
  const [logs, setLogs] = useState([]);
  useEffect(() => {
    if (!workspaceId) return;
    api.get(`/audit?workspace_id=${workspaceId}&limit=20`)
      .then(r => setLogs(r.data||[])).catch(()=>{});
  }, [workspaceId]);

  const ICON = {
    task_assigned:"📋", task_created:"➕", task_completed:"✅", task_updated:"✏️",
    approval_requested:"⏳", approval_approved:"✅", approval_rejected:"❌",
    capacity_changed:"⚙️", travel_mode_on:"✈️", leave_started:"🏖️",
  };

  const recentTasks = [...tasks]
    .sort((a,b)=>new Date(b.status_changed_at||b.created_at||0)-new Date(a.status_changed_at||a.created_at||0))
    .slice(0,8)
    .map(t=>({
      id:`t-${t.id}`, ts:t.status_changed_at||t.created_at,
      actor:t.assignee_name||"Unassigned",
      action:t.status==="done"?"completed":t.status==="blocked"?"blocked":"updated",
      taskTitle:t.title,
      icon:t.status==="done"?"✅":t.status==="blocked"?"🚫":"📝",
    }));

  const logEvents = logs.slice(0,12).map(l=>({
    id:`l-${l.id}`, ts:l.created_at,
    actor:l.actor_name||"Someone",
    action:l.action?.replace(/_/g," "),
    taskTitle:l.meta?.task_title,
    icon:ICON[l.action]||"📝",
  }));

  const combined = [...logEvents, ...recentTasks.filter(te=>!logEvents.some(le=>le.taskTitle===te.taskTitle))]
    .sort((a,b)=>new Date(b.ts)-new Date(a.ts)).slice(0,16);

  if (!combined.length) return (
    <div style={{ color:C.muted, textAlign:"center", padding:"32px 0", fontSize:13 }}>No recent activity</div>
  );

  return (
    <div style={{ display:"flex", flexDirection:"column" }}>
      {combined.map((e,i)=>(
        <div key={e.id} style={{ display:"flex", alignItems:"flex-start", gap:12, padding:"10px 0", borderBottom:i<combined.length-1?`1px solid ${C.border}`:"none" }}>
          <div style={{ width:34, height:34, borderRadius:"50%", background:`${HC.accent}20`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:15, flexShrink:0 }}>
            {e.icon}
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:13, color:C.text, lineHeight:1.4 }}>
              <strong>{e.actor}</strong>{" "}
              <span style={{ color:C.secondary }}>{e.action}</span>
              {e.taskTitle&&<span style={{ color:HC.accent }}> "{e.taskTitle}"</span>}
            </div>
            <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>{timeAgo(e.ts)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main ManagerOverview ─────────────────────────────────────────────────────
export default function ManagerOverview({ workspaceId, team = [], tasks: propTasks, onNavigateToSimulate }) {
  const [ownTasks, setOwnTasks] = useState([]);
  const [loading,  setLoading]  = useState(!propTasks);

  const load = useCallback(async () => {
    if (!workspaceId || propTasks) return;
    setLoading(true);
    try {
      const r = await api.get(`/tasks/team-intel/${workspaceId}`);
      setOwnTasks(r.data || []);
    } catch {} finally { setLoading(false); }
  }, [workspaceId, propTasks]);

  useEffect(() => { load(); }, [load]);

  const tasks = propTasks ?? ownTasks;

  if (!workspaceId) return null;

  // KPI computations
  const today       = new Date(); today.setHours(0, 0, 0, 0);
  const total       = tasks.length;
  const completed   = tasks.filter(t => t.status === "done").length;
  const inProgress  = tasks.filter(t => t.status === "inprogress").length;
  const overdue     = tasks.filter(t => t.due_date && new Date(t.due_date) < today && t.status !== "done").length;
  const atRiskCount = tasks.filter(t => t.status !== "done" && t.risk_score >= 40).length;
  const activeTeam  = team.filter(m => !m.on_leave);
  const avgUtil     = activeTeam.length
    ? Math.round(activeTeam.reduce((s, m) => s + (m.load_percent || 0), 0) / activeTeam.length)
    : 0;
  const overloaded  = team.filter(m => m.load_percent > 100 && !m.on_leave).length;
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  const KPIS = [
    { icon: "📋", label: "Total Tasks",      value: total,       color: C.accent,  bg: C.accentBg, sub: `${completionRate}% complete` },
    { icon: "✅", label: "Completed",        value: completed,   color: C.ok,      bg: C.okBg,     sub: "all time" },
    { icon: "🔄", label: "In Progress",      value: inProgress,  color: C.accent,  bg: C.accentBg },
    { icon: "⏰", label: "Overdue",          value: overdue,     critical: true,   sub: overdue > 0 ? "Need attention" : "All on track" },
    { icon: "📊", label: "Team Utilization", value: `${avgUtil}%`, color: avgUtil > 80 ? C.danger : C.ok, bg: avgUtil > 80 ? C.dangerBg : C.okBg, sub: `${overloaded} overloaded` },
    { icon: "🔥", label: "At Risk Tasks",    value: atRiskCount, critical: true,   sub: atRiskCount > 0 ? "High priority" : "All clear" },
  ];

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 12, color: C.muted, padding: "60px 0", justifyContent: "center" }}>
        <div className="mo-spinner" />
        <span>Building your dashboard…</span>
      </div>
    );
  }

  const overloadedCount = team.filter(m => m.load_percent > 80 && !m.on_leave).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, padding: "4px 0 32px" }}>

      {/* KPI Cards */}
      <div className="mo-kpi-grid">
        {KPIS.map(k => <StatCard key={k.label} {...k} />)}
      </div>

      {/* Alert banner */}
      {(overdue > 0 || overloaded > 0) && (
        <div className="mo-alert-banner">
          <span style={{ fontSize: 20, flexShrink: 0 }}>⚠️</span>
          <div style={{ flex: 1 }}>
            <div className="mo-alert-title">Action Required</div>
            <div className="mo-alert-body">
              {[
                overdue > 0     && `${overdue} task${overdue > 1 ? "s are" : " is"} overdue`,
                overloaded > 0  && `${overloaded} team member${overloaded > 1 ? "s are" : " is"} overloaded`,
              ].filter(Boolean).join(" · ")}
            </div>
          </div>
          <button className="tk-btn-primary" onClick={() => onNavigateToSimulate?.()} style={{ whiteSpace: "nowrap", flexShrink: 0 }}>
            Rebalance Work →
          </button>
        </div>
      )}

      {/* Charts row: Workload + Status donut */}
      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 18 }}>
        <div className="mo-card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <div className="mo-card-title">Team Workload</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Current load % per member</div>
            </div>
            <div style={{ display: "flex", gap: 12, fontSize: 11 }}>
              {[[HC.ok,"Healthy"],[HC.warn,"High"],[HC.danger,"Overloaded"]].map(([c,l]) => (
                <span key={l} style={{ display: "flex", alignItems: "center", gap: 4, color: C.secondary }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: c, display: "inline-block" }} />
                  {l}
                </span>
              ))}
            </div>
          </div>
          {team.length === 0
            ? <div style={{ color: C.muted, textAlign: "center", padding: "40px 0", fontSize: 13 }}>No team members yet</div>
            : <WorkloadChart team={team} />
          }
        </div>

        <div className="mo-card">
          <div className="mo-card-title">Task Distribution by Category</div>
          <div className="mo-card-sub">Work type breakdown per member</div>
          <CategoryChart tasks={tasks} team={team} />
        </div>
      </div>

      {/* Priority + Velocity by Member */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: 18 }}>
        <div className="mo-card">
          <div className="mo-card-title">Open Tasks by Priority</div>
          <div className="mo-card-sub">Distribution of active work</div>
          <PriorityChart tasks={tasks} />
        </div>

        <div className="mo-card">
          <div className="mo-card-title">Team Velocity — This Week</div>
          <div className="mo-card-sub">Tasks completed per member in last 7 days</div>
          <VelocityChart tasks={tasks} team={team} />
        </div>
      </div>

      {/* Actionable panels */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <div className="mo-card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <div className="mo-card-title">⚡ Overloaded Members</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Load {">"} 80% — needs rebalancing</div>
            </div>
            <span className={`tk-pill ${overloadedCount > 0 ? "tk-pill--danger" : "tk-pill--ok"}`}>
              {overloadedCount} overloaded
            </span>
          </div>
          <OverloadedUsers team={team} onRebalance={() => onNavigateToSimulate?.()} />
        </div>

        <div className="mo-card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <div className="mo-card-title">🔥 At-Risk Tasks</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Overdue or high risk score</div>
            </div>
            <span className={`tk-pill ${atRiskCount + overdue > 0 ? "tk-pill--danger" : "tk-pill--ok"}`}>
              {atRiskCount + overdue} at risk
            </span>
          </div>
          <AtRiskTasks tasks={tasks} />
        </div>
      </div>

      {/* Merged Team Activity Feed */}
      <div className="mo-card">
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
          <div>
            <div className="mo-card-title">Team Activity Feed</div>
            <div className="mo-card-sub">Live stream of task updates, completions, and assignments</div>
          </div>
          <span style={{ fontSize:12, background:C.bg, color:C.secondary, padding:"3px 10px", borderRadius:20, border:`1px solid ${C.border}` }}>
            {tasks.length} total tasks
          </span>
        </div>
        <TeamActivityFeed tasks={tasks} workspaceId={workspaceId} />
      </div>
    </div>
  );
}
