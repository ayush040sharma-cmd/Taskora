/**
 * What-If Simulation Modal
 * Shows the impact of assigning a task to a user before committing.
 * Fetches suggestions and lets manager pick best candidate.
 */
import { useState, useEffect } from "react";
import api from "../api/api";

const RISK_COLOR  = { low: "#10b981", medium: "#f59e0b", high: "#ef4444" };
const RISK_LABEL  = { low: "Low risk",  medium: "Medium risk", high: "High risk" };
const STATUS_COLOR = { available: "#10b981", moderate: "#f59e0b", overloaded: "#ef4444", on_leave: "#94a3b8" };

function LoadBar({ pct, label, color }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {label && <span style={{ fontSize: 11, color: "#64748b" }}>{label}</span>}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1, height: 8, background: "#f1f5f9", borderRadius: 99, overflow: "hidden" }}>
          <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: color || "#6366f1", borderRadius: 99, transition: "width 0.4s" }} />
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color, minWidth: 36 }}>{pct}%</span>
      </div>
    </div>
  );
}

export default function SimulationModal({ task, workspaceId, onClose, onAssign }) {
  const [suggestions, setSuggestions] = useState([]);
  const [selected,    setSelected]    = useState(null);
  const [simResult,   setSimResult]   = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [simLoading,  setSimLoading]  = useState(false);
  const [justification, setJustification] = useState("");
  const [tab, setTab] = useState("suggest"); // suggest | simulate

  useEffect(() => {
    setLoading(true);
    api.get(`/simulate/suggest/${workspaceId}/${task.id}`)
      .then(r => setSuggestions(r.data.suggestions || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [task.id, workspaceId]);

  const runSimulation = async (userId) => {
    setSelected(userId);
    setSimLoading(true);
    setSimResult(null);
    try {
      const { data } = await api.post("/simulate/assign", {
        task_id:      task.id,
        user_id:      userId,
        workspace_id: workspaceId,
      });
      setSimResult(data);
      setTab("simulate");
    } catch (err) {
      console.error(err);
    } finally {
      setSimLoading(false);
    }
  };

  const handleAssign = () => {
    if (!selected) return;
    onAssign({ user_id: selected, justification, override: simResult?.simulation?.canOverride && !simResult?.simulation?.feasible });
  };

  const sim = simResult?.simulation;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="sim-modal" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="modal-header" style={{ padding: "20px 24px 0" }}>
          <div>
            <h2 className="modal-title">What-If Simulation</h2>
            <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>
              Assign: <strong>"{task.title}"</strong>
              {task.type && <span className="sim-type-pill">{task.type}</span>}
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Tabs */}
        <div className="sim-tabs">
          <button className={`sim-tab ${tab === "suggest" ? "sim-tab--active" : ""}`} onClick={() => setTab("suggest")}>
            Suggestions
          </button>
          <button
            className={`sim-tab ${tab === "simulate" ? "sim-tab--active" : ""}`}
            onClick={() => simResult && setTab("simulate")}
            disabled={!simResult}
          >
            Simulation
          </button>
        </div>

        <div className="sim-body">
          {/* ── Suggestions tab ── */}
          {tab === "suggest" && (
            <>
              {loading ? (
                <div className="sim-loading">Analysing team capacity…</div>
              ) : (
                <div className="sim-suggestions">
                  {suggestions.map(s => (
                    <div
                      key={s.user_id}
                      className={`sim-user-card ${selected === s.user_id ? "sim-user-card--selected" : ""} ${s.on_leave ? "sim-user-card--leave" : ""}`}
                      onClick={() => !s.on_leave && runSimulation(s.user_id)}
                    >
                      <div className="sim-user-avatar" style={{ background: STATUS_COLOR[s.status] }}>
                        {s.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                          <span style={{ fontWeight: 600, fontSize: 14, color: "#0f172a" }}>{s.name}</span>
                          <span className={`sim-status-pill sim-status-pill--${s.status}`}>{s.status}</span>
                          {!s.feasible && <span className="sim-warn-pill">⚠ overloaded</span>}
                        </div>
                        <LoadBar pct={s.load_pct || 0} color={STATUS_COLOR[s.status]} />
                        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
                          {s.task_count} active task{s.task_count !== 1 ? "s" : ""}
                          {!s.feasible && s.next_available && (
                            <span> · available {new Date(s.next_available).toLocaleDateString()}</span>
                          )}
                        </div>
                      </div>
                      {simLoading && selected === s.user_id && (
                        <div style={{ fontSize: 12, color: "#6366f1" }}>Simulating…</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── Simulation result tab ── */}
          {tab === "simulate" && simResult && sim && (
            <div className="sim-result">
              <div className={`sim-verdict sim-verdict--${sim.feasible ? "ok" : "warn"}`}>
                {sim.feasible ? "✅ Assignment looks good" : "⚠️ Over capacity"}
                <span className={`sim-risk-badge`} style={{ background: RISK_COLOR[sim.delayRisk] + "22", color: RISK_COLOR[sim.delayRisk] }}>
                  {RISK_LABEL[sim.delayRisk]}
                </span>
              </div>

              {!sim.feasible && (
                <div className="sim-message">{sim.message}</div>
              )}

              {/* Before / After */}
              <div className="sim-compare">
                <div className="sim-compare-col">
                  <div className="sim-compare-label">Before</div>
                  <LoadBar pct={sim.before.pct} color="#6366f1" label={`${sim.before.hours}h · ${sim.before.tasks} tasks`} />
                </div>
                <div className="sim-compare-arrow">→</div>
                <div className="sim-compare-col">
                  <div className="sim-compare-label">After assign</div>
                  <LoadBar
                    pct={sim.after.pct}
                    color={sim.after.pct >= 90 ? "#ef4444" : sim.after.pct >= 70 ? "#f59e0b" : "#10b981"}
                    label={`${sim.after.hours}h · ${sim.after.tasks} tasks`}
                  />
                  {sim.after.overload > 0 && (
                    <div style={{ fontSize: 11, color: "#ef4444", marginTop: 2 }}>
                      +{sim.after.overload}h over capacity
                    </div>
                  )}
                </div>
              </div>

              {/* Future load sparkline */}
              {simResult.prediction_after_assign?.days?.length > 0 && (
                <div className="sim-forecast">
                  <div className="sim-forecast-label">14-day load forecast (after assign)</div>
                  <div className="sim-sparkline">
                    {simResult.prediction_after_assign.days.map((d, i) => (
                      <div
                        key={i}
                        className="sim-spark-bar"
                        style={{
                          height: `${Math.max(4, d.load_percent)}%`,
                          background: d.load_percent >= 90 ? "#ef4444" : d.load_percent >= 70 ? "#f59e0b" : "#10b981",
                        }}
                        title={`${d.date}: ${d.load_percent}%`}
                      />
                    ))}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#94a3b8", marginTop: 2 }}>
                    <span>Today</span>
                    <span>+14 days</span>
                  </div>
                </div>
              )}

              {/* Override justification */}
              {!sim.feasible && sim.canOverride && (
                <div className="sim-override">
                  <label className="modal-label">Override justification (required)</label>
                  <textarea
                    className="sim-override-input"
                    placeholder="Explain why this task must be assigned despite overload…"
                    value={justification}
                    onChange={e => setJustification(e.target.value)}
                    rows={2}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="sim-footer">
          <button className="btn-modal-cancel" onClick={onClose}>Cancel</button>
          {selected && (
            <button
              className="btn-modal-save"
              onClick={handleAssign}
              disabled={!sim?.feasible && sim?.canOverride && !justification.trim()}
              style={{
                background: sim && !sim.feasible ? "#f59e0b" : "#6366f1",
              }}
            >
              {sim && !sim.feasible ? "⚠️ Override & Assign" : "Assign task"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
