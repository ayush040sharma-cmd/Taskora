import { useState } from "react";

const IconX = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

export default function SprintModal({ onClose, onSubmit }) {
  const today = new Date().toISOString().split("T")[0];
  const twoWeeks = new Date(Date.now() + 14*86400000).toISOString().split("T")[0];

  const [form, setForm] = useState({ name: "", goal: "", start_date: today, end_date: twoWeeks });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return setError("Sprint name is required.");
    if (form.end_date <= form.start_date) return setError("End date must be after start date.");
    setError(""); setLoading(true);
    try {
      await onSubmit(form);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to create sprint.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 460 }}>
        <div className="modal-header">
          <span className="modal-title">🏃 Create Sprint</span>
          <button className="modal-close" onClick={onClose}><IconX /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="auth-error-banner" style={{ marginBottom: 14 }}>{error}</div>}

            <div className="modal-form-group">
              <label className="modal-label">Sprint Name *</label>
              <input className="modal-input" placeholder="e.g. Sprint 1 — Auth & Onboarding"
                value={form.name} onChange={e => set("name", e.target.value)} autoFocus required />
            </div>

            <div className="modal-form-group">
              <label className="modal-label">Sprint Goal</label>
              <textarea className="modal-textarea" placeholder="What should the team accomplish?"
                value={form.goal} onChange={e => set("goal", e.target.value)} />
            </div>

            <div className="modal-row">
              <div className="modal-form-group">
                <label className="modal-label">Start Date</label>
                <input type="date" className="modal-input" value={form.start_date}
                  onChange={e => set("start_date", e.target.value)} />
              </div>
              <div className="modal-form-group">
                <label className="modal-label">End Date</label>
                <input type="date" className="modal-input" value={form.end_date}
                  onChange={e => set("end_date", e.target.value)} />
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-modal-cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-modal-submit" disabled={loading}>
              {loading ? "Creating…" : "Create Sprint"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
