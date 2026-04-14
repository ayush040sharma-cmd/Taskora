import { useState } from "react";

const IconX = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export default function CreateTaskModal({ onClose, onSubmit, defaultStatus = "todo" }) {
  const [form, setForm] = useState({
    title: "",
    description: "",
    status: defaultStatus,
    priority: "medium",
    due_date: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return setError("Task title is required.");
    setError("");
    setLoading(true);
    try {
      await onSubmit(form);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to create task.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">Create task</span>
          <button className="modal-close" onClick={onClose}><IconX /></button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="auth-error-banner" style={{ marginBottom: 14 }}>{error}</div>}

            <div className="modal-form-group">
              <label className="modal-label">Title *</label>
              <input
                className="modal-input"
                placeholder="What needs to be done?"
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                autoFocus
                required
              />
            </div>

            <div className="modal-form-group">
              <label className="modal-label">Description</label>
              <textarea
                className="modal-textarea"
                placeholder="Add more detail…"
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
              />
            </div>

            <div className="modal-row">
              <div className="modal-form-group">
                <label className="modal-label">Status</label>
                <select
                  className="modal-select"
                  value={form.status}
                  onChange={(e) => set("status", e.target.value)}
                >
                  <option value="todo">To Do</option>
                  <option value="inprogress">In Progress</option>
                  <option value="done">Done</option>
                </select>
              </div>

              <div className="modal-form-group">
                <label className="modal-label">Priority</label>
                <select
                  className="modal-select"
                  value={form.priority}
                  onChange={(e) => set("priority", e.target.value)}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
            </div>

            <div className="modal-form-group">
              <label className="modal-label">Due date</label>
              <input
                type="date"
                className="modal-input"
                value={form.due_date}
                onChange={(e) => set("due_date", e.target.value)}
              />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-modal-cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-modal-submit" disabled={loading}>
              {loading ? "Creating…" : "Create task"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
