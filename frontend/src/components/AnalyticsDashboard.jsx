import { useState, useEffect } from "react";
import api from "../api/api";

// ── Mini sparkline SVG ────────────────────────────────────────────────────────
function Sparkline({ data, color = "#6366f1", height = 40, width = 120 }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  });
  return (
    <svg width={width} height={height} style={{ overflow: "visible" }}>
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={parseFloat(pts[pts.length - 1].split(",")[0])}
        cy={parseFloat(pts[pts.length - 1].split(",")[1])}
        r={3}
        fill={color}
      />
    </svg>
  );
}

// ── Velocity bar chart ────────────────────────────────────────────────────────
function VelocityChart({ data }) {
  if (!data || data.length === 0) return <div className="analytics-empty">No sprint data yet.</div>;

  const maxVal = Math.max(...data.map(s => Math.max(s.completed || 0, s.planned || 0)), 1);
  const BAR_W  = 32;
  const GAP    = 16;
  const H      = 120;

  return (
    <div className="velocity-chart">
      <svg width={data.length * (BAR_W * 2 + GAP + 8)} height={H + 32} style={{ overflow: "visible" }}>
        {data.map((s, i) => {
          const x       = i * (BAR_W * 2 + GAP + 8);
          const planned = Math.round((s.planned / maxVal) * H);
          const done    = Math.round((s.completed / maxVal) * H);
          return (
            <g key={i}>
              {/* Planned bar */}
              <rect x={x} y={H - planned} width={BAR_W} height={planned} rx={3} fill="#e2e8f0" />
              <text x={x + BAR_W / 2} y={H - planned - 3} textAnchor="middle" fontSize={9} fill="#94a3b8">
                {s.planned}
              </text>
              {/* Completed bar */}
              <rect x={x + BAR_W + 4} y={H - done} width={BAR_W} height={done} rx={3} fill="#6366f1" />
              <text x={x + BAR_W + 4 + BAR_W / 2} y={H - done - 3} textAnchor="middle" fontSize={9} fill="#6366f1" fontWeight={700}>
                {s.completed}
              </text>
              {/* Sprint label */}
              <text x={x + BAR_W} y={H + 16} textAnchor="middle" fontSize={9} fill="#64748b">
                {(s.name || `S${i + 1}`).slice(0, 8)}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="velocity-legend">
        <span><span className="vl-dot" style={{ background: "#e2e8f0" }} />Planned</span>
        <span><span className="vl-dot" style={{ background: "#6366f1" }} />Completed</span>
      </div>
    </div>
  );
}

// ── Throughput line chart (tasks completed per week) ─────────────────────────
function ThroughputChart({ data }) {
  if (!data || data.length === 0) return <div className="analytics-empty">No throughput data yet.</div>;
  const W = 320, H = 100;
  const max = Math.max(...data.map(d => d.count), 1);
  const pts = data.map((d, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - (d.count / max) * (H - 8) - 4;
    return { x, y, ...d };
  });

  return (
    <div className="throughput-chart">
      <svg width={W} height={H + 24} style={{ overflow: "visible" }}>
        <defs>
          <linearGradient id="tp-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity={0.15} />
            <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
          </linearGradient>
        </defs>
        {/* Fill area */}
        <polygon
          points={[
            `0,${H}`,
            ...pts.map(p => `${p.x},${p.y}`),
            `${W},${H}`,
          ].join(" ")}
          fill="url(#tp-gradient)"
        />
        {/* Line */}
        <polyline
          points={pts.map(p => `${p.x},${p.y}`).join(" ")}
          fill="none" stroke="#6366f1" strokeWidth={2}
          strokeLinecap="round" strokeLinejoin="round"
        />
        {/* Dots */}
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={3} fill="#6366f1" />
        ))}
        {/* X labels — show first/last/middle */}
        {pts.filter((_, i) => i === 0 || i === pts.length - 1 || i === Math.floor(pts.length / 2))
          .map((p, i) => (
            <text key={i} x={p.x} y={H + 20} textAnchor="middle" fontSize={9} fill="#94a3b8">
              {p.week || `W${i + 1}`}
            </text>
          ))}
      </svg>
    </div>
  );
}

export default function AnalyticsDashboard({ workspaceId }) {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!workspaceId) return;
    setLoading(true);

    Promise.all([
      api.get(`/tasks/workspace/${workspaceId}`),
      api.get(`/sprints?workspace_id=${workspaceId}`).catch(() => ({ data: [] })),
    ]).then(([tasksRes, sprintsRes]) => {
      const tasks   = tasksRes.data;
      const sprints = sprintsRes.data;

      // ── KPI cards ───────────────────────────────────────────────────
      const total       = tasks.length;
      const done        = tasks.filter(t => t.status === "done").length;
      const inProgress  = tasks.filter(t => t.status === "inprogress").length;
      const overdue     = tasks.filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== "done").length;
      const unassigned  = tasks.filter(t => !t.assigned_user_id && t.status !== "done").length;
      const completionRate = total > 0 ? Math.round((done / total) * 100) : 0;

      // ── Average completion time (done tasks with start + updated) ───
      const doneTasks  = tasks.filter(t => t.status === "done" && t.created_at && t.updated_at);
      const avgDays    = doneTasks.length > 0
        ? Math.round(doneTasks.reduce((s, t) => {
            const diff = (new Date(t.updated_at) - new Date(t.created_at)) / (1000 * 60 * 60 * 24);
            return s + diff;
          }, 0) / doneTasks.length)
        : null;

      // ── Throughput: tasks completed per week (last 8 weeks) ─────────
      const throughput = [];
      for (let w = 7; w >= 0; w--) {
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - w * 7 - 6);
        weekStart.setHours(0, 0, 0, 0);
        const weekEnd = new Date();
        weekEnd.setDate(weekEnd.getDate() - w * 7);
        weekEnd.setHours(23, 59, 59, 999);

        const count = tasks.filter(t =>
          t.status === "done" && t.updated_at &&
          new Date(t.updated_at) >= weekStart &&
          new Date(t.updated_at) <= weekEnd
        ).length;

        throughput.push({
          week: `W${8 - w}`,
          count,
          label: weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        });
      }

      // ── Sprint velocity ──────────────────────────────────────────────
      const velocity = sprints.slice(-6).map(s => {
        const sprintTasks = tasks.filter(t => t.sprint_id === s.id);
        return {
          name:      s.name,
          planned:   sprintTasks.length,
          completed: sprintTasks.filter(t => t.status === "done").length,
        };
      });

      // ── Priority distribution ────────────────────────────────────────
      const priorityCounts = ["critical", "high", "medium", "low"].map(p => ({
        priority: p,
        count: tasks.filter(t => t.priority === p && t.status !== "done").length,
      }));

      // ── Type distribution ────────────────────────────────────────────
      const types = {};
      tasks.filter(t => t.status !== "done").forEach(t => {
        types[t.type || "task"] = (types[t.type || "task"] || 0) + 1;
      });

      // ── Trend: completion rate over last 7 days ─────────────────────
      const trend = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        d.setHours(23, 59, 59, 999);
        const totalByDay = tasks.filter(t => new Date(t.created_at) <= d).length;
        const doneByDay  = tasks.filter(t =>
          t.status === "done" && new Date(t.updated_at) <= d
        ).length;
        return totalByDay > 0 ? Math.round((doneByDay / totalByDay) * 100) : 0;
      });

      setData({
        total, done, inProgress, overdue, unassigned, completionRate, avgDays,
        throughput, velocity, priorityCounts, types, trend,
      });
    }).catch(() => {}).finally(() => setLoading(false));
  }, [workspaceId]);

  if (!workspaceId) return null;

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#64748b", padding: "32px 0" }}>
        <div className="spinner" style={{ width: 22, height: 22 }} />
        <span>Building analytics…</span>
      </div>
    );
  }

  if (!data) return null;

  const PRIORITY_COLOR = { critical: "#dc2626", high: "#ef4444", medium: "#f59e0b", low: "#10b981" };

  return (
    <div className="analytics-page">
      {/* KPI strip */}
      <div className="analytics-kpis">
        {[
          { label: "Total Tasks",       val: data.total,           color: "#6366f1" },
          { label: "Completed",         val: data.done,            color: "#10b981" },
          { label: "Completion Rate",   val: `${data.completionRate}%`, color: data.completionRate >= 70 ? "#10b981" : "#f59e0b" },
          { label: "In Progress",       val: data.inProgress,      color: "#6366f1" },
          { label: "Overdue",           val: data.overdue,         color: data.overdue > 0 ? "#dc2626" : "#10b981" },
          { label: "Unassigned",        val: data.unassigned,      color: data.unassigned > 0 ? "#f59e0b" : "#10b981" },
          ...(data.avgDays !== null ? [{ label: "Avg Days/Task", val: `${data.avgDays}d`, color: "#64748b" }] : []),
        ].map(k => (
          <div key={k.label} className="analytics-kpi">
            <div className="analytics-kpi-val" style={{ color: k.color }}>{k.val}</div>
            <div className="analytics-kpi-label">{k.label}</div>
            {k.label === "Completion Rate" && (
              <Sparkline data={data.trend} color={k.color} height={24} width={60} />
            )}
          </div>
        ))}
      </div>

      <div className="analytics-grid">
        {/* Throughput */}
        <div className="analytics-card">
          <div className="analytics-card-title">Weekly Throughput</div>
          <div className="analytics-card-sub">Tasks completed per week</div>
          <ThroughputChart data={data.throughput} />
        </div>

        {/* Sprint velocity */}
        <div className="analytics-card">
          <div className="analytics-card-title">Sprint Velocity</div>
          <div className="analytics-card-sub">Planned vs completed per sprint</div>
          <VelocityChart data={data.velocity} />
        </div>

        {/* Priority breakdown */}
        <div className="analytics-card">
          <div className="analytics-card-title">Open Tasks by Priority</div>
          <div className="analytics-card-sub">Distribution of active work</div>
          <div className="analytics-priority-list">
            {data.priorityCounts.map(p => {
              const max = Math.max(...data.priorityCounts.map(x => x.count), 1);
              return (
                <div key={p.priority} className="analytics-priority-row">
                  <span className="analytics-priority-label" style={{ color: PRIORITY_COLOR[p.priority] }}>
                    {p.priority}
                  </span>
                  <div className="analytics-priority-bar-wrap">
                    <div
                      className="analytics-priority-bar"
                      style={{
                        width: `${(p.count / max) * 100}%`,
                        background: PRIORITY_COLOR[p.priority],
                      }}
                    />
                  </div>
                  <span className="analytics-priority-count">{p.count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Task type breakdown */}
        <div className="analytics-card">
          <div className="analytics-card-title">Open Tasks by Type</div>
          <div className="analytics-card-sub">Active work distribution</div>
          <div className="analytics-type-list">
            {Object.entries(data.types).sort((a, b) => b[1] - a[1]).map(([type, count]) => {
              const total = Object.values(data.types).reduce((s, v) => s + v, 0) || 1;
              const pct   = Math.round((count / total) * 100);
              return (
                <div key={type} className="analytics-type-row">
                  <span className="analytics-type-label">{type}</span>
                  <div className="analytics-type-bar-wrap">
                    <div className="analytics-type-bar" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="analytics-type-pct">{pct}%</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
