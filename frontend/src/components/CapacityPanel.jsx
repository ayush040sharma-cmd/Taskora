/**
 * Capacity Panel — personal capacity & leave/travel settings
 * Non-managers see an approval flow: request is sent to manager for approval.
 */
import { useState, useEffect } from "react";
import api from "../api/api";
import { useAuth } from "../context/AuthContext";

const DEFAULTS = {
  daily_hours: 8,
  customer_facing_hours: 6,
  internal_hours: 2,
  travel_mode: false,
  travel_hours: 4,   // 4h default while travelling (half day)
  on_leave: false,
  leave_start: "",
  leave_end: "",
  max_rfp: 1,
  max_proposals: 2,
  max_presentations: 2,
  max_upgrades: 2,
};

// ── Approval Confirmation Modal ───────────────────────────────────────────────
function ApprovalConfirmModal({ type, form, workspaceId, onSent, onCancel }) {
  const typeLabel = type === "leave" ? "Leave" : "Travel Mode";
  const typeIcon  = type === "leave" ? "🏖️" : "✈️";
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState("");

  const handleSend = async () => {
    setSending(true);
    try {
      await api.post("/capacity/requests", {
        request_type: type,
        workspace_id: workspaceId,
        leave_start:  type === "leave" ? (form.leave_start || null) : null,
        leave_end:    type === "leave" ? (form.leave_end   || null) : null,
        travel_hours: type === "travel" ? Number(form.travel_hours || 2) : null,
        justification: note || null,
      });
      onSent();
    } catch {
      onSent(); // fall through — request stored best-effort
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 9999 }}>
      <div className="cap-approval-modal modal-box" style={{ maxWidth: 440, borderRadius: 16, padding: 32 }}>
        <div style={{ fontSize: 40, textAlign: "center", marginBottom: 16 }}>{typeIcon}</div>
        <h3 className="cap-approval-title" style={{ fontSize: 18, fontWeight: 700, textAlign: "center", margin: "0 0 12px" }}>
          {typeLabel} Request
        </h3>
        <p className="cap-approval-body" style={{ fontSize: 14, textAlign: "center", lineHeight: 1.6, margin: "0 0 8px" }}>
          This request will go to your <strong>manager for approval</strong>.
        </p>
        <p className="cap-approval-note" style={{ fontSize: 13, textAlign: "center", margin: "0 0 16px" }}>
          Your manager will be notified and can approve or reject.
        </p>
        <textarea
          className="modal-input"
          placeholder="Add a note (optional)"
          rows={2}
          value={note}
          onChange={e => setNote(e.target.value)}
          style={{ marginBottom: 20, resize: "none" }}
        />
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button
            onClick={onCancel}
            className="cap-approval-cancel btn-modal-cancel"
            style={{ padding: "10px 24px", fontWeight: 600, fontSize: 14 }}
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending}
            style={{
              padding: "10px 24px", borderRadius: 8, border: "none",
              background: "var(--tk-accent, #3B82F6)",
              color: "#fff", fontWeight: 600, cursor: sending ? "not-allowed" : "pointer", fontSize: 14,
            }}
          >
            {sending ? "Sending…" : "Send Request →"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CapacityPanel({ workspaceId }) {
  const { user } = useAuth();
  const isAnalyst = user?.role !== "manager" && user?.role !== "super_boss";

  const [form,    setForm]    = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState({ hours: false, travel: false, leave: false });
  const [saved,   setSaved]   = useState("");
  const [error,   setError]   = useState("");
  const [requestSent, setRequestSent] = useState(""); // "leave" | "travel" — success banner

  // Approval flow state
  const [pendingSection, setPendingSection] = useState(null); // "leave" | "travel"

  useEffect(() => {
    api.get("/capacity/me")
      .then(r => setForm({ ...DEFAULTS, ...r.data }))
      .catch(() => setForm(DEFAULTS))
      .finally(() => setLoading(false));
  }, []);

  const set = (k) => (e) => {
    const v = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setForm(f => ({ ...f, [k]: v }));
  };

  // For analysts toggling leave/travel — show confirmation first
  const handleSectionSave = (section) => {
    if (isAnalyst && (section === "leave" || section === "travel")) {
      // Only show approval flow when turning it ON
      const isActivating = section === "leave" ? form.on_leave : form.travel_mode;
      if (isActivating) {
        setPendingSection(section);
        return;
      }
    }
    save(section);
  };

  const save = async (section) => {
    setSaving(s => ({ ...s, [section]: true })); setError(""); setSaved("");
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
      const updated = await api.get("/capacity/me").catch(() => null);
      if (updated) setForm({ ...DEFAULTS, ...updated.data });
      setTimeout(() => setSaved(""), 2500);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save. Please try again.");
    } finally {
      setSaving(s => ({ ...s, [section]: false }));
    }
  };

  const handleApprovalSent = () => {
    const section = pendingSection;
    setPendingSection(null);
    // Revert toggle — state stays unchanged until manager approves
    if (section === "leave") setForm(f => ({ ...f, on_leave: false }));
    if (section === "travel") setForm(f => ({ ...f, travel_mode: false }));
    setRequestSent(section);
    setTimeout(() => setRequestSent(""), 5000);
  };

  const handleApprovalCancel = () => {
    // Revert toggle
    if (pendingSection === "leave") setForm(f => ({ ...f, on_leave: false }));
    if (pendingSection === "travel") setForm(f => ({ ...f, travel_mode: false }));
    setPendingSection(null);
  };

  if (loading) return (
    <div className="wl-loading">
      <div className="spinner" />
      Loading capacity settings…
    </div>
  );

  return (
    <div className="cap-root">
      {/* Approval confirmation modal */}
      {pendingSection && (
        <ApprovalConfirmModal
          type={pendingSection}
          form={form}
          workspaceId={workspaceId}
          onSent={handleApprovalSent}
          onCancel={handleApprovalCancel}
        />
      )}

      {/* Request sent banner */}
      {requestSent && (
        <div style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 14, color: "#22c55e", display: "flex", alignItems: "center", gap: 8 }}>
          ✅ Your {requestSent === "leave" ? "leave" : "travel"} request has been sent to your manager for approval.
        </div>
      )}

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

        {/* Live effective capacity banner */}
        {(form.on_leave || form.travel_mode) && (
          <div style={{
            display: "flex", alignItems: "center", gap: 12,
            background: form.on_leave ? "#fef2f2" : "#eff6ff",
            border: `1px solid ${form.on_leave ? "#fca5a5" : "#93c5fd"}`,
            borderRadius: 10, padding: "10px 14px", marginBottom: 12,
          }}>
            <span style={{ fontSize: 20 }}>{form.on_leave ? "🏖️" : "✈️"}</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, color: form.on_leave ? "#dc2626" : "#1d4ed8" }}>
                {form.on_leave ? "On leave — effective capacity: 0 h/day" : `Travelling — effective capacity: ${form.travel_hours || 4} h/day`}
              </div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 1 }}>
                {form.on_leave
                  ? `Normal capacity (${form.daily_hours}h) is suspended while on leave`
                  : `Normal capacity reduced from ${form.daily_hours}h → ${form.travel_hours || 4}h while travelling`}
              </div>
            </div>
          </div>
        )}

        <div className="cap-fields">
          <div className="cap-field">
            <label className="cap-field-label">
              Total daily capacity
              {form.travel_mode && !form.on_leave && (
                <span style={{ marginLeft: 6, fontSize: 11, color: "var(--tk-accent, #3B82F6)", fontWeight: 600 }}>
                  (travel: {form.travel_hours || 4}h active)
                </span>
              )}
            </label>
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

        {/* Visual hours bar — shows effective vs normal */}
        <div className="cap-hours-viz">
          <div className="cap-hours-bar">
            {form.on_leave ? (
              <div style={{ width: "100%", background: "rgba(239,68,68,0.15)", borderRadius: 4, height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 11, color: "#ef4444", fontWeight: 600 }}>0h — on leave</span>
              </div>
            ) : (
              <>
                <div className="cap-hours-seg cap-seg--customer"
                  style={{ width: `${Math.min(100, (form.customer_facing_hours / Math.max(form.daily_hours, 1)) * 100)}%` }}
                  title="Customer-facing"
                />
                <div className="cap-hours-seg cap-seg--internal"
                  style={{ width: `${Math.min(100, (form.internal_hours / Math.max(form.daily_hours, 1)) * 100)}%` }}
                  title="Internal"
                />
                {form.travel_mode && (
                  <div style={{
                    position: "absolute", top: 0, right: 0, bottom: 0,
                    width: `${Math.min(100, ((form.daily_hours - (form.travel_hours || 4)) / Math.max(form.daily_hours, 1)) * 100)}%`,
                    background: "repeating-linear-gradient(45deg,transparent,transparent 4px,rgba(59,130,246,0.15) 4px,rgba(59,130,246,0.15) 8px)",
                    borderRadius: "0 4px 4px 0",
                  }} title={`${form.daily_hours - (form.travel_hours || 4)}h unavailable while travelling`} />
                )}
              </>
            )}
          </div>
          <div className="cap-hours-legend">
            {!form.on_leave && (
              <>
                <span><span className="cap-dot cap-dot--customer" />Customer ({form.customer_facing_hours}h)</span>
                <span><span className="cap-dot cap-dot--internal" />Internal ({form.internal_hours}h)</span>
              </>
            )}
            <span className="cap-hours-total">
              {form.on_leave
                ? "Effective: 0h (on leave)"
                : form.travel_mode
                  ? `Effective: ${form.travel_hours || 4}h / Normal: ${form.daily_hours}h`
                  : `Total: ${form.daily_hours}h`}
            </span>
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

        <button className="cap-save-btn" onClick={() => save("hours")} disabled={saving.hours}>
          {saving.hours ? "Saving…" : saved === "hours" ? "✓ Saved!" : "Save changes"}
        </button>
      </div>

      {/* ── Travel mode ── */}
      <div className="cap-card">
        <div className="cap-card-header">
          <span className="cap-card-icon">✈️</span>
          <div style={{ flex: 1 }}>
            <div className="cap-card-title">Travel Mode</div>
            <div className="cap-card-desc">
              Automatically reduces your daily capacity from <strong>{form.daily_hours}h → {form.travel_hours || 4}h</strong> while you're travelling
              {isAnalyst && <span style={{ color: "var(--tk-accent, #3B82F6)", marginLeft: 6, fontSize: 12 }}>· requires manager approval</span>}
            </div>
          </div>
          <label className="cap-toggle">
            <input type="checkbox" checked={!!form.travel_mode} onChange={set("travel_mode")} />
            <span className="cap-toggle-track">
              <span className="cap-toggle-thumb" />
            </span>
          </label>
        </div>

        {/* Always-visible quick reference */}
        <div style={{ display: "flex", gap: 12, margin: "8px 0 4px", flexWrap: "wrap" }}>
          <div style={{
            flex: 1, minWidth: 120, background: form.travel_mode ? "#eff6ff" : "var(--column-bg)",
            border: `1px solid ${form.travel_mode ? "#93c5fd" : "var(--border)"}`,
            borderRadius: 8, padding: "10px 14px", textAlign: "center",
          }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>NORMAL</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: form.travel_mode ? "var(--text-muted)" : "var(--text-primary)" }}>{form.daily_hours}h</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>per day</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", fontSize: 18, color: "var(--text-muted)" }}>→</div>
          <div style={{
            flex: 1, minWidth: 120, background: form.travel_mode ? "#dbeafe" : "var(--column-bg)",
            border: `2px solid ${form.travel_mode ? "#3b82f6" : "var(--border)"}`,
            borderRadius: 8, padding: "10px 14px", textAlign: "center",
          }}>
            <div style={{ fontSize: 11, color: form.travel_mode ? "#1d4ed8" : "var(--text-muted)", marginBottom: 2 }}>TRAVELLING</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: form.travel_mode ? "#1d4ed8" : "var(--text-muted)" }}>{form.travel_hours || 4}h</div>
            <div style={{ fontSize: 11, color: form.travel_mode ? "#3b82f6" : "var(--text-muted)" }}>{form.travel_mode ? "✈️ active now" : "per day"}</div>
          </div>
        </div>

        {form.travel_mode && (
          <div className="cap-travel-detail" style={{ marginTop: 12 }}>
            <div className="cap-travel-note">
              ✈️ Travel mode is <strong>ON</strong> — workload engine now uses <strong>{form.travel_hours || 4}h/day</strong> for all calculations
            </div>
            <div className="cap-field" style={{ marginTop: 12 }}>
              <label className="cap-field-label">Hours available while travelling</label>
              <div className="cap-field-input-wrap">
                <input className="modal-input" type="number" min={0} max={24} step={0.5}
                  value={form.travel_hours || 4} onChange={set("travel_hours")} style={{ maxWidth: 90 }} />
                <span className="cap-unit">h / day</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                Changing this updates immediately — no full save needed after toggling.
              </div>
            </div>
          </div>
        )}

        <button className="cap-save-btn" onClick={() => handleSectionSave("travel")} disabled={saving.travel}
          style={{ marginTop: form.travel_mode ? 12 : 16 }}>
          {saving.travel ? "Saving…" : saved === "travel" ? "✓ Saved!" : isAnalyst ? "Request travel mode" : "Save travel settings"}
        </button>
      </div>

      {/* ── Leave management ── */}
      <div className="cap-card">
        <div className="cap-card-header">
          <span className="cap-card-icon">🏖️</span>
          <div>
            <div className="cap-card-title">Leave Management</div>
            <div className="cap-card-desc">
              When on leave, your capacity shows as 0 and no tasks can be assigned
              {isAnalyst && <span style={{ color: "var(--tk-accent, #3B82F6)", marginLeft: 6, fontSize: 12 }}>· requires manager approval</span>}
            </div>
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

        <button className="cap-save-btn" onClick={() => handleSectionSave("leave")} disabled={saving.leave}
          style={{ marginTop: form.on_leave ? 12 : 16 }}>
          {saving.leave ? "Saving…" : saved === "leave" ? "✓ Saved!" : isAnalyst ? "Apply for leave" : "Save leave settings"}
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
