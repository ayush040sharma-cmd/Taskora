import { useState, useEffect, useCallback } from "react";
import api from "../api/api";

const RISK_META = {
  critical: { color: "#dc2626", bg: "#fef2f2", border: "#fca5a5", label: "Critical" },
  high:     { color: "#ef4444", bg: "#fff1f1", border: "#fca5a5", label: "High" },
  medium:   { color: "#f59e0b", bg: "#fffbeb", border: "#fde68a", label: "Medium" },
  low:      { color: "#10b981", bg: "#f0fdf4", border: "#6ee7b7", label: "Low" },
};

const PRIORITY_DOT = { critical: "🔴", high: "🟠", medium: "🟡", low: "🟢" };

function RiskScoreBar({ score }) {
  const color =
    score >= 75 ? "#dc2626" :
    score >= 50 ? "#ef4444" :
    score >= 25 ? "#f59e0b" : "#10b981";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{
        flex: 1, height: 6, background: "#f1f5f9", borderRadius: 99, overflow: "hidden",
      }}>
        <div style={{
          width: `${score}%`, height: "100%", background: color,
          borderRadius: 99, transition: "width 0.6s",
        }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color, minWidth: 28 }}>{score}</span>
    </div>
  );
}

function AITaskCard({ task, onAnalyze }) {
  const [loading, setLoading] = useState(false);
  const [pred, setPred]       = useState(null);
  const riskLevel = pred?.risk_level || (
    task.risk_score >= 75 ? "critical" :
    task.risk_score >= 50 ? "high" :
    task.risk_score >= 25 ? "medium" : "low"
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

  const score = pred?.risk_score ?? task.risk_score ?? 0;
  const suggestions = pred?.suggestions || (task.ai_suggestion ? [task.ai_suggestion] : []);
  const reasoning   = pred?.reasoning || null;
  const delay       = pred?.delay_probability ?? task.delay_probability;
  const confidence  = pred?.confidence_score  ?? task.confidence_score;

  return (
    <div className="ai-task-card" style={{ borderColor: meta.border, background: meta.bg }}>
      {/* Header */}
      <div className="ai-tc-header">
        <div className="ai-tc-title-row">
          <span className="ai-tc-priority">{PRIORITY_DOT[task.priority] || "⚪"}</span>
          <span className="ai-tc-title">{task.title}</span>
          <span className="ai-tc-badge" style={{ background: meta.color }}>{meta.label}</span>
        </div>
        <div className="ai-tc-meta">
          <span>{task.assignee_name || "Unassigned"}</span>
          {task.due_date && (
            <span style={{ color: new Date(task.due_date) < new Date() ? "#dc2626" : "#64748b" }}>
              Due {new Date(task.due_date).toLocaleDateString()}
            </span>
          )}
          <span style={{ color: "#64748b", textTransform: "capitalize" }}>{task.status}</span>
        </div>
      </div>

      {/* Risk bar */}
      <div className="ai-tc-section">
        <div className="ai-tc-label">Risk Score</div>
        <RiskScoreBar score={score} />
      </div>

      {/* Delay probability */}
      {delay !== null && delay !== undefined && (
        <div className="ai-tc-row">
          <span className="ai-tc-label">Delay probability</span>
          <span style={{ fontWeight: 700, color: delay > 0.6 ? "#dc2626" : delay > 0.3 ? "#f59e0b" : "#10b981" }}>
            {Math.round(delay * 100)}%
          </span>
        </div>
      )}

      {confidence !== null && confidence !== undefined && (
        <div className="ai-tc-row">
          <span className="ai-tc-label">Confidence</span>
          <span style={{ color: "#64748b" }}>{Math.round(confidence * 100)}%</span>
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

      {/* Analyze button */}
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
  // Group tasks into a 4x? matrix by (priority row, risk_level col)
  const priorities = ["critical", "high", "medium", "low"];
  const levels     = ["critical", "high", "medium", "low"];

  const cell = (priority, level) =>
    tasks.filter(t => t.priority === priority && (
      (t.risk_score >= 75 && level === "critical") ||
      (t.risk_score >= 50 && t.risk_score < 75 && level === "high") ||
      (t.risk_score >= 25 && t.risk_score < 50 && level === "medium") ||
      (t.risk_score < 25 && level === "low")
    ));

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
          <>
            <div key={`row-${p}`} className="risk-hm-row-header">
              {PRIORITY_DOT[p]} {p}
            </div>
            {levels.map(l => {
              const items = cell(p, l);
              const intensity = Math.min(1, items.length / 3);
              const bg =
                items.length === 0 ? "#f8fafc" :
                (p === "critical" || p === "high") && (l === "critical" || l === "high")
                  ? `rgba(220,38,38,${0.1 + intensity * 0.5})`
                  : `rgba(245,158,11,${0.1 + intensity * 0.4})`;

              return (
                <div key={`${p}-${l}`} className="risk-hm-cell" style={{ background: bg }}>
                  {items.length > 0 && (
                    <>
                      <div className="risk-hm-count">{items.length}</div>
                      <div className="risk-hm-label">task{items.length !== 1 ? "s" : ""}</div>
                    </>
                  )}
                </div>
              );
            })}
          </>
        ))}
      </div>
    </div>
  );
}

export default function AIRiskHeatmap({ workspaceId }) {
  const [predictions, setPredictions] = useState([]);
  const [tasks, setTasks]             = useState([]);
  const [loading, setLoading]         = useState(true);
  const [running, setRunning]         = useState(false);
  const [filter, setFilter]           = useState("all"); // all | critical | high | medium | low

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const [tasksRes, alertsRes] = await Promise.all([
        api.get(`/tasks/workspace/${workspaceId}`),
        api.get(`/ai/alerts/${workspaceId}`),
      ]);
      const taskList = tasksRes.data.filter(t => t.status !== "done");
      setTasks(taskList);

      // Merge AI prediction data
      const predMap = {};
      alertsRes.data?.predictions?.forEach(p => { predMap[p.task_id] = p; });
      setPredictions(taskList.map(t => ({ ...t, ...(predMap[t.id] || {}) })));
    } catch { /* ignore */ }
    finally { setLoading(false); }
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

  // Sort by risk score desc
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
        <button className="btn-primary ai-hm-analyze-btn" onClick={runAnalysis} disabled={running || loading}>
          {running ? "⏳ Analyzing…" : "⚡ Analyze all"}
        </button>
      </div>

      {/* Risk heatmap matrix */}
      {tasks.length > 0 && <RiskHeatmap tasks={predictions} />}

      {/* Task cards */}
      {loading ? (
        <div className="ai-hm-loading">
          <div className="spinner" style={{ width: 24, height: 24 }} />
          <span>Loading AI predictions…</span>
        </div>
      ) : sorted.length === 0 ? (
        <div className="ai-hm-empty">
          {filter === "all"
            ? "No active tasks. Create tasks to see AI risk predictions."
            : `No ${filter}-risk tasks.`}
        </div>
      ) : (
        <div className="ai-task-cards-grid">
          {sorted.map(task => (
            <AITaskCard
              key={task.id}
              task={task}
              onAnalyze={handleSingleAnalyze}
            />
          ))}
        </div>
      )}
    </div>
  );
}
