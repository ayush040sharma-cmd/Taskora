import { useState, useEffect } from "react";
import api from "../api/api";
import CommandCenter from "./CommandCenter";

// ── Mini sparkline SVG ────────────────────────────────────────────────────────
function Sparkline({ data, color = "#3B82F6", height = 40, width = 120 }) {
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
              <rect x={x} y={H - planned} width={BAR_W} height={planned} rx={3} fill="var(--border)" />
              <text x={x + BAR_W / 2} y={H - planned - 3} textAnchor="middle" fontSize={9} fill="var(--text-secondary)">
                {s.planned}
              </text>
              {/* Completed bar */}
              <rect x={x + BAR_W + 4} y={H - done} width={BAR_W} height={done} rx={3} fill="#3B82F6" />
              <text x={x + BAR_W + 4 + BAR_W / 2} y={H - done - 3} textAnchor="middle" fontSize={9} fill="#3B82F6" fontWeight={700}>
                {s.completed}
              </text>
              {/* Sprint label */}
              <text x={x + BAR_W} y={H + 16} textAnchor="middle" fontSize={9} fill="var(--text-secondary)">
                {(s.name || `S${i + 1}`).slice(0, 8)}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="velocity-legend">
        <span><span className="vl-dot" style={{ background: "var(--border)" }} />Planned</span>
        <span><span className="vl-dot" style={{ background: "#3B82F6" }} />Completed</span>
      </div>
    </div>
  );
}

// ── Throughput line chart (tasks completed per week) ─────────────────────────
function ThroughputChart({ data }) {
  if (!data || data.length === 0) return <div className="analytics-empty">No throughput data yet.</div>;
  if (data.length === 1) return <div className="analytics-empty">Not enough data yet — check back next week.</div>;
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
            <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.15} />
            <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
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
          fill="none" stroke="#3B82F6" strokeWidth={2}
          strokeLinecap="round" strokeLinejoin="round"
        />
        {/* Dots */}
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={3} fill="#3B82F6" />
        ))}
        {/* X labels — show first/last/middle */}
        {pts.filter((_, i) => i === 0 || i === pts.length - 1 || i === Math.floor(pts.length / 2))
          .map((p, i) => (
            <text key={i} x={p.x} y={H + 20} textAnchor="middle" fontSize={9} fill="var(--text-secondary)">
              {p.week || `W${i + 1}`}
            </text>
          ))}
      </svg>
    </div>
  );
}

export default function AnalyticsDashboard({ workspaceId, onNavigate, onOpenDetail, tasks = [] }) {
  const [activeTab, setActiveTab] = useState("overview");
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    if (!workspaceId) return;
    setLoading(true);
    setFetchError(false);

    // Fetch pre-aggregated analytics from server (avoids iterating full task list client-side)
    // and sprint velocity (needs sprint membership per task, kept client-side for now)
    Promise.all([
      api.get(`/analytics/${workspaceId}`),
      api.get(`/sprints?workspace_id=${workspaceId}`).catch(() => ({ data: [] })),
    ]).then(([analyticsRes, sprintsRes]) => {
      const agg     = analyticsRes.data;
      const sprints = sprintsRes.data;

      // Sprint velocity still computed client-side (needs sprint_id per task)
      const velocity = sprints.slice(-6).map(s => {
        const sprintTasks = tasks.filter(t => t.sprint_id === s.id);
        return {
          name:      s.name,
          planned:   sprintTasks.length,
          completed: sprintTasks.filter(t => t.status === "done").length,
        };
      });

      setData({ ...agg, velocity });
    }).catch(() => { setFetchError(true); }).finally(() => setLoading(false));
  }, [workspaceId]);

  if (!workspaceId) return null;

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--text-secondary)", padding: "32px 0" }}>
        <div className="spinner" style={{ width: 22, height: 22 }} />
        <span>Building analytics…</span>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div style={{ textAlign: "center", padding: "48px 0", color: "var(--text-secondary)" }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Could not load analytics</div>
        <div style={{ fontSize: 13 }}>Check your connection and refresh the page.</div>
      </div>
    );
  }

  if (!data) return null;

  const PRIORITY_COLOR = { critical: "var(--tk-status-danger, #EF4444)", high: "var(--tk-status-danger, #EF4444)", medium: "var(--tk-status-warn, #F59E0B)", low: "var(--tk-status-ok, #22C55E)" };

  const TABS = [
    { id: "overview",        label: "Overview" },
    { id: "command-center",  label: "Command Center" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {/* Tab bar */}
      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--tk-border, #DFE1E6)", marginBottom: 20, flexShrink: 0 }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              position: "relative",
              padding: "10px 20px", fontSize: 13, fontWeight: activeTab === t.id ? 700 : 500,
              background: "none", border: "none", cursor: "pointer",
              color: activeTab === t.id ? "var(--tk-accent, #3B82F6)" : "var(--text-secondary)",
              marginBottom: -1,
            }}
          >
            {t.label}
            {activeTab === t.id && (
              <span style={{
                position: "absolute", bottom: 0, left: 0, right: 0, height: 2,
                background: "var(--tk-gradient, linear-gradient(90deg, #3B82F6, #06B6D4))",
                borderRadius: "2px 2px 0 0",
              }} />
            )}
          </button>
        ))}
      </div>

      {/* Command Center tab */}
      {activeTab === "command-center" && (
        <CommandCenter workspaceId={workspaceId} onNavigate={onNavigate} onOpenDetail={onOpenDetail} tasks={tasks} />
      )}

      {/* Overview tab */}
      {activeTab === "overview" && (
    <div className="analytics-page">
      {/* KPI strip */}
      <div className="analytics-kpis">
        {[
          { label: "Total Tasks",       val: data.total,           color: "var(--tk-accent, #3B82F6)" },
          { label: "Completed",         val: data.done,            color: "var(--tk-status-ok, #22C55E)" },
          { label: "Completion Rate",   val: `${data.completionRate}%`, color: data.completionRate >= 70 ? "var(--tk-status-ok, #22C55E)" : "var(--tk-status-warn, #F59E0B)" },
          { label: "In Progress",       val: data.inProgress,      color: "var(--tk-accent, #3B82F6)" },
          { label: "Overdue",           val: data.overdue,         color: data.overdue > 0 ? "var(--tk-status-danger, #EF4444)" : "var(--tk-status-ok, #22C55E)" },
          { label: "Unassigned",        val: data.unassigned,      color: data.unassigned > 0 ? "var(--tk-status-warn, #F59E0B)" : "var(--tk-status-ok, #22C55E)" },
          ...(data.avgDays !== null ? [{ label: "Avg Days/Task", val: `${data.avgDays}d`, color: "var(--text-secondary)" }] : []),
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
      )}
    </div>
  );
}
