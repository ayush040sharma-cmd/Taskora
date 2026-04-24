import { useState, useEffect } from "react";
import api from "../api/api";

const LOAD_COLOR = (pct) =>
  pct > 100 ? "#dc2626" : pct >= 80 ? "#f59e0b" : "#10b981";

function LoadBar({ pct }) {
  const capped = Math.min(100, pct || 0);
  const color  = LOAD_COLOR(pct);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{
        flex: 1, height: 6, background: "#f1f5f9", borderRadius: 99, overflow: "hidden"
      }}>
        <div style={{ width: `${capped}%`, height: "100%", background: color, borderRadius: 99, transition: "width 0.5s" }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color, minWidth: 36 }}>{pct}%</span>
    </div>
  );
}

function PredictionChart({ prediction }) {
  if (!prediction?.days?.length) return null;
  const maxLoad = Math.max(100, ...prediction.days.map(d => d.load_percent));

  return (
    <div className="sim-chart">
      <div className="sim-chart-title">14-Day Load Forecast (after assignment)</div>
      <div className="sim-chart-bars">
        {prediction.days.map((d, i) => {
          const h = Math.min(100, (d.load_percent / maxLoad) * 80);
          const color = LOAD_COLOR(d.load_percent);
          return (
            <div key={i} className="sim-chart-bar-col" title={`Day ${i + 1}: ${d.load_percent}%`}>
              <div className="sim-chart-bar-wrap">
                <div className="sim-chart-bar" style={{ height: `${h}px`, background: color }} />
              </div>
              {i % 7 === 0 && <div className="sim-chart-day-lbl">D{i + 1}</div>}
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

export default function SimulationPanel({ workspaceId }) {
  const [tasks, setTasks]         = useState([]);
  const [members, setMembers]     = useState([]);
  const [selectedTask, setTask]   = useState("");
  const [selectedUser, setUser]   = useState("");
  const [estHours, setEstHours]   = useState("");
  const [result, setResult]       = useState(null);
  const [suggestions, setSuggestions] = useState(null);
  const [loading, setLoading]     = useState(false);
  const [sugLoading, setSugLoading] = useState(false);

  useEffect(() => {
    if (!workspaceId) return;
    Promise.all([
      api.get(`/tasks/workspace/${workspaceId}`),
      api.get(`/members?workspace_id=${workspaceId}`),
    ]).then(([tRes, mRes]) => {
      setTasks(tRes.data.filter(t => t.status !== "done"));
      setMembers(mRes.data || []);
    }).catch(() => {});
  }, [workspaceId]);

  const runSimulation = async () => {
    if (!selectedTask || !selectedUser) return;
    setLoading(true);
    setResult(null);
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

  const getSuggestions = async () => {
    if (!selectedTask) return;
    setSugLoading(true);
    setSuggestions(null);
    try {
      const res = await api.get(`/simulate/suggest/${workspaceId}/${selectedTask}`);
      setSuggestions(res.data);
    } catch {
      // ignore
    } finally {
      setSugLoading(false);
    }
  };

  if (!workspaceId) return null;

  return (
    <div className="sim-root">
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
              <select value={selectedTask} onChange={e => { setTask(e.target.value); setResult(null); setSuggestions(null); }}>
                <option value="">— Select a task —</option>
                {tasks.map(t => (
                  <option key={t.id} value={t.id}>[{t.priority}] {t.title}</option>
                ))}
              </select>
            )}
          </div>

          <div className="sim-field">
            <label>Assign to</label>
            {members.length === 0 ? (
              <div className="sim-empty-hint">No members in this workspace yet.</div>
            ) : (
              <select value={selectedUser} onChange={e => { setUser(e.target.value); setResult(null); }}>
                <option value="">— Select a member —</option>
                {members.map(m => (
                  <option key={m.user_id || m.id} value={m.user_id || m.id}>
                    {m.name} {m.role ? `(${m.role})` : ""}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="sim-field">
            <label>Estimated hours <span className="sim-optional">(optional override)</span></label>
            <input
              type="number" min="0.5" step="0.5"
              value={estHours} onChange={e => setEstHours(e.target.value)}
              placeholder="Use task's default hours"
            />
          </div>

          <button className="sim-run-btn" onClick={runSimulation}
            disabled={!selectedTask || !selectedUser || loading}>
            {loading ? <><span className="sim-spinner" /> Simulating…</> : "⚡ Run Simulation"}
          </button>

          <button className="sim-suggest-btn" onClick={getSuggestions}
            disabled={!selectedTask || sugLoading}>
            {sugLoading ? "Loading…" : "🤖 Who should do this?"}
          </button>
        </div>

        <div className="sim-how-it-works">
          <div className="sim-how-title">How it works</div>
          <div className="sim-how-step"><span>1</span> Select a task and a team member</div>
          <div className="sim-how-step"><span>2</span> Click "Run Simulation" to preview load impact</div>
          <div className="sim-how-step"><span>3</span> Use "Who should do this?" for AI suggestions</div>
        </div>
      </div>

      {/* ── Right: results ── */}
      <div className="sim-right">
        {!result && !suggestions && (
          <div className="sim-placeholder">
            <div className="sim-placeholder-icon">📊</div>
            <div className="sim-placeholder-title">No simulation run yet</div>
            <div className="sim-placeholder-sub">
              Select a task and assignee on the left, then click<br /><strong>Run Simulation</strong> to see the impact.
            </div>
            <div className="sim-feature-grid">
              {[
                { icon: "📈", label: "Load before & after" },
                { icon: "⚠️", label: "Overload warnings" },
                { icon: "📅", label: "14-day forecast chart" },
                { icon: "🤖", label: "AI best-match ranking" },
              ].map(f => (
                <div key={f.label} className="sim-feature-chip">
                  <span>{f.icon}</span> {f.label}
                </div>
              ))}
            </div>
          </div>
        )}

        {result && !result.error && (
          <div className="sim-result">
            <div className="sim-result-header">
              Assigning <strong>{result.task?.title}</strong> → <strong>{result.user?.name}</strong>
            </div>
            <div className="sim-verdict" style={{
              background: result.simulation?.allowed ? "#d1fae5" : "#fee2e2",
              borderColor: result.simulation?.allowed ? "#6ee7b7" : "#fca5a5",
              color: result.simulation?.allowed ? "#065f46" : "#991b1b",
            }}>
              <span>{result.simulation?.allowed ? "✓ Feasible" : "✗ Not recommended"}</span>
              <span className="sim-verdict-msg">{result.simulation?.message || result.simulation?.reason}</span>
            </div>

            <div className="sim-metrics">
              <div className="sim-metric-card">
                <div className="sim-metric-label">Before</div>
                <LoadBar pct={result.simulation?.current_load_pct || 0} />
              </div>
              <div className="sim-metric-arrow">→</div>
              <div className="sim-metric-card">
                <div className="sim-metric-label">After assignment</div>
                <LoadBar pct={result.simulation?.projected_load_pct || result.simulation?.new_load_pct || 0} />
              </div>
            </div>

            {result.simulation?.delta_hours !== undefined && (
              <div className="sim-delta">
                +{result.simulation.delta_hours}h additional daily load
              </div>
            )}

            {result.simulation?.warnings?.length > 0 && (
              <div className="sim-warnings">
                {result.simulation.warnings.map((w, i) => (
                  <div key={i} className="sim-warning">⚠ {w}</div>
                ))}
              </div>
            )}

            <PredictionChart prediction={result.prediction_after_assign} />
          </div>
        )}

        {result?.error && (
          <div className="sim-error-box">✗ {result.error}</div>
        )}

        {suggestions && (
          <div className="sim-suggestions">
            <div className="sim-suggestions-title">
              Best people for: <strong>{suggestions.task?.title}</strong>
            </div>
            {suggestions.suggestions?.length === 0 ? (
              <div className="sim-empty-hint">No members available for suggestions.</div>
            ) : (
              <div className="sim-suggestions-list">
                {suggestions.suggestions?.slice(0, 6).map((s, i) => (
                  <div key={s.user_id}
                    className={`sim-suggestion-item ${s.feasible ? "feasible" : "blocked"}`}
                    onClick={() => { setUser(String(s.user_id)); setSuggestions(null); }}>
                    <div className="sim-sug-rank">#{i + 1}</div>
                    <div className="sim-sug-info">
                      <div className="sim-sug-name">{s.name}</div>
                      <div className="sim-sug-reason">{s.message || s.reason}</div>
                    </div>
                    <div className="sim-sug-load">
                      <LoadBar pct={s.load_pct || 0} />
                      <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{s.task_count} active tasks</div>
                    </div>
                    {s.feasible && <span className="sim-sug-badge">✓ Best match</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
