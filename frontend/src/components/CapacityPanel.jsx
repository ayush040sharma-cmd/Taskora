/**
 * Capacity Panel — personal capacity & leave/travel settings
 * Used inside Account Settings or as a standalone view.
 */
import { useState, useEffect } from "react";
import api from "../api/api";

export default function CapacityPanel() {
  const [cap,     setCap]     = useState(null);
  const [form,    setForm]    = useState(null);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [error,   setError]   = useState("");

  useEffect(() => {
    api.get("/capacity/me").then(r => {
      setCap(r.data);
      setForm(r.data);
    }).catch(console.error);
  }, []);

  const set = (k) => (e) => {
    const v = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setForm(f => ({ ...f, [k]: v }));
  };

  const save = async (section) => {
    setSaving(true); setError(""); setSaved(false);
    try {
      if (section === "travel") {
        await api.put("/capacity/travel", { travel_mode: form.travel_mode, travel_hours: form.travel_hours });
      } else if (section === "leave") {
        await api.put("/capacity/leave", { on_leave: form.on_leave, leave_start: form.leave_start, leave_end: form.leave_end });
      } else {
        await api.put("/capacity/me", {
          daily_hours:           form.daily_hours,
          customer_facing_hours: form.customer_facing_hours,
          internal_hours:        form.internal_hours,
          max_rfp:               form.max_rfp,
          max_proposals:         form.max_proposals,
          max_presentations:     form.max_presentations,
          max_upgrades:          form.max_upgrades,
        });
      }
      setSaved(true);
      const updated = await api.get("/capacity/me");
      setCap(updated.data);
      setForm(updated.data);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (!form) return <div className="wl-loading">Loading capacity settings…</div>;

  return (
    <div className="cap-root">
      <div className="cap-header">
        <h2 className="cap-title">My Capacity Settings</h2>
        <div className="cap-subtitle">Configure your daily hours, work limits, and availability</div>
      </div>

      {/* ── Daily hours ── */}
      <div className="cap-card">
        <div className="cap-card-title">📅 Daily Hours</div>
        <div className="cap-fields">
          <div className="modal-field">
            <label className="modal-label">Total daily capacity (hours)</label>
            <input className="modal-input" type="number" min={0} max={24} step={0.5}
              value={form.daily_hours} onChange={set("daily_hours")} style={{ maxWidth: 120 }} />
          </div>
          <div className="modal-field">
            <label className="modal-label">Customer-facing hours</label>
            <input className="modal-input" type="number" min={0} max={24} step={0.5}
              value={form.customer_facing_hours} onChange={set("customer_facing_hours")} style={{ maxWidth: 120 }} />
          </div>
          <div className="modal-field">
            <label className="modal-label">Internal hours</label>
            <input className="modal-input" type="number" min={0} max={24} step={0.5}
              value={form.internal_hours} onChange={set("internal_hours")} style={{ maxWidth: 120 }} />
          </div>
        </div>

        <div className="cap-card-title" style={{ marginTop: 20 }}>🔢 Allocation Limits</div>
        <div className="cap-fields">
          {[["max_rfp","Max simultaneous RFPs"],["max_proposals","Max proposals"],["max_presentations","Max presentations"],["max_upgrades","Max upgrades"]].map(([k, label]) => (
            <div className="modal-field" key={k}>
              <label className="modal-label">{label}</label>
              <input className="modal-input" type="number" min={0} max={20}
                value={form[k] || 0} onChange={set(k)} style={{ maxWidth: 80 }} />
            </div>
          ))}
        </div>
        <button className="btn-modal-save cap-save-btn" onClick={() => save("hours")} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      {/* ── Travel mode ── */}
      <div className="cap-card">
        <div className="cap-card-title">✈️ Travel Mode</div>
        <p className="cap-desc">When enabled, your daily capacity is reduced to reflect travel availability.</p>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <label className="mgr-toggle">
            <input type="checkbox" checked={!!form.travel_mode} onChange={set("travel_mode")} />
            <span>{form.travel_mode ? "✈ Currently travelling" : "Enable travel mode"}</span>
          </label>
          {form.travel_mode && (
            <div className="modal-field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <label className="modal-label" style={{ margin: 0 }}>Capacity while travelling:</label>
              <input className="modal-input" type="number" min={0} max={24} step={0.5}
                value={form.travel_hours || 2} onChange={set("travel_hours")} style={{ width: 80 }} />
              <span style={{ fontSize: 13, color: "#64748b" }}>h/day</span>
            </div>
          )}
        </div>
        <button className="btn-modal-save cap-save-btn" onClick={() => save("travel")} disabled={saving}>
          {saving ? "Saving…" : "Save travel settings"}
        </button>
      </div>

      {/* ── Leave management ── */}
      <div className="cap-card">
        <div className="cap-card-title">🏖️ Leave Management</div>
        <p className="cap-desc">When on leave, no tasks can be assigned to you and your capacity shows as 0.</p>
        <label className="mgr-toggle">
          <input type="checkbox" checked={!!form.on_leave} onChange={set("on_leave")} />
          <span>{form.on_leave ? "🏖 Currently on leave" : "Mark as on leave"}</span>
        </label>
        {form.on_leave && (
          <div style={{ display: "flex", gap: 16, marginTop: 12 }}>
            <div className="modal-field" style={{ flex: 1 }}>
              <label className="modal-label">Leave start</label>
              <input className="modal-input" type="date" value={form.leave_start || ""} onChange={set("leave_start")} />
            </div>
            <div className="modal-field" style={{ flex: 1 }}>
              <label className="modal-label">Leave end</label>
              <input className="modal-input" type="date" value={form.leave_end || ""} onChange={set("leave_end")} />
            </div>
          </div>
        )}
        <button className="btn-modal-save cap-save-btn" onClick={() => save("leave")} disabled={saving}>
          {saving ? "Saving…" : "Save leave settings"}
        </button>
      </div>

      {error  && <div className="modal-error">{error}</div>}
      {saved  && <div className="modal-success">✓ Settings saved</div>}
    </div>
  );
}
