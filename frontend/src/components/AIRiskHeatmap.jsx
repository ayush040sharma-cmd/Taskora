import { useState, useEffect, useCallback } from "react";
import api from "../api/api";
import "../styles/airisk.css";

// Semantic risk levels using design tokens
const RISK_META = {
  critical: { color: "var(--tk-status-danger)", bg: "var(--tk-status-danger-bg)", label: "Critical" },
  high:     { color: "var(--tk-status-danger)", bg: "var(--tk-status-danger-bg)", label: "High" },
  medium:   { color: "var(--tk-status-warn)",   bg: "var(--tk-status-warn-bg)",   label: "Medium" },
  low:      { color: "var(--tk-status-ok)",     bg: "var(--tk-status-ok-bg)",     label: "Low" },
};

// Actual hex for SVG strokes (error icon)
const HC_DANGER = "#EF4444";

const PRIORITY_COLOR_DOT = { critical: "#EF4444", high: "#F97316", medium: "#F59E0B", low: "#22C55E" };
const PriorityDot = ({ priority }) => (
  <span
    style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: PRIORITY_COLOR_DOT[priority] || "#94A3B8", flexShrink: 0 }}
    title={priority ? `${priority} priority` : undefined}
  />
);

function RiskScoreBar({ score }) {
  const color =
    score >= 75 ? "var(--tk-status-danger)" :
    score >= 50 ? "var(--tk-status-danger)" :
    score >= 25 ? "var(--tk-status-warn)"   : "var(--tk-status-ok)";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div className="tk-progress-track" style={{ flex: 1 }}>
        <div style={{ width: `${score}%`, height: "100%", background: color, borderRadius: 4, transition: "width 0.6s" }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color, minWidth: 28 }}>{score}</span>
    </div>
  );
}

function AITaskCard({ task, onAnalyze }) {
  const [loading, setLoading] = useState(false);
  const [pred,    setPred]    = useState(null);

  const riskLevel = pred?.risk_level || (
    task.risk_score >= 75 ? "critical" :
    task.risk_score >= 50 ? "high"     :
    task.risk_score >= 25 ? "medium"   : "low"
  );
  const meta = RISK_META[riskLevel];

  const analyze = async () => {
    setLoading(true);
    try {
      const res = await api.post(`/ai/predict/${task.id}`);
      setPred(res.data);
      onAnalyze?.(task.id, res.data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  const score       = pred?.risk_score ?? task.risk_score ?? 0;
  const suggestions = pred?.suggestions || (task.ai_suggestion ? [task.ai_suggestion] : []);
  const reasoning   = pred?.reasoning || null;
  const delay       = pred?.delay_probability ?? task.delay_probability;
  const confidence  = pred?.confidence_score  ?? task.confidence_score;

  const delayColor = delay > 0.6 ? "var(--tk-status-danger)"
                   : delay > 0.3 ? "var(--tk-status-warn)"
                   : "var(--tk-status-ok)";

  const isOverdue = task.due_date && new Date(task.due_date) < new Date();

  return (
    <div
      className="tk-card-ai ai-task-card"
      style={{ borderLeftColor: meta.color }}
    >
      <div className="tk-card-ai__glow" style={{ background: meta.color }} />

      {/* Header */}
      <div className="ai-tc-header">
        <div className="ai-tc-title-row">
          <span className="ai-tc-priority"><PriorityDot priority={task.priority} /></span>
          <span className="ai-tc-title">{task.title}</span>
          <span className="ai-tc-badge" style={{ background: meta.color }}>{meta.label}</span>
        </div>
        <div className="ai-tc-meta">
          <span>{task.assignee_name || "Unassigned"}</span>
          {task.due_date && (
            <span style={{ color: isOverdue ? "var(--tk-status-danger)" : "var(--tk-text-muted)" }}>
              Due {new Date(task.due_date).toLocaleDateString()}
            </span>
          )}
          <span style={{ textTransform: "capitalize" }}>{task.status}</span>
        </div>
      </div>

      {/* Risk score bar */}
      <div className="ai-tc-section">
        <div className="ai-tc-label">Risk Score</div>
        <RiskScoreBar score={score} />
      </div>

      {/* Delay probability */}
      {delay != null && (
        <div className="ai-tc-row">
          <span className="ai-tc-label">Delay probability</span>
          <span style={{ fontWeight: 700, color: delayColor }}>{Math.round(delay * 100)}%</span>
        </div>
      )}

      {/* Confidence */}
      {confidence != null && (
        <div className="ai-tc-row">
          <span className="ai-tc-label">Confidence</span>
          <span style={{ color: "var(--tk-text-secondary)" }}>{Math.round(confidence * 100)}%</span>
        </div>
      )}

      {/* Reasoning */}
      {reasoning && reasoning !== "No significant risk factors detected" && (
        <div className="ai-tc-reasoning">
          {reasoning.split(" | ").map((r, i) => (
            <div key={i} className="ai-tc-reason-item">· {r}</div>
          ))}
        </div>
      )}

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="ai-tc-suggestions">
          {suggestions.map((s, i) => (
            <div key={i} className="ai-tc-suggestion">→ {s}</div>
          ))}
        </div>
      )}

      {/* Refresh button */}
      <button
        className="ai-tc-analyze-btn"
        onClick={analyze}
        disabled={loading}
        style={{ borderColor: meta.color, color: meta.color }}
      >
        {loading ? "Analyzing…" : "⚡ Refresh prediction"}
      </button>
    </div>
  );
}

// ── Risk Heatmap grid ─────────────────────────────────────────────────────────
function RiskHeatmap({ tasks }) {
  const priorities = ["critical", "high", "medium", "low"];
  const levels     = ["critical", "high", "medium", "low"];

  const cell = (priority, level) =>
    tasks.filter(t => t.priority === priority && (
      (t.risk_score >= 75             && level === "critical") ||
      (t.risk_score >= 50 && t.risk_score < 75 && level === "high")     ||
      (t.risk_score >= 25 && t.risk_score < 50 && level === "medium")   ||
      (t.risk_score  < 25             && level === "low")
    ));

  const cellClass = (p, l, count) => {
    if (count === 0) return "risk-hm-cell tk-heatcell tk-heatcell--empty";
    const isCritical = (p === "critical" || p === "high") && (l === "critical" || l === "high");
    if (isCritical || l === "critical") return "risk-hm-cell tk-heatcell tk-heatcell--over";
    if (l === "high" || l === "medium") return "risk-hm-cell tk-heatcell tk-heatcell--warn";
    return "risk-hm-cell tk-heatcell tk-heatcell--ok";
  };

  return (
    <div className="risk-heatmap">
      <div className="risk-heatmap-title">Risk Heatmap — Priority vs Risk Level</div>
      <div className="risk-heatmap-grid">
        {/* Column headers */}
        <div />
        {levels.map(l => (
          <div key={l} className="risk-hm-col-header" style={{ color: RISK_META[l].color }}>
            {RISK_META[l].label} Risk
          </div>
        ))}
        {/* Rows */}
        {priorities.map(p => (
          <div key={p} style={{ display: "contents" }}>
            <div className="risk-hm-row-header">
              <PriorityDot priority={p} /> {p}
            </div>
            {levels.map(l => {
              const items = cell(p, l);
              return (
                <div key={`${p}-${l}`} className={cellClass(p, l, items.length)}>
                  {items.length > 0 && (
                    <>
                      <div className="risk-hm-count">{items.length}</div>
                      <div className="risk-hm-label">task{items.length !== 1 ? "s" : ""}</div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function AIRiskHeatmap({ workspaceId }) {
  const [predictions, setPredictions] = useState([]);
  const [tasks,       setTasks]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [loadError,   setLoadError]   = useState(false);
  const [running,     setRunning]     = useState(false);
  const [filter,      setFilter]      = useState("all");

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true); setLoadError(false);
    try {
      const tasksRes = await api.get(`/tasks/workspace/${workspaceId}`);
      const taskList = tasksRes.data.filter(t => t.status !== "done");
      setTasks(taskList);

      let predMap = {};
      try {
        const alertsRes = await api.get(`/ai/alerts/${workspaceId}`);
        alertsRes.data?.predictions?.forEach(p => { predMap[p.task_id] = p; });
      } catch { /* best-effort — use risk_score already on each task */ }

      setPredictions(taskList.map(t => ({ ...t, ...(predMap[t.id] || {}) })));
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { load(); }, [load]);

  const runAnalysis = async () => {
    setRunning(true);
    try {
      const res = await api.post(`/ai/analyze/${workspaceId}`);
      const predMap = {};
      res.data.predictions?.forEach(p => { predMap[p.task_id] = p; });
      setPredictions(prev => prev.map(t => ({ ...t, ...(predMap[t.id] || {}) })));
    } catch { /* ignore */ }
    finally { setRunning(false); }
  };

  const handleSingleAnalyze = (taskId, pred) => {
    setPredictions(prev => prev.map(t =>
      t.id === taskId ? { ...t, ...pred, risk_score: pred.risk_score } : t
    ));
  };

  const filtered = filter === "all" ? predictions : predictions.filter(t => {
    const score = t.risk_score ?? 0;
    if (filter === "critical") return score >= 75;
    if (filter === "high")     return score >= 50 && score < 75;
    if (filter === "medium")   return score >= 25 && score < 50;
    if (filter === "low")      return score < 25;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => (b.risk_score ?? 0) - (a.risk_score ?? 0));

  const counts = {
    critical: predictions.filter(t => (t.risk_score ?? 0) >= 75).length,
    high:     predictions.filter(t => (t.risk_score ?? 0) >= 50 && (t.risk_score ?? 0) < 75).length,
    medium:   predictions.filter(t => (t.risk_score ?? 0) >= 25 && (t.risk_score ?? 0) < 50).length,
    low:      predictions.filter(t => (t.risk_score ?? 0) < 25).length,
  };

  if (!workspaceId) return null;

  return (
    <div className="ai-heatmap-page">
      {/* Toolbar */}
      <div className="ai-hm-toolbar">
        <div className="ai-hm-filters">
          {["all", "critical", "high", "medium", "low"].map(f => (
            <button
              key={f}
              className={`ai-hm-filter-btn ${filter === f ? "active" : ""}`}
              style={filter === f && f !== "all" ? {
                background: RISK_META[f]?.color,
                color: "#fff",
                borderColor: RISK_META[f]?.color,
              } : {}}
              onClick={() => setFilter(f)}
            >
              {f === "all" ? `All (${predictions.length})` : `${RISK_META[f].label} (${counts[f]})`}
            </button>
          ))}
        </div>
        <button className="tk-btn-primary" onClick={runAnalysis} disabled={running || loading}
          style={{ fontSize: 13, opacity: (running || loading) ? 0.6 : 1 }}>
          {running ? "⏳ Analyzing…" : "⚡ Analyze all"}
        </button>
      </div>

      {/* Heatmap */}
      {tasks.length > 0 && <RiskHeatmap tasks={predictions} />}

      {/* Task cards */}
      {loading ? (
        <div className="ai-hm-loading">
          <div className="ai-hm-spinner" />
          <span>Loading AI predictions…</span>
        </div>
      ) : loadError ? (
        <div className="ai-hm-empty" style={{ color: "var(--tk-status-danger)" }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={HC_DANGER} strokeWidth="1.5" style={{ marginBottom: 8 }}>
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <div>Could not load tasks. Check your connection and try again.</div>
          <button className="tk-btn-secondary" style={{ marginTop: 12, fontSize: 13 }} onClick={load}>Retry</button>
        </div>
      ) : sorted.length === 0 ? (
        <div className="ai-hm-empty">
          {filter === "all" ? (
            <>
              <div style={{ fontSize: 36, marginBottom: 8 }}>🤖</div>
              <div>No active tasks found.</div>
              <div style={{ fontSize: 12, color: "var(--tk-text-muted)", marginTop: 4 }}>
                Create tasks on the Board, then click <strong>⚡ Analyze all</strong> to generate predictions.
              </div>
            </>
          ) : `No ${filter}-risk tasks.`}
        </div>
      ) : (
        <div className="ai-task-cards-grid">
          {sorted.map(task => (
            <AITaskCard key={task.id} task={task} onAnalyze={handleSingleAnalyze} />
          ))}
        </div>
      )}
    </div>
  );
}
