import { useState, useEffect, useCallback } from "react";
import api from "../api/api";

const LOAD_COLOR = (pct) =>
  pct > 100 ? "#dc2626" : pct >= 80 ? "#f59e0b" : "#10b981";

function LoadBar({ pct, label }) {
  const capped = Math.min(100, pct || 0);
  const color  = LOAD_COLOR(pct || 0);
  return (
    <div>
      {label && <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>{label}</div>}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1, height: 8, background: "#f1f5f9", borderRadius: 99, overflow: "hidden" }}>
          <div style={{
            width: `${capped}%`, height: "100%",
            background: color, borderRadius: 99, transition: "width 0.5s",
          }} />
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color, minWidth: 40 }}>{pct || 0}%</span>
      </div>
    </div>
  );
}

function PredictionChart({ prediction }) {
  if (!prediction) return null;
  if (!prediction.days?.length) {
    return (
      <div className="sim-chart">
        <div className="sim-chart-title">14-Day Load Forecast</div>
        <div style={{ padding: "20px 0", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
          {prediction.risk === "on_leave"
            ? "🏖️ Member is on leave — no forecast available"
            : "No forecast data available"}
        </div>
      </div>
    );
  }
  const maxLoad = Math.max(100, ...prediction.days.map(d => d.load_percent));

  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    const d = new Date(dateStr + "T12:00:00");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <div className="sim-chart">
      <div className="sim-chart-title">14-Day Load Forecast</div>
      <div className="sim-chart-bars">
        {prediction.days.map((d, i) => {
          const h     = Math.max(2, Math.min(80, (d.load_percent / maxLoad) * 80));
          const color = LOAD_COLOR(d.load_percent);
          return (
            <div key={i} className="sim-chart-bar-col" title={`${formatDate(d.date)}: ${d.load_percent}%`}>
              <div className="sim-chart-bar-wrap">
                <div className="sim-chart-bar" style={{ height: `${h}px`, background: color }} />
              </div>
              {i % 7 === 0 && <div className="sim-chart-day-lbl">{formatDate(d.date)}</div>}
            </div>
          );
        })}
      </div>
      <div className="sim-chart-legend">
        <span style={{ color: "#10b981" }}>■ Available</span>
        <span style={{ color: "#f59e0b" }}>■ Near capacity</span>
        <span style={{ color: "#dc2626" }}>■ Overloaded</span>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color }) {
  return (
    <div style={{
      background: "#f8fafc", border: "1.5px solid #e2e8f0", borderRadius: 10,
      padding: "12px 16px", display: "flex", alignItems: "center", gap: 12,
    }}>
      <div style={{ fontSize: 22 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 18, fontWeight: 800, color: color || "#0f172a" }}>{value}</div>
        <div style={{ fontSize: 11, color: "#64748b" }}>{label}</div>
      </div>
    </div>
  );
}

export default function SimulationPanel({ workspaceId }) {
  const [tasks,          setTasks]         = useState([]);
  const [members,        setMembers]       = useState([]);
  const [selectedTask,   setTask]          = useState("");
  const [selectedUser,   setUser]          = useState("");
  const [estHours,       setEstHours]      = useState("");
  const [result,         setResult]        = useState(null);
  const [suggestions,    setSuggestions]   = useState(null);
  const [loading,        setLoading]       = useState(false);
  const [sugLoading,     setSugLoading]    = useState(false);
  const [applying,       setApplying]      = useState(false);
  const [applySuccess,   setApplySuccess]  = useState(false);
  const [applyError,     setApplyError]    = useState(null);
  const [travelWarning,  setTravelWarning] = useState(null);

  const loadData = useCallback(async () => {
    if (!workspaceId) return;
    const [tasksR, membersR] = await Promise.allSettled([
      api.get(`/tasks/workspace/${workspaceId}`),
      api.get(`/members?workspace_id=${workspaceId}`),
    ]);
    if (tasksR.status === "fulfilled")
      setTasks((tasksR.value.data || []).filter(t => t.status !== "done"));
    if (membersR.status === "fulfilled")
      setMembers(membersR.value.data || []);
  }, [workspaceId]);

  useEffect(() => { loadData(); }, [loadData]);

  const doRunSimulation = async () => {
    setLoading(true);
    setResult(null);
    setSuggestions(null);
    setApplySuccess(false);
    setApplyError(null);
    try {
      const res = await api.post("/simulate/assign", {
        task_id:         parseInt(selectedTask),
        user_id:         parseInt(selectedUser),
        workspace_id:    workspaceId,
        estimated_hours: estHours ? parseFloat(estHours) : undefined,
      });
      setResult(res.data);
    } catch (err) {
      setResult({ error: err.response?.data?.message || "Simulation failed" });
    } finally {
      setLoading(false);
    }
  };

  const runSimulation = () => {
    if (!selectedTask || !selectedUser) return;
    const member = members.find(m => String(m.user_id || m.id) === selectedUser);
    if (member && (member.travel_mode || member.on_leave)) {
      setTravelWarning(member);
      return;
    }
    doRunSimulation();
  };

  const getSuggestions = async () => {
    if (!selectedTask) return;
    setSugLoading(true);
    setSuggestions(null);
    setResult(null);
    try {
      const res = await api.get(`/simulate/suggest/${workspaceId}/${selectedTask}`);
      setSuggestions(res.data);
    } catch (e) { console.error(e); }
    finally { setSugLoading(false); }
  };

  const applyAssignment = async () => {
    if (!result || !selectedTask || !selectedUser) return;
    setApplying(true);
    setApplyError(null);
    try {
      await api.put(`/tasks/${selectedTask}`, { assigned_user_id: parseInt(selectedUser) });
      setApplySuccess(true);
      await loadData();
      setTimeout(() => setApplySuccess(false), 3000);
    } catch (err) {
      setApplyError(err.response?.data?.message || "Failed to apply assignment");
    } finally {
      setApplying(false);
    }
  };

  if (!workspaceId) return null;

  const sim = result?.simulation;

  return (
    <div className="sim-root">

      {/* ── Travel / Leave Warning Modal ── */}
      {travelWarning && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999,
        }}>
          <div style={{
            background: "#fff", borderRadius: 14, padding: "32px 36px",
            maxWidth: 440, width: "90%", boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
            textAlign: "center",
          }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>
              {travelWarning.on_leave ? "🏖️" : "✈️"}
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", marginBottom: 8 }}>
              {travelWarning.name} is {travelWarning.on_leave ? "on leave" : "travelling"}
            </div>
            <div style={{ fontSize: 14, color: "#64748b", lineHeight: 1.7, marginBottom: 24 }}>
              {travelWarning.on_leave
                ? `${travelWarning.name} is currently on leave and may not be available to take on new tasks.`
                : `${travelWarning.name} is travelling with reduced capacity (${travelWarning.travel_hours || 2}h/day). Assigning additional tasks may overload them.`
              }
              <br />
              <span style={{ color: "#f59e0b", fontWeight: 600 }}>
                You can still run the simulation to see the projected impact.
              </span>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button
                onClick={() => setTravelWarning(null)}
                style={{
                  padding: "10px 22px", borderRadius: 8, border: "1.5px solid #e2e8f0",
                  background: "#f8fafc", color: "#374151", fontSize: 14, fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => { setTravelWarning(null); doRunSimulation(); }}
                style={{
                  padding: "10px 22px", borderRadius: 8, border: "none",
                  background: "linear-gradient(135deg, #f59e0b, #d97706)",
                  color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer",
                }}
              >
                ⚠ Apply Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Left: form ── */}
      <div className="sim-left">
        <div className="sim-left-header">
          <div className="sim-left-icon">🔬</div>
          <div>
            <div className="sim-left-title">What-If Simulation</div>
            <div className="sim-left-sub">Preview assignment impact before committing</div>
          </div>
        </div>

        <div className="sim-form">
          <div className="sim-field">
            <label>Task to assign</label>
            {tasks.length === 0 ? (
              <div className="sim-empty-hint">No open tasks in this workspace yet.</div>
            ) : (
              <select value={selectedTask} onChange={e => { setTask(e.target.value); setResult(null); setSuggestions(null); setApplySuccess(false); setApplyError(null); }}>
                <option value="">— Select a task —</option>
                {tasks.map(t => (
                  <option key={t.id} value={t.id}>
                    [{t.priority?.toUpperCase()}] {t.type ? `[${t.type}] ` : ""}{t.title}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Selected task preview */}
          {tasks.find(t => String(t.id) === selectedTask) && (() => {
            const td = tasks.find(t => String(t.id) === selectedTask);
            return (
              <div style={{
                background: "#f8fafc", border: "1.5px solid #e2e8f0", borderRadius: 8,
                padding: "10px 12px", fontSize: 12, color: "#374151",
              }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{td.title}</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {td.type && (
                    <span style={{ background: "#f0f4ff", color: "#4338ca", borderRadius: 4, padding: "2px 6px" }}>
                      {td.type}
                    </span>
                  )}
                  <span style={{ background: "#fef9ec", color: "#92400e", borderRadius: 4, padding: "2px 6px" }}>
                    {td.priority}
                  </span>
                  {td.estimated_hours && (
                    <span style={{ color: "#64748b" }}>~{td.estimated_hours}h estimated</span>
                  )}
                </div>
              </div>
            );
          })()}

          <div className="sim-field">
            <label>Assign to</label>
            {members.length === 0 ? (
              <div className="sim-empty-hint">No members in this workspace yet.</div>
            ) : (
              <select value={selectedUser} onChange={e => { setUser(e.target.value); setResult(null); setApplySuccess(false); setApplyError(null); }}>
                <option value="">— Select a member —</option>
                {members.map(m => (
                  <option key={m.user_id || m.id} value={m.user_id || m.id}>
                    {m.name} {m.role ? `(${m.role})` : ""}
                    {m.on_leave ? " 🏖 On leave" : m.travel_mode ? " ✈ Travelling" : ""}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="sim-field">
            <label>
              Estimated hours{" "}
              <span className="sim-optional">(optional override)</span>
            </label>
            <input
              type="number" min="0.5" step="0.5"
              value={estHours} onChange={e => setEstHours(e.target.value)}
              placeholder="Use task's default hours"
            />
          </div>

          <button
            className="sim-run-btn"
            onClick={runSimulation}
            disabled={!selectedTask || !selectedUser || loading}
          >
            {loading ? <><span className="sim-spinner" /> Simulating…</> : "⚡ Run Simulation"}
          </button>

          <button
            className="sim-suggest-btn"
            onClick={getSuggestions}
            disabled={!selectedTask || sugLoading}
          >
            {sugLoading ? "Loading…" : "🤖 Who should do this?"}
          </button>
        </div>

        {/* ── How it works ── */}
        <div className="sim-how-it-works">
          <div className="sim-how-title">How it works</div>
          <div className="sim-how-step"><span>1</span> Select a task and a team member</div>
          <div className="sim-how-step"><span>2</span> Click "Run Simulation" to preview load impact</div>
          <div className="sim-how-step"><span>3</span> Use "Who should do this?" for AI suggestions</div>
          <div className="sim-how-step"><span>4</span> Click "Apply Assignment" to commit the change</div>
        </div>
      </div>

      {/* ── Right: results ── */}
      <div className="sim-right">
        {/* Placeholder when nothing run yet */}
        {!result && !suggestions && !loading && !sugLoading && (
          <div className="sim-placeholder">
            <div className="sim-placeholder-icon">📊</div>
            <div className="sim-placeholder-title">No simulation run yet</div>
            <div className="sim-placeholder-sub">
              Select a task and assignee on the left, then click <strong>Run Simulation</strong> to see the impact.
            </div>
            <div className="sim-feature-grid">
              {[
                { icon: "📈", label: "Load before & after" },
                { icon: "⚠️", label: "Overload warnings" },
                { icon: "📅", label: "14-day forecast chart" },
                { icon: "🤖", label: "AI best-match ranking" },
                { icon: "✅", label: "One-click apply" },
                { icon: "🔁", label: "Reassignment safe-check" },
              ].map(f => (
                <div key={f.label} className="sim-feature-chip">
                  <span>{f.icon}</span> {f.label}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Simulation result */}
        {result && !result.error && (
          <div className="sim-result">
            <div className="sim-result-header">
              Assigning <strong>{result.task?.title}</strong> → <strong>{result.user?.name}</strong>
            </div>

            {/* Verdict banner */}
            <div className="sim-verdict" style={{
              background: sim?.feasible ? "#d1fae5" : "#fee2e2",
              borderColor: sim?.feasible ? "#6ee7b7" : "#fca5a5",
              color: sim?.feasible ? "#065f46" : "#991b1b",
            }}>
              <span style={{ fontSize: 16 }}>{sim?.feasible ? "✓ Feasible" : "✗ Not recommended"}</span>
              <span className="sim-verdict-msg">{sim?.message || sim?.reason}</span>
            </div>

            {/* Stats row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, margin: "16px 0" }}>
              <StatCard
                icon="📊"
                label="Current load"
                value={`${sim?.before?.pct || 0}%`}
                color={LOAD_COLOR(sim?.before?.pct || 0)}
              />
              <StatCard
                icon="📈"
                label="After assignment"
                value={`${sim?.after?.pct || 0}%`}
                color={LOAD_COLOR(sim?.after?.pct || 0)}
              />
              <StatCard
                icon="⏱"
                label="Extra daily load"
                value={sim?.newTaskHours !== undefined ? `+${sim.newTaskHours}h` : "—"}
              />
            </div>

            {/* Load comparison bars */}
            <div className="sim-metrics">
              <div className="sim-metric-card">
                <LoadBar label="Before" pct={sim?.before?.pct || 0} />
              </div>
              <div className="sim-metric-arrow">→</div>
              <div className="sim-metric-card">
                <LoadBar label="After assignment" pct={sim?.after?.pct || 0} />
              </div>
            </div>

            {/* 14-day forecast */}
            <PredictionChart prediction={result.prediction_after_assign} />

            {/* Apply error */}
            {applyError && (
              <div style={{
                marginTop: 12, padding: "10px 14px", background: "#fee2e2",
                borderRadius: 8, color: "#991b1b", fontSize: 13, fontWeight: 500,
              }}>
                ✗ {applyError}
              </div>
            )}

            {/* Apply assignment button */}
            {applySuccess ? (
              <div style={{
                marginTop: 16, padding: "12px 16px", background: "#d1fae5",
                borderRadius: 8, color: "#065f46", fontWeight: 600, textAlign: "center",
              }}>
                ✓ Assignment applied successfully!
              </div>
            ) : (
              <button
                onClick={applyAssignment}
                disabled={applying}
                style={{
                  marginTop: 16, width: "100%", padding: "12px",
                  background: sim?.feasible
                    ? "linear-gradient(135deg, #10b981, #059669)"
                    : "linear-gradient(135deg, #f59e0b, #d97706)",
                  color: "#fff", border: "none", borderRadius: 8,
                  fontSize: 14, fontWeight: 700, cursor: "pointer",
                  opacity: applying ? 0.7 : 1,
                }}
              >
                {applying ? "Applying…" : sim?.feasible ? "✓ Apply Assignment" : "⚠ Apply Anyway"}
              </button>
            )}
          </div>
        )}

        {result?.error && (
          <div className="sim-error-box">✗ {result.error}</div>
        )}

        {/* Suggestions */}
        {suggestions && (
          <div className="sim-suggestions">
            <div className="sim-suggestions-title">
              Best people for: <strong>{suggestions.task?.title}</strong>
            </div>
            {!suggestions.suggestions?.length ? (
              <div className="sim-empty-hint">No members available for suggestions.</div>
            ) : (
              <div className="sim-suggestions-list">
                {suggestions.suggestions.slice(0, 6).map((s, i) => (
                  <div
                    key={s.user_id}
                    className={`sim-suggestion-item ${s.feasible ? "feasible" : "blocked"}`}
                    onClick={() => { setUser(String(s.user_id)); setSuggestions(null); }}
                  >
                    <div className="sim-sug-rank">#{i + 1}</div>
                    <div className="sim-sug-info">
                      <div className="sim-sug-name">{s.name}</div>
                      <div className="sim-sug-reason">{s.message || s.reason}</div>
                    </div>
                    <div className="sim-sug-load" style={{ minWidth: 120 }}>
                      <LoadBar pct={s.load_pct || 0} />
                      <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>
                        {s.task_count} active task{s.task_count !== 1 ? "s" : ""}
                      </div>
                    </div>
                    {s.feasible && (
                      <span className="sim-sug-badge" style={{ background: "#d1fae5", color: "#065f46" }}>
                        ✓ Best match
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div style={{ marginTop: 12, fontSize: 12, color: "#94a3b8", textAlign: "center" }}>
              Click a suggestion to select that member, then run the simulation.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
