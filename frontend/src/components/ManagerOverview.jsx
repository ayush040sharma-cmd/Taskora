/**
 * ManagerOverview — Redesigned Overview Dashboard
 *
 * Answers in <10 seconds:
 *   1. Are we on track?
 *   2. Who is overloaded?
 *   3. What is at risk?
 *   4. What action should I take?
 */

import { useState, useEffect, useCallback } from "react";
import api from "../api/api";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Cell,
  PieChart, Pie,
  LineChart, Line, Area, AreaChart,
  Legend,
} from "recharts";

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  green:  "#10b981", greenBg:  "#f0fdf4", greenBorder: "#bbf7d0",
  yellow: "#f59e0b", yellowBg: "#fffbeb", yellowBorder: "#fde68a",
  red:    "#ef4444", redBg:    "#fef2f2", redBorder:   "#fecaca",
  blue:   "#6366f1", blueBg:   "#f0f4ff", blueBorder:  "#c7d2fe",
  slate:  "#64748b", card:     "#ffffff",
  border: "#e2e8f0", bg:       "#f8fafc",
  text:   "#0f172a", muted:    "#94a3b8",
};

const STATUS_COLOR = { todo: C.slate, inprogress: C.blue, done: C.green };
const PRIORITY_COLOR = { high: C.red, medium: C.yellow, low: C.green, critical: "#dc2626" };

const card = {
  background: "#fff",
  border: `1px solid ${C.border}`,
  borderRadius: 16,
  padding: "20px 24px",
  boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
};

const section = { fontSize: 13, fontWeight: 700, color: C.slate, marginBottom: 14, letterSpacing: "0.03em", textTransform: "uppercase" };

// ─── Helpers ──────────────────────────────────────────────────────────────────
function loadColor(pct) {
  return pct > 100 ? C.red : pct >= 80 ? C.yellow : C.green;
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
  const c = critical && Number(value) > 0 ? C.red : color || C.blue;
  return (
    <div style={{
      ...card,
      display: "flex", flexDirection: "column", gap: 8,
      borderTop: `3px solid ${c}`,
      transition: "box-shadow 0.2s",
    }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.10)"}
      onMouseLeave={e => e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.06)"}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: critical && Number(value) > 0 ? C.redBg : bg || C.blueBg,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 18, flexShrink: 0,
        }}>
          {icon}
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, color: C.slate, textTransform: "uppercase", letterSpacing: "0.04em" }}>
          {label}
        </div>
      </div>
      <div style={{ fontSize: 32, fontWeight: 800, color: c, lineHeight: 1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: C.muted }}>{sub}</div>}
      {trend !== undefined && (
        <div style={{ fontSize: 12, color: trend >= 0 ? C.green : C.red, fontWeight: 600 }}>
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
    capacity: 100,
    status: m.status,
    on_leave: m.on_leave,
  }));

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const row = data.find(d => d.name === label) || {};
    return (
      <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", fontSize: 13 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>
        <div style={{ color: loadColor(row.load) }}>Load: <strong>{row.load}%</strong></div>
        {row.on_leave && <div style={{ color: C.muted }}>🏖 On Leave</div>}
      </div>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 16, left: -20, bottom: 0 }} barSize={32}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 12, fill: C.slate }} axisLine={false} tickLine={false} />
        <YAxis domain={[0, Math.max(120, ...data.map(d => d.load))]} tick={{ fontSize: 11, fill: C.muted }} axisLine={false} tickLine={false} unit="%" />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "#f8fafc" }} />
        {/* Capacity reference line at 100 */}
        <Bar dataKey="load" radius={[6, 6, 0, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.on_leave ? C.muted : loadColor(d.load)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── StatusChart ──────────────────────────────────────────────────────────────
function StatusChart({ tasks }) {
  const counts = { todo: 0, inprogress: 0, done: 0 };
  tasks.forEach(t => { if (counts[t.status] !== undefined) counts[t.status]++; });
  const data = [
    { name: "To Do",       value: counts.todo,       color: C.muted },
    { name: "In Progress", value: counts.inprogress,  color: C.blue },
    { name: "Done",        value: counts.done,        color: C.green },
  ].filter(d => d.value > 0);

  const total = tasks.length;
  const doneRate = total > 0 ? Math.round((counts.done / total) * 100) : 0;

  const CustomLabel = ({ cx, cy }) => (
    <>
      <text x={cx} y={cy - 8} textAnchor="middle" fontSize={26} fontWeight={800} fill={C.text}>{doneRate}%</text>
      <text x={cx} y={cy + 14} textAnchor="middle" fontSize={12} fill={C.muted}>complete</text>
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
          <Tooltip formatter={(v, n) => [v, n]} />
        </PieChart>
      </ResponsiveContainer>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
        {[
          { label: "To Do",       count: counts.todo,        color: C.muted },
          { label: "In Progress", count: counts.inprogress,   color: C.blue },
          { label: "Done",        count: counts.done,         color: C.green },
        ].map(r => (
          <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: r.color, flexShrink: 0 }} />
            <div style={{ flex: 1, fontSize: 13, color: C.slate }}>{r.label}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{r.count}</div>
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
    { name: "High",   value: counts.high,   color: C.red },
    { name: "Medium", value: counts.medium,  color: C.yellow },
    { name: "Low",    value: counts.low,     color: C.green },
  ];
  const max = Math.max(...data.map(d => d.value), 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {data.map(d => (
        <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 8, height: 8, borderRadius: "50%", background: d.color, flexShrink: 0,
          }} />
          <div style={{ width: 56, fontSize: 13, color: C.slate, fontWeight: 500 }}>{d.name}</div>
          <div style={{ flex: 1, height: 10, background: C.bg, borderRadius: 99, overflow: "hidden" }}>
            <div style={{
              height: "100%", width: `${(d.value / max) * 100}%`,
              background: d.color, borderRadius: 99,
              transition: "width 0.6s ease",
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
  // Build last 7 days of completion data
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const label = d.toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric" });
    const short = d.toLocaleDateString("en-US", { weekday: "short" });
    d.setHours(23, 59, 59, 999);
    const completed = tasks.filter(t =>
      t.status === "done" && t.updated_at &&
      Math.abs(new Date(t.updated_at) - d) < 86400000
    ).length;
    return { label: short, completed, full: label };
  });

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 13 }}>
        <div style={{ fontWeight: 600 }}>{payload[0]?.payload?.full || label}</div>
        <div style={{ color: C.blue }}>{payload[0]?.value} tasks completed</div>
      </div>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={160}>
      <AreaChart data={days} margin={{ top: 4, right: 8, left: -28, bottom: 0 }}>
        <defs>
          <linearGradient id="prog-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.blue} stopOpacity={0.18} />
            <stop offset="100%" stopColor={C.blue} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.muted }} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: C.muted }} axisLine={false} tickLine={false} />
        <Tooltip content={<CustomTooltip />} />
        <Area
          type="monotone" dataKey="completed" stroke={C.blue} strokeWidth={2.5}
          fill="url(#prog-grad)" dot={{ fill: C.blue, r: 4 }} activeDot={{ r: 6 }}
        />
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
      <div style={{ textAlign: "center", padding: "32px 0", color: C.muted }}>
        <div style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
        <div style={{ fontWeight: 600, color: C.green }}>Everyone is balanced</div>
        <div style={{ fontSize: 13, marginTop: 4 }}>No team members are overloaded</div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {overloaded.map(m => {
        const pct = m.load_percent || 0;
        const color = loadColor(pct);
        const initials = m.name?.slice(0, 2).toUpperCase();
        return (
          <div key={m.user_id} style={{
            display: "flex", alignItems: "center", gap: 14,
            padding: "14px 16px",
            background: pct > 100 ? C.redBg : C.yellowBg,
            border: `1px solid ${pct > 100 ? C.redBorder : C.yellowBorder}`,
            borderRadius: 12,
          }}>
            <div style={{
              width: 38, height: 38, borderRadius: "50%",
              background: color, color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 700, fontSize: 13, flexShrink: 0,
            }}>
              {initials}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{m.name}</span>
                {m.travel_mode && <span style={{ fontSize: 11, background: "#dbeafe", color: "#1d4ed8", padding: "2px 7px", borderRadius: 6 }}>✈ Travelling</span>}
              </div>
              <div style={{ height: 7, background: "#e2e8f0", borderRadius: 99, overflow: "hidden" }}>
                <div style={{
                  height: "100%", width: `${Math.min(100, pct)}%`,
                  background: color, borderRadius: 99, transition: "width 0.5s",
                }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5, fontSize: 12, color: C.slate }}>
                <span>{m.task_count} active tasks · {m.total_remaining_hours || 0}h remaining</span>
                <span style={{ fontWeight: 700, color }}>{pct}% load</span>
              </div>
            </div>
          </div>
        );
      })}
      <button
        onClick={onRebalance}
        style={{
          marginTop: 4,
          padding: "10px 16px",
          background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
          color: "#fff", border: "none", borderRadius: 10,
          fontSize: 13, fontWeight: 700, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          transition: "opacity 0.2s",
        }}
        onMouseEnter={e => e.currentTarget.style.opacity = "0.88"}
        onMouseLeave={e => e.currentTarget.style.opacity = "1"}
      >
        ⚖️ Go to Simulation — Rebalance Work
      </button>
    </div>
  );
}

// ─── AtRiskTasks ─────────────────────────────────────────────────────────────
function AtRiskTasks({ tasks }) {
  const today = new Date();
  const atRisk = tasks
    .filter(t => t.status !== "done" && (
      (t.risk_score && t.risk_score >= 40) ||
      (t.due_date && new Date(t.due_date) < today)
    ))
    .sort((a, b) => (b.risk_score || 0) - (a.risk_score || 0))
    .slice(0, 8);

  if (!atRisk.length) {
    return (
      <div style={{ textAlign: "center", padding: "32px 0", color: C.muted }}>
        <div style={{ fontSize: 36, marginBottom: 8 }}>🛡️</div>
        <div style={{ fontWeight: 600, color: C.green }}>No tasks at risk</div>
        <div style={{ fontSize: 13, marginTop: 4 }}>All tasks are on track</div>
      </div>
    );
  }

  const riskColor = (score, overdue) => {
    if (overdue) return C.red;
    if (score >= 70) return C.red;
    if (score >= 40) return C.yellow;
    return C.green;
  };

  const riskLabel = (score, overdue) => {
    if (overdue) return "Overdue";
    if (score >= 70) return "High Risk";
    if (score >= 40) return "Medium Risk";
    return "Low Risk";
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {atRisk.map(t => {
        const overdue = t.due_date && new Date(t.due_date) < today;
        const color = riskColor(t.risk_score, overdue);
        const label = riskLabel(t.risk_score, overdue);
        const initials = t.assignee_name?.slice(0, 2).toUpperCase() || "??";

        return (
          <div key={t.id} style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: "12px 14px",
            background: "#fff",
            border: `1px solid ${C.border}`,
            borderLeft: `3px solid ${color}`,
            borderRadius: 10,
            transition: "box-shadow 0.15s",
          }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = "0 2px 10px rgba(0,0,0,0.08)"}
            onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}
          >
            {/* Assignee avatar */}
            <div style={{
              width: 30, height: 30, borderRadius: "50%",
              background: t.assignee_name ? C.blue : C.muted,
              color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 700, flexShrink: 0,
            }}>
              {initials}
            </div>

            {/* Task info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontWeight: 600, fontSize: 13, color: C.text,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>
                {t.title}
              </div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                {t.assignee_name || "Unassigned"}
                {t.due_date && (
                  <span style={{ marginLeft: 8, color: overdue ? C.red : C.muted }}>
                    · Due {new Date(t.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                )}
              </div>
            </div>

            {/* Risk badge */}
            <div style={{ flexShrink: 0 }}>
              <div style={{
                fontSize: 11, fontWeight: 700,
                color, background: color + "18",
                padding: "3px 9px", borderRadius: 20,
              }}>
                {t.risk_score ? `${t.risk_score}%` : ""} {label}
              </div>
              {t.priority && (
                <div style={{
                  fontSize: 10, color: PRIORITY_COLOR[t.priority] || C.muted,
                  textAlign: "center", marginTop: 3, fontWeight: 600,
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
  const recent = [...tasks].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)).slice(0, 12);

  const STATUS_PILL = {
    todo:       { bg: "#f1f5f9", color: "#475569", label: "To Do" },
    inprogress: { bg: C.blueBg,  color: C.blue,   label: "In Progress" },
    done:       { bg: C.greenBg, color: C.green,  label: "Done" },
  };

  return (
    <div style={{ ...card, overflow: "hidden" }}>
      {/* Collapsible header */}
      <div
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          cursor: "pointer", userSelect: "none",
        }}
        onClick={() => setOpen(v => !v)}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 16 }}>📋</span>
          <span style={{ fontWeight: 700, color: C.text, fontSize: 15 }}>Recent Tasks</span>
          <span style={{
            fontSize: 12, background: C.bg, color: C.slate,
            padding: "2px 8px", borderRadius: 20, border: `1px solid ${C.border}`,
          }}>
            {tasks.length} total
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: C.muted }}>Low priority section</span>
          <span style={{ fontSize: 18, color: C.muted, transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}>
            ⌄
          </span>
        </div>
      </div>

      {open && (
        <div style={{ marginTop: 16 }}>
          {/* Table header */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 140px 100px 80px 90px",
            gap: 12, padding: "8px 12px",
            background: C.bg, borderRadius: 8,
            fontSize: 11, fontWeight: 700, color: C.muted,
            textTransform: "uppercase", letterSpacing: "0.05em",
            marginBottom: 6,
          }}>
            <span>Task</span><span>Assignee</span><span>Status</span><span>Priority</span><span>Updated</span>
          </div>

          {recent.map(t => {
            const pill = STATUS_PILL[t.status] || STATUS_PILL.todo;
            return (
              <div key={t.id} style={{
                display: "grid",
                gridTemplateColumns: "1fr 140px 100px 80px 90px",
                gap: 12, padding: "10px 12px",
                alignItems: "center",
                borderBottom: `1px solid ${C.border}`,
                transition: "background 0.15s",
              }}
                onMouseEnter={e => e.currentTarget.style.background = C.bg}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                <div style={{ fontSize: 13, fontWeight: 500, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {t.title}
                </div>
                <div style={{ fontSize: 12, color: C.slate }}>
                  {t.assignee_name ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{
                        width: 22, height: 22, borderRadius: "50%",
                        background: C.blue, color: "#fff",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 9, fontWeight: 700,
                      }}>
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
                  <span style={{
                    fontSize: 11, fontWeight: 600,
                    background: pill.bg, color: pill.color,
                    padding: "3px 8px", borderRadius: 6,
                  }}>
                    {pill.label}
                  </span>
                </div>
                <div>
                  {t.priority && (
                    <span style={{
                      fontSize: 11, fontWeight: 700,
                      color: PRIORITY_COLOR[t.priority] || C.muted,
                    }}>
                      {t.priority?.charAt(0).toUpperCase() + t.priority?.slice(1)}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: C.muted }}>{timeAgo(t.updated_at)}</div>
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
  const [logs, setLogs]       = useState([]);
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {loading ? (
        <div style={{ color: C.muted, fontSize: 13, textAlign: "center", padding: "24px 0" }}>Loading…</div>
      ) : logs.length === 0 ? (
        <div style={{ color: C.muted, fontSize: 13, textAlign: "center", padding: "24px 0" }}>No recent activity</div>
      ) : logs.map((l, i) => (
        <div key={l.id} style={{
          display: "flex", alignItems: "flex-start", gap: 10,
          padding: "10px 0",
          borderBottom: i < logs.length - 1 ? `1px solid ${C.border}` : "none",
        }}>
          <div style={{
            width: 30, height: 30, borderRadius: "50%",
            background: C.blueBg, border: `1px solid ${C.blueBorder}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 13, flexShrink: 0,
          }}>
            {ICON[l.action] || "📝"}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, color: C.text, lineHeight: 1.4 }}>
              <strong>{l.actor_name || "Someone"}</strong>{" "}
              <span style={{ color: C.slate }}>{l.action?.replace(/_/g, " ")}</span>
              {l.meta?.task_title && (
                <span style={{ color: C.blue }}> "{l.meta.task_title}"</span>
              )}
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{timeAgo(l.created_at)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main ManagerOverview ─────────────────────────────────────────────────────
export default function ManagerOverview({ workspaceId, team = [], onNavigateToSimulate }) {
  const [tasks,   setTasks]   = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const r = await api.get(`/tasks/workspace/${workspaceId}`);
      setTasks(r.data || []);
    } catch {}
    finally { setLoading(false); }
  }, [workspaceId]);

  useEffect(() => { load(); }, [load]);

  if (!workspaceId) return null;

  // ── KPI computations ──────────────────────────────────────────────────────
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const total       = tasks.length;
  const completed   = tasks.filter(t => t.status === "done").length;
  const inProgress  = tasks.filter(t => t.status === "inprogress").length;
  const overdue     = tasks.filter(t => t.due_date && new Date(t.due_date) < today && t.status !== "done").length;
  const atRisk      = tasks.filter(t => t.status !== "done" && t.risk_score >= 40).length;
  const activeTeam  = team.filter(m => !m.on_leave);
  const avgUtil     = activeTeam.length
    ? Math.round(activeTeam.reduce((s, m) => s + (m.load_percent || 0), 0) / activeTeam.length)
    : 0;
  const overloaded  = team.filter(m => m.load_percent > 100 && !m.on_leave).length;

  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  const KPIS = [
    { icon: "📋", label: "Total Tasks",       value: total,      color: C.blue,   bg: C.blueBg,   sub: `${completionRate}% complete` },
    { icon: "✅", label: "Completed",         value: completed,  color: C.green,  bg: C.greenBg,  sub: "all time" },
    { icon: "🔄", label: "In Progress",       value: inProgress, color: C.blue,   bg: C.blueBg },
    { icon: "⏰", label: "Overdue",           value: overdue,    color: C.red,    bg: C.redBg,    critical: true, sub: overdue > 0 ? "Need attention" : "All on track" },
    { icon: "📊", label: "Team Utilization",  value: `${avgUtil}%`, color: loadColor(avgUtil), bg: avgUtil > 80 ? C.yellowBg : C.greenBg, sub: `${overloaded} overloaded` },
    { icon: "🔥", label: "At Risk Tasks",     value: atRisk,     color: C.red,    bg: C.redBg,    critical: true, sub: atRisk > 0 ? "High priority" : "All clear" },
  ];

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 12, color: C.muted, padding: "60px 0", justifyContent: "center" }}>
        <div style={{
          width: 24, height: 24, borderRadius: "50%",
          border: `3px solid ${C.border}`, borderTopColor: C.blue,
          animation: "spin 0.8s linear infinite",
        }} />
        <span>Building your dashboard…</span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, padding: "4px 0 32px" }}>

      {/* ── KPI Cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 14 }}>
        {KPIS.map(k => <StatCard key={k.label} {...k} />)}
      </div>

      {/* ── Status alert banner (if any critical issues) ── */}
      {(overdue > 0 || overloaded > 0) && (
        <div style={{
          display: "flex", alignItems: "center", gap: 14,
          background: C.redBg, border: `1px solid ${C.redBorder}`,
          borderRadius: 12, padding: "14px 20px",
        }}>
          <span style={{ fontSize: 20 }}>⚠️</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, color: "#991b1b", fontSize: 14 }}>Action Required</div>
            <div style={{ fontSize: 13, color: "#b91c1c", marginTop: 2 }}>
              {[
                overdue > 0 && `${overdue} task${overdue > 1 ? "s are" : " is"} overdue`,
                overloaded > 0 && `${overloaded} team member${overloaded > 1 ? "s are" : " is"} overloaded`,
              ].filter(Boolean).join(" · ")}
            </div>
          </div>
          <button
            onClick={() => onNavigateToSimulate?.()}
            style={{
              padding: "8px 16px", background: C.red, color: "#fff",
              border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700,
              cursor: "pointer", whiteSpace: "nowrap",
            }}
          >
            Rebalance Work →
          </button>
        </div>
      )}

      {/* ── Charts row ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 18 }}>

        {/* Workload by User */}
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: C.text }}>Team Workload</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Current load % per member</div>
            </div>
            <div style={{ display: "flex", gap: 12, fontSize: 11 }}>
              {[["#10b981","Healthy"],["#f59e0b","High"],["#ef4444","Overloaded"]].map(([c,l]) => (
                <span key={l} style={{ display: "flex", alignItems: "center", gap: 4, color: C.slate }}>
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

        {/* Status donut */}
        <div style={card}>
          <div style={{ fontWeight: 700, fontSize: 15, color: C.text, marginBottom: 4 }}>Task Status</div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>Overall progress breakdown</div>
          <StatusChart tasks={tasks} />
        </div>
      </div>

      {/* Priority + Weekly Progress */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: 18 }}>

        {/* Priority */}
        <div style={card}>
          <div style={{ fontWeight: 700, fontSize: 15, color: C.text, marginBottom: 4 }}>Open Tasks by Priority</div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 18 }}>Distribution of active work</div>
          <PriorityChart tasks={tasks} />
        </div>

        {/* Weekly progress */}
        <div style={card}>
          <div style={{ fontWeight: 700, fontSize: 15, color: C.text, marginBottom: 4 }}>Daily Completions</div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>Tasks marked done over the last 7 days</div>
          <ProgressChart tasks={tasks} />
        </div>
      </div>

      {/* ── Actionable panels ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>

        {/* Overloaded Users */}
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: C.text }}>⚡ Overloaded Members</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Load {">"} 80% — needs rebalancing</div>
            </div>
            <div style={{
              background: team.filter(m => m.load_percent > 80 && !m.on_leave).length > 0 ? C.redBg : C.greenBg,
              color:      team.filter(m => m.load_percent > 80 && !m.on_leave).length > 0 ? C.red   : C.green,
              fontSize: 12, fontWeight: 700,
              padding: "3px 10px", borderRadius: 20,
            }}>
              {team.filter(m => m.load_percent > 80 && !m.on_leave).length} overloaded
            </div>
          </div>
          <OverloadedUsers team={team} onRebalance={() => onNavigateToSimulate?.()} />
        </div>

        {/* At-Risk Tasks */}
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: C.text }}>🔥 At-Risk Tasks</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Overdue or high risk score</div>
            </div>
            <div style={{
              background: atRisk + overdue > 0 ? C.redBg : C.greenBg,
              color:      atRisk + overdue > 0 ? C.red   : C.green,
              fontSize: 12, fontWeight: 700,
              padding: "3px 10px", borderRadius: 20,
            }}>
              {atRisk + overdue} at risk
            </div>
          </div>
          <AtRiskTasks tasks={tasks} />
        </div>
      </div>

      {/* ── Activity + Task List row ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 18 }}>

        {/* Recent Activity */}
        <div style={card}>
          <div style={{ fontWeight: 700, fontSize: 15, color: C.text, marginBottom: 4 }}>Recent Activity</div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 14 }}>Latest team actions</div>
          <ActivityFeed workspaceId={workspaceId} />
        </div>

        {/* Collapsible task list */}
        <TaskList tasks={tasks} />
      </div>
    </div>
  );
}
