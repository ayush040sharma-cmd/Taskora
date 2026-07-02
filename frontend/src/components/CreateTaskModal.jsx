import { useState, useEffect } from "react";
import { LuX, LuClipboardList, LuBug, LuBookOpen, LuFileStack, LuFilePenLine, LuPresentation, LuArrowUp, LuFlaskConical } from "react-icons/lu";
import api from "../api/api";

const IconX = () => <LuX size={16} />;

const TYPE_META = {
  task:         { label: "Task",         desc: "General work item",   icon: LuClipboardList, days: 1,  range: "~1 day"    },
  bug:          { label: "Bug",          desc: "Something is broken", icon: LuBug,           days: 1,  range: "~1 day"    },
  story:        { label: "Story",        desc: "User-facing feature", icon: LuBookOpen,      days: 3,  range: "~3 days"   },
  rfp:          { label: "RFP",          desc: "Request for proposal",icon: LuFileStack,     days: 15, range: "2–3 weeks" },
  proposal:     { label: "Proposal",     desc: "Sales proposal",      icon: LuFilePenLine,   days: 2,  range: "2–3 days"  },
  presentation: { label: "Presentation", desc: "Deck / demo",         icon: LuPresentation,  days: 1,  range: "1–2 days"  },
  upgrade:      { label: "Upgrade",      desc: "Version upgrade",     icon: LuArrowUp,       days: 5,  range: "~1 week"   },
  poc:          { label: "POC",          desc: "Proof of concept",    icon: LuFlaskConical,  days: 30, range: "1–2 months"},
};

export default function CreateTaskModal({ onClose, onSubmit, defaultStatus = "todo", sprints = [], workspaceId }) {
  const [form, setForm] = useState({
    title: "", description: "", status: defaultStatus,
    priority: "medium", due_date: "", start_date: "",
    type: "task", estimated_days: 1,
    assigned_user_id: "", sprint_id: "", team_id: "",
    estimated_duration: 1,
    final_duration: 1,
    recurrence: "",
  });
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const [users, setUsers]         = useState([]);
  const [teams, setTeams]         = useState([]);
  const [userSearch, setUserSearch] = useState("");
  const [workloadWarn, setWorkloadWarn] = useState("");
  const [daysAutoFilled, setDaysAutoFilled] = useState(false);

  useEffect(() => {
    if (!workspaceId) return;
    api.get(`/teams?workspace_id=${workspaceId}`).then(r => setTeams(r.data)).catch(() => {});
  }, [workspaceId]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Auto-fill estimated_days + compute due_date when type changes
  // Only auto-fills due_date if the user hasn't already entered one manually
  const selectType = (t) => {
    const meta = TYPE_META[t];
    const days = meta?.days ?? 1;
    setForm(f => {
      const newForm = {
        ...f,
        type: t,
        estimated_days:     days,
        estimated_duration: days,   // system suggested — locked at type selection
        final_duration:     days,   // starts equal; user can edit
      };
      if (f.start_date && !f.due_date) {
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
        const res = await api.get(`/workload/users?q=${encodeURIComponent(userSearch)}${workspaceId ? `&workspace_id=${workspaceId}` : ""}`);
        setUsers(res.data);
      } catch {}
    }, 300);
    return () => clearTimeout(t);
  }, [userSearch]);

  const selectUser = (user) => {
    set("assigned_user_id", user.id);
    setUserSearch(user.name);
    setUsers([]);
    if (user.on_leave) {
      setWorkloadWarn("⚠️ This person is currently on leave — they cannot take new tasks.");
    } else if (user.travel_mode) {
      setWorkloadWarn("✈️ This person is travelling and has reduced capacity.");
    } else {
      setWorkloadWarn("");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return setError("Task title is required.");
    setError(""); setLoading(true);
    try {
      await onSubmit({
        ...form,
        estimated_days: Number(form.estimated_days),
        progress: 0,
        assigned_user_id: form.assigned_user_id || undefined,
        sprint_id: form.sprint_id || undefined,
        team_id: form.team_id || undefined,
        due_date: form.due_date || undefined,
        start_date: form.start_date || undefined,
        recurrence: form.recurrence || undefined,
        blocked_reason: form.blocked_reason || undefined,
        blocked_severity: form.status === "blocked" ? (form.blocked_severity || "medium") : undefined,
        blocked_expected_resolution: form.blocked_expected_resolution || undefined,
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
                    <span className="task-type-icon"><meta.icon size={16} /></span>
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
                  <option value="review">In Review</option>
                  <option value="done">Done</option>
                  <option value="blocked">Blocked</option>
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

            {/* Estimated days — full width */}
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

            {/* Assignee */}
            <div className="modal-form-group" style={{ position: "relative" }}>
              <label className="modal-label">Assign To</label>
              <input className="modal-input" placeholder="Search by name or email…"
                value={userSearch} onChange={e => setUserSearch(e.target.value)} />
              {users.length > 0 && (
                <div className="user-dropdown">
                  {users.map(u => (
                    <div key={u.id} className={`user-dropdown-item ${u.on_leave ? "user-dropdown-item--leave" : ""}`} onClick={() => selectUser(u)}>
                      <div className="user-dropdown-avatar">{u.name.slice(0,2).toUpperCase()}</div>
                      <div style={{ flex: 1 }}>
                        <div className="user-dropdown-name">
                          {u.name}
                          {u.on_leave && <span className="user-status-chip user-status-chip--leave">🌴 On Leave</span>}
                          {!u.on_leave && u.travel_mode && <span className="user-status-chip user-status-chip--travel">✈️ Travelling</span>}
                        </div>
                        <div className="user-dropdown-email">{u.email}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {workloadWarn && (
                <div className="user-workload-warn">{workloadWarn}</div>
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

            {/* Team */}
            {teams.length > 0 && (
              <div className="modal-form-group">
                <label className="modal-label">Assign to Team</label>
                <select className="modal-select" value={form.team_id}
                  onChange={e => set("team_id", e.target.value)}>
                  <option value="">— No team —</option>
                  {teams.map(t => <option key={t.id} value={t.id}>{t.icon || "🏢"} {t.name}</option>)}
                </select>
              </div>
            )}

            {/* Blocked fields */}
            {form.status === "blocked" && (
              <div style={{ background: "#7f1d1d22", border: "1px solid #ef444433", borderRadius: 10, padding: "14px 16px", marginBottom: 4 }}>
                <div style={{ color: "#fca5a5", fontSize: 12, fontWeight: 700, marginBottom: 12 }}>🚫 Blocked Task Details</div>
                <div className="modal-form-group">
                  <label className="modal-label">Reason for being blocked</label>
                  <input className="modal-input" placeholder="What is blocking this task?"
                    value={form.blocked_reason || ""}
                    onChange={e => set("blocked_reason", e.target.value)} />
                </div>
                <div className="modal-row">
                  <div className="modal-form-group">
                    <label className="modal-label">Severity</label>
                    <select className="modal-select" value={form.blocked_severity || "medium"}
                      onChange={e => set("blocked_severity", e.target.value)}>
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                  </div>
                  <div className="modal-form-group">
                    <label className="modal-label">Expected Resolution</label>
                    <input type="date" className="modal-input"
                      value={form.blocked_expected_resolution || ""}
                      onChange={e => set("blocked_expected_resolution", e.target.value)} />
                  </div>
                </div>
              </div>
            )}

            {/* Recurrence — coming soon */}
            <div className="modal-form-group">
              <label className="modal-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                🔁 Recurrence
                <span style={{ fontSize: 10, fontWeight: 700, background: "rgba(139,92,246,0.15)", color: "#a78bfa", borderRadius: 4, padding: "1px 6px", letterSpacing: "0.3px" }}>
                  COMING SOON
                </span>
              </label>
              <select className="modal-select" value={form.recurrence} disabled
                onChange={e => set("recurrence", e.target.value)}
                style={{ opacity: 0.5, cursor: "not-allowed" }}>
                <option value="">None (one-time)</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
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
