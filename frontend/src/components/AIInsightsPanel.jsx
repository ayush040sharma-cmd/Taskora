import { useState, useEffect, useCallback } from "react";
import api from "../api/api";

const SEVERITY_META = {
  critical: { color: "#dc2626", bg: "#fef2f2", icon: "🚨" },
  high:     { color: "#ef4444", bg: "#fef2f2", icon: "⚠️" },
  medium:   { color: "#f59e0b", bg: "#fffbeb", icon: "⚡" },
  low:      { color: "#10b981", bg: "#f0fdf4", icon: "💡" },
};

const RISK_COLORS = {
  critical: "#dc2626",
  high:     "#ef4444",
  medium:   "#f59e0b",
  low:      "#10b981",
};

function HealthGauge({ score }) {
  const color =
    score >= 80 ? "#10b981" :
    score >= 60 ? "#f59e0b" :
    score >= 40 ? "#ef4444" : "#dc2626";

  // SVG arc gauge
  const r = 42;
  const cx = 56, cy = 56;
  const circumference = Math.PI * r; // half circle
  const filled = (score / 100) * circumference;

  return (
    <div className="ai-health-gauge">
      <svg width="112" height="64" viewBox="0 0 112 64">
        {/* Background arc */}
        <path
          d={`M14,56 A${r},${r} 0 0,1 98,56`}
          fill="none" stroke="#e2e8f0" strokeWidth="10" strokeLinecap="round"
        />
        {/* Filled arc */}
        <path
          d={`M14,56 A${r},${r} 0 0,1 98,56`}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
          style={{ transition: "stroke-dasharray 0.8s ease" }}
        />
        {/* Score text */}
        <text x="56" y="52" textAnchor="middle" fill={color} fontSize="20" fontWeight="800">
          {score}
        </text>
      </svg>
      <div className="ai-health-label" style={{ color }}>
        {score >= 80 ? "On track" :
         score >= 60 ? "Needs attention" :
         score >= 40 ? "At risk" : "Critical"}
      </div>
    </div>
  );
}

export default function AIInsightsPanel({ workspaceId }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const loadAlerts = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const res = await api.get(`/ai/alerts/${workspaceId}`);
      setData(res.data);
    } catch {
      // Silently fail — AI panel is non-blocking
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { loadAlerts(); }, [loadAlerts]);

  const runFullAnalysis = async () => {
    setRunning(true);
    try {
      const res = await api.post(`/ai/analyze/${workspaceId}`);
      setData({
        alerts:       res.data.alerts,
        health:       res.data.health,
        team_stress:  res.data.team_stress,
        at_risk_count: res.data.health.at_risk_count,
      });
    } catch {
      // ignore
    } finally {
      setRunning(false);
    }
  };

  if (!workspaceId) return null;

  const stressColor =
    data?.team_stress?.stress_score > 70 ? "#ef4444" :
    data?.team_stress?.stress_score > 40 ? "#f59e0b" : "#10b981";

  return (
    <div className="ai-panel">
      {/* Header */}
      <div className="ai-panel-header" onClick={() => setExpanded(v => !v)}>
        <div className="ai-panel-title">
          <span className="ai-pulse" />
          <span>AI Execution Brain</span>
          {data?.at_risk_count > 0 && (
            <span className="ai-badge-count">{data.at_risk_count} at risk</span>
          )}
        </div>
        <div className="ai-panel-actions">
          <button
            className="ai-refresh-btn"
            onClick={e => { e.stopPropagation(); runFullAnalysis(); }}
            disabled={running}
            title="Run full AI analysis"
          >
            {running ? "⏳ Analyzing…" : "⚡ Analyze now"}
          </button>
          <span className="ai-chevron">{expanded ? "▲" : "▼"}</span>
        </div>
      </div>

      {expanded && (
        <div className="ai-panel-body">
          {loading ? (
            <div className="ai-loading">
              <div className="spinner" style={{ width: 20, height: 20 }} />
              <span>Loading insights…</span>
            </div>
          ) : !data ? (
            <div className="ai-empty">
              No predictions available yet.{" "}
              <button className="ai-refresh-btn" onClick={runFullAnalysis}>Run analysis</button>
            </div>
          ) : (
            <>
              {/* Metrics strip */}
              <div className="ai-metrics">
                {/* Health gauge */}
                {data.health && (
                  <div className="ai-metric-card">
                    <HealthGauge score={data.health.health_score} />
                    <div className="ai-metric-label">Project Health</div>
                  </div>
                )}

                {/* Team stress */}
                {data.team_stress && (
                  <div className="ai-metric-card">
                    <div className="ai-metric-num" style={{ color: stressColor }}>
                      {data.team_stress.stress_score}
                    </div>
                    <div className="ai-metric-sub" style={{ color: stressColor }}>
                      {data.team_stress.overloaded_count > 0
                        ? `${data.team_stress.overloaded_count} overloaded`
                        : "Team OK"}
                    </div>
                    <div className="ai-metric-label">Team Stress</div>
                  </div>
                )}

                {/* At-risk tasks */}
                {data.health && (
                  <div className="ai-metric-card">
                    <div className="ai-metric-num" style={{ color: data.health.at_risk_count > 0 ? "#ef4444" : "#10b981" }}>
                      {data.health.at_risk_count}
                    </div>
                    <div className="ai-metric-sub">{data.health.overdue_count || 0} overdue</div>
                    <div className="ai-metric-label">At Risk</div>
                  </div>
                )}
              </div>

              {/* Alerts */}
              {data.alerts && data.alerts.length > 0 && (
                <div className="ai-alerts">
                  <div className="ai-alerts-title">Prescriptive Alerts</div>
                  {data.alerts.map((alert, i) => {
                    const meta = SEVERITY_META[alert.severity] || SEVERITY_META.low;
                    return (
                      <div
                        key={i}
                        className="ai-alert-row"
                        style={{ background: meta.bg, borderLeft: `3px solid ${meta.color}` }}
                      >
                        <span className="ai-alert-icon">{meta.icon}</span>
                        <div className="ai-alert-body">
                          <div className="ai-alert-msg" style={{ color: meta.color }}>
                            {alert.message}
                          </div>
                          <div className="ai-alert-action">→ {alert.action}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {data.alerts && data.alerts.length === 0 && (
                <div className="ai-all-good">
                  ✅ No critical alerts — your project looks healthy!
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
