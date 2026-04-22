/**
 * Capacity Panel — personal capacity & leave/travel settings
 */
import { useState, useEffect } from "react";
import api from "../api/api";

const DEFAULTS = {
  daily_hours: 8,
  customer_facing_hours: 6,
  internal_hours: 2,
  travel_mode: false,
  travel_hours: 2,
  on_leave: false,
  leave_start: "",
  leave_end: "",
  max_rfp: 1,
  max_proposals: 2,
  max_presentations: 2,
  max_upgrades: 2,
};

export default function CapacityPanel() {
  const [form,    setForm]    = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState("");
  const [error,   setError]   = useState("");

  useEffect(() => {
    api.get("/capacity/me")
      .then(r => setForm({ ...DEFAULTS, ...r.data }))
      .catch(() => {
        // API failed (table might not exist yet) — still show UI with defaults
        setForm(DEFAULTS);
      })
      .finally(() => setLoading(false));
  }, []);

  const set = (k) => (e) => {
    const v = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setForm(f => ({ ...f, [k]: v }));
  };

  const save = async (section) => {
    setSaving(true); setError(""); setSaved("");
    try {
      if (section === "travel") {
        await api.put("/capacity/travel", {
          travel_mode: form.travel_mode,
          travel_hours: Number(form.travel_hours),
        });
      } else if (section === "leave") {
        await api.put("/capacity/leave", {
          on_leave: form.on_leave,
          leave_start: form.leave_start || null,
          leave_end: form.leave_end || null,
        });
      } else {
        await api.put("/capacity/me", {
          daily_hours:           Number(form.daily_hours),
          customer_facing_hours: Number(form.customer_facing_hours),
          internal_hours:        Number(form.internal_hours),
          max_rfp:               Number(form.max_rfp),
          max_proposals:         Number(form.max_proposals),
          max_presentations:     Number(form.max_presentations),
          max_upgrades:          Number(form.max_upgrades),
        });
      }
      setSaved(section);
      // Refresh from server
      const updated = await api.get("/capacity/me").catch(() => null);
      if (updated) setForm({ ...DEFAULTS, ...updated.data });
      setTimeout(() => setSaved(""), 2500);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save. Run the SQL migration and retry.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="wl-loading">
      <div className="spinner" />
      Loading capacity settings…
    </div>
  );

  return (
    <div className="cap-root">

      {/* ── Page header ── */}
      <div className="cap-header">
        <h2 className="cap-title">⚡ My Capacity Settings</h2>
        <p className="cap-subtitle">Configure your daily hours, work limits, and availability. These settings affect your workload calculations.</p>
      </div>

      {error && (
        <div className="auth-error-banner" style={{ marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* ── Daily hours & limits ── */}
      <div className="cap-card">
        <div className="cap-card-header">
          <span className="cap-card-icon">📅</span>
          <div>
            <div className="cap-card-title">Daily Hours</div>
            <div className="cap-card-desc">Set how many hours per day you're available to work</div>
          </div>
        </div>

        <div className="cap-fields">
          <div className="cap-field">
            <label className="cap-field-label">Total daily capacity</label>
            <div className="cap-field-input-wrap">
              <input className="modal-input" type="number" min={0} max={24} step={0.5}
                value={form.daily_hours} onChange={set("daily_hours")} style={{ maxWidth: 90 }} />
              <span className="cap-unit">h / day</span>
            </div>
          </div>
          <div className="cap-field">
            <label className="cap-field-label">Customer-facing hours</label>
            <div className="cap-field-input-wrap">
              <input className="modal-input" type="number" min={0} max={24} step={0.5}
                value={form.customer_facing_hours} onChange={set("customer_facing_hours")} style={{ maxWidth: 90 }} />
              <span className="cap-unit">h / day</span>
            </div>
          </div>
          <div className="cap-field">
            <label className="cap-field-label">Internal / meetings</label>
            <div className="cap-field-input-wrap">
              <input className="modal-input" type="number" min={0} max={24} step={0.5}
                value={form.internal_hours} onChange={set("internal_hours")} style={{ maxWidth: 90 }} />
              <span className="cap-unit">h / day</span>
            </div>
          </div>
        </div>

        {/* Visual hours bar */}
        <div className="cap-hours-viz">
          <div className="cap-hours-bar">
            <div className="cap-hours-seg cap-seg--customer"
              style={{ width: `${Math.min(100, (form.customer_facing_hours / Math.max(form.daily_hours, 1)) * 100)}%` }}
              title="Customer-facing"
            />
            <div className="cap-hours-seg cap-seg--internal"
              style={{ width: `${Math.min(100, (form.internal_hours / Math.max(form.daily_hours, 1)) * 100)}%` }}
              title="Internal"
            />
          </div>
          <div className="cap-hours-legend">
            <span><span className="cap-dot cap-dot--customer" />Customer ({form.customer_facing_hours}h)</span>
            <span><span className="cap-dot cap-dot--internal" />Internal ({form.internal_hours}h)</span>
            <span className="cap-hours-total">Total: {form.daily_hours}h</span>
          </div>
        </div>

        <div className="cap-card-divider" />
        <div className="cap-card-subtitle">🔢 Allocation Limits</div>
        <p className="cap-desc">Maximum number of each type you can handle simultaneously</p>

        <div className="cap-limits-grid">
          {[
            ["max_rfp",           "📑 RFPs",          "Max simultaneous RFPs"],
            ["max_proposals",     "📝 Proposals",     "Max simultaneous proposals"],
            ["max_presentations", "🎤 Presentations", "Max simultaneous presentations"],
            ["max_upgrades",      "⬆️ Upgrades",      "Max simultaneous upgrades"],
          ].map(([k, label, hint]) => (
            <div className="cap-limit-item" key={k}>
              <div className="cap-limit-label">{label}</div>
              <div className="cap-limit-hint">{hint}</div>
              <div className="cap-limit-stepper">
                <button className="cap-step-btn"
                  onClick={() => setForm(f => ({ ...f, [k]: Math.max(0, Number(f[k]) - 1) }))}>−</button>
                <span className="cap-step-val">{form[k] || 0}</span>
                <button className="cap-step-btn"
                  onClick={() => setForm(f => ({ ...f, [k]: Math.min(20, Number(f[k]) + 1) }))}>+</button>
              </div>
            </div>
          ))}
        </div>

        <button className="cap-save-btn" onClick={() => save("hours")} disabled={saving}>
          {saving && saved === "" ? "Saving…" : saved === "hours" ? "✓ Saved!" : "Save changes"}
        </button>
      </div>

      {/* ── Travel mode ── */}
      <div className="cap-card">
        <div className="cap-card-header">
          <span className="cap-card-icon">✈️</span>
          <div>
            <div className="cap-card-title">Travel Mode</div>
            <div className="cap-card-desc">Reduces your daily capacity while you're on the road</div>
          </div>
          <label className="cap-toggle">
            <input type="checkbox" checked={!!form.travel_mode} onChange={set("travel_mode")} />
            <span className="cap-toggle-track">
              <span className="cap-toggle-thumb" />
            </span>
          </label>
        </div>

        {form.travel_mode && (
          <div className="cap-travel-detail">
            <div className="cap-travel-note">
              ✈️ Travel mode is <strong>active</strong> — your capacity is reduced
            </div>
            <div className="cap-field" style={{ marginTop: 12 }}>
              <label className="cap-field-label">Available hours while travelling</label>
              <div className="cap-field-input-wrap">
                <input className="modal-input" type="number" min={0} max={24} step={0.5}
                  value={form.travel_hours || 2} onChange={set("travel_hours")} style={{ maxWidth: 90 }} />
                <span className="cap-unit">h / day</span>
              </div>
            </div>
          </div>
        )}

        <button className="cap-save-btn" onClick={() => save("travel")} disabled={saving}
          style={{ marginTop: form.travel_mode ? 12 : 16 }}>
          {saving && saved === "" ? "Saving…" : saved === "travel" ? "✓ Saved!" : "Save travel settings"}
        </button>
      </div>

      {/* ── Leave management ── */}
      <div className="cap-card">
        <div className="cap-card-header">
          <span className="cap-card-icon">🏖️</span>
          <div>
            <div className="cap-card-title">Leave Management</div>
            <div className="cap-card-desc">When on leave, your capacity shows as 0 and no tasks can be assigned</div>
          </div>
          <label className="cap-toggle">
            <input type="checkbox" checked={!!form.on_leave} onChange={set("on_leave")} />
            <span className="cap-toggle-track">
              <span className="cap-toggle-thumb" />
            </span>
          </label>
        </div>

        {form.on_leave && (
          <div className="cap-leave-detail">
            <div className="cap-leave-note">🏖️ You are currently marked as <strong>on leave</strong></div>
            <div className="cap-fields" style={{ marginTop: 12 }}>
              <div className="cap-field">
                <label className="cap-field-label">Leave start</label>
                <input className="modal-input" type="date"
                  value={form.leave_start || ""} onChange={set("leave_start")} />
              </div>
              <div className="cap-field">
                <label className="cap-field-label">Leave end</label>
                <input className="modal-input" type="date"
                  value={form.leave_end || ""} onChange={set("leave_end")} />
              </div>
            </div>
          </div>
        )}

        <button className="cap-save-btn" onClick={() => save("leave")} disabled={saving}
          style={{ marginTop: form.on_leave ? 12 : 16 }}>
          {saving && saved === "" ? "Saving…" : saved === "leave" ? "✓ Saved!" : "Save leave settings"}
        </button>
      </div>

      {/* Status bar */}
      <div className="cap-status-bar">
        <div className={`cap-status-item ${form.on_leave ? "cap-status--leave" : ""}`}>
          {form.on_leave ? "🏖️ On leave" : "✅ Active"}
        </div>
        <div className={`cap-status-item ${form.travel_mode ? "cap-status--travel" : ""}`}>
          {form.travel_mode ? `✈️ Travelling (${form.travel_hours}h/day)` : "📍 In office"}
        </div>
        <div className="cap-status-item">
          ⚡ {form.daily_hours}h daily capacity
        </div>
      </div>
    </div>
  );
}
