import { useState, useEffect } from "react";
import api from "../api/api";

const IconX = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

const TYPE_META = {
  task:         { label: "Task",         desc: "General work item",   icon: "📋", days: 1,  range: "~1 day"    },
  bug:          { label: "Bug",          desc: "Something is broken", icon: "🐛", days: 1,  range: "~1 day"    },
  story:        { label: "Story",        desc: "User-facing feature", icon: "📖", days: 3,  range: "~3 days"   },
  rfp:          { label: "RFP",          desc: "Request for proposal",icon: "📑", days: 15, range: "2–3 weeks" },
  proposal:     { label: "Proposal",     desc: "Sales proposal",      icon: "📝", days: 2,  range: "2–3 days"  },
  presentation: { label: "Presentation", desc: "Deck / demo",         icon: "🎤", days: 1,  range: "1–2 days"  },
  upgrade:      { label: "Upgrade",      desc: "Version upgrade",     icon: "⬆️", days: 5,  range: "~1 week"   },
  poc:          { label: "POC",          desc: "Proof of concept",    icon: "🔬", days: 30, range: "1–2 months"},
};

export default function CreateTaskModal({ onClose, onSubmit, defaultStatus = "todo", sprints = [] }) {
  const [form, setForm] = useState({
    title: "", description: "", status: defaultStatus,
    priority: "medium", due_date: "", start_date: "",
    type: "task", estimated_days: 3, progress: 0,
    assigned_user_id: "", sprint_id: "",
  });
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const [users, setUsers]         = useState([]);
  const [userSearch, setUserSearch] = useState("");
  const [workloadWarn, setWorkloadWarn] = useState("");
  const [daysAutoFilled, setDaysAutoFilled] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Auto-fill estimated_days + compute due_date when type changes
  const selectType = (t) => {
    const meta = TYPE_META[t];
    const days = meta?.days ?? 1;
    setForm(f => {
      const newForm = { ...f, type: t, estimated_days: days };
      // If start_date is set, auto-compute due_date
      if (f.start_date) {
        const due = new Date(f.start_date);
        due.setDate(due.getDate() + days);
        newForm.due_date = due.toISOString().split("T")[0];
      }
      return newForm;
    });
    setDaysAutoFilled(true);
  };

  // Recompute due_date when start_date changes (if estimated_days set)
  const handleStartDate = (val) => {
    setForm(f => {
      const newForm = { ...f, start_date: val };
      if (val && f.estimated_days) {
        const due = new Date(val);
        due.setDate(due.getDate() + Number(f.estimated_days));
        newForm.due_date = due.toISOString().split("T")[0];
      }
      return newForm;
    });
  };

  // Search users for assignment
  useEffect(() => {
    if (!userSearch) { setUsers([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await api.get(`/workload/users?q=${encodeURIComponent(userSearch)}`);
        setUsers(res.data);
      } catch {}
    }, 300);
    return () => clearTimeout(t);
  }, [userSearch]);

  const selectUser = async (user) => {
    set("assigned_user_id", user.id);
    setUserSearch(user.name);
    setUsers([]);
    // Check their workload
    try {
      const res = await api.get(`/workload/users?q=${encodeURIComponent(user.email)}`);
      // rough check — just warn if many tasks
      setWorkloadWarn("");
    } catch {}
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return setError("Task title is required.");
    setError(""); setLoading(true);
    try {
      await onSubmit({
        ...form,
        estimated_days: Number(form.estimated_days),
        progress: Number(form.progress),
        assigned_user_id: form.assigned_user_id || undefined,
        sprint_id: form.sprint_id || undefined,
        due_date: form.due_date || undefined,
        start_date: form.start_date || undefined,
      });
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to create task.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <span className="modal-title">Create task</span>
          <button className="modal-close" onClick={onClose}><IconX /></button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ maxHeight: "70vh", overflowY: "auto" }}>
            {error && <div className="auth-error-banner" style={{ marginBottom: 14 }}>{error}</div>}
            {workloadWarn && <div className="wl-warning" style={{ marginBottom: 14 }}>{workloadWarn}</div>}

            {/* Title */}
            <div className="modal-form-group">
              <label className="modal-label">Title *</label>
              <input className="modal-input" placeholder="What needs to be done?"
                value={form.title} onChange={e => set("title", e.target.value)} autoFocus required />
            </div>

            {/* Description */}
            <div className="modal-form-group">
              <label className="modal-label">Description</label>
              <textarea className="modal-textarea" placeholder="Add more detail…"
                value={form.description} onChange={e => set("description", e.target.value)} />
            </div>

            {/* Task Type */}
            <div className="modal-form-group">
              <label className="modal-label">Task Type</label>
              <div className="task-type-selector task-type-selector--grid">
                {Object.entries(TYPE_META).map(([t, meta]) => (
                  <button
                    key={t}
                    type="button"
                    className={`task-type-btn ${form.type === t ? "active" : ""}`}
                    onClick={() => selectType(t)}
                  >
                    <span className="task-type-icon">{meta.icon}</span>
                    <strong>{meta.label}</strong>
                    <span>{meta.desc}</span>
                    <span className="task-type-range">{meta.range}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="modal-row">
              {/* Status */}
              <div className="modal-form-group">
                <label className="modal-label">Status</label>
                <select className="modal-select" value={form.status} onChange={e => set("status", e.target.value)}>
                  <option value="todo">To Do</option>
                  <option value="inprogress">In Progress</option>
                  <option value="done">Done</option>
                </select>
              </div>
              {/* Priority */}
              <div className="modal-form-group">
                <label className="modal-label">Priority</label>
                <select className="modal-select" value={form.priority} onChange={e => set("priority", e.target.value)}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
            </div>

            <div className="modal-row">
              {/* Start date */}
              <div className="modal-form-group">
                <label className="modal-label">Start Date</label>
                <input type="date" className="modal-input" value={form.start_date}
                  onChange={e => handleStartDate(e.target.value)} />
              </div>
              {/* Due date */}
              <div className="modal-form-group">
                <label className="modal-label">Due Date</label>
                <input type="date" className="modal-input" value={form.due_date}
                  onChange={e => set("due_date", e.target.value)} />
              </div>
            </div>

            <div className="modal-row">
              {/* Estimated days */}
              <div className="modal-form-group">
                <label className="modal-label">
                  Estimated Duration
                  {daysAutoFilled && (
                    <span className="task-autofill-badge">
                      ✦ auto-filled · {TYPE_META[form.type]?.range}
                    </span>
                  )}
                </label>
                <div className="task-duration-wrap">
                  <input
                    type="number"
                    className="modal-input task-duration-input"
                    min="1" max="180"
                    value={form.estimated_days}
                    onChange={e => {
                      set("estimated_days", e.target.value);
                      setDaysAutoFilled(false);
                    }}
                  />
                  <span className="task-duration-unit">days</span>
                </div>
              </div>
              {/* Progress */}
              <div className="modal-form-group">
                <label className="modal-label">Initial Progress ({form.progress}%)</label>
                <input type="range" min="0" max="100" step="5" className="task-progress-slider"
                  value={form.progress} onChange={e => set("progress", e.target.value)}
                  style={{ width: "100%", marginTop: 8 }} />
              </div>
            </div>

            {/* Assignee */}
            <div className="modal-form-group" style={{ position: "relative" }}>
              <label className="modal-label">Assign To</label>
              <input className="modal-input" placeholder="Search by name or email…"
                value={userSearch} onChange={e => setUserSearch(e.target.value)} />
              {users.length > 0 && (
                <div className="user-dropdown">
                  {users.map(u => (
                    <div key={u.id} className="user-dropdown-item" onClick={() => selectUser(u)}>
                      <div className="user-dropdown-avatar">{u.name.slice(0,2).toUpperCase()}</div>
                      <div>
                        <div className="user-dropdown-name">{u.name}</div>
                        <div className="user-dropdown-email">{u.email}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Sprint */}
            {sprints.length > 0 && (
              <div className="modal-form-group">
                <label className="modal-label">Add to Sprint</label>
                <select className="modal-select" value={form.sprint_id}
                  onChange={e => set("sprint_id", e.target.value)}>
                  <option value="">— No sprint —</option>
                  {sprints.filter(s => s.status !== "completed").map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-modal-cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-modal-submit" disabled={loading}>
              {loading ? "Creating…" : "Create task"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
