import { useState, useEffect } from "react";
import api from "../api/api";

// ── Role config ───────────────────────────────────────────────────────────────
const ROLES = [
  {
    value: "manager",
    label: "Manager",
    icon:  "🏢",
    desc:  "Can view all workload, manage members, approve tasks",
    color: "#5243aa",
    bg:    "#f0f4ff",
  },
  {
    value: "member",
    label: "Member",
    icon:  "👤",
    desc:  "Can create & manage tasks in this workspace",
    color: "#0052cc",
    bg:    "#e8f4fd",
  },
  {
    value: "viewer",
    label: "Viewer",
    icon:  "👁",
    desc:  "Read-only access to this workspace",
    color: "#5e6c84",
    bg:    "#f4f5f7",
  },
];

const roleInfo = Object.fromEntries(ROLES.map(r => [r.value, r]));

function RoleBadge({ role }) {
  const info = roleInfo[role] || { label: role, color: "#5e6c84", bg: "#f4f5f7", icon: "👤" };
  return (
    <span className="member-role-badge" style={{ background: info.bg, color: info.color }}>
      {info.icon} {info.label}
    </span>
  );
}

// ── Add Member form ───────────────────────────────────────────────────────────
function AddMemberForm({ onAdd, onCancel }) {
  const [email, setEmail]   = useState("");
  const [role, setRole]     = useState("member");
  const [error, setError]   = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return setError("Email is required");
    setError(""); setLoading(true);
    try {
      await onAdd(email.trim(), role);
      setEmail(""); setRole("member");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to add member");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="member-add-form" onSubmit={handleSubmit}>
      <div className="member-add-title">Add member to workspace</div>
      {error && <div className="auth-error-banner" style={{ marginBottom: 10 }}>{error}</div>}

      <div className="member-add-row">
        <input
          className="modal-input"
          type="email"
          placeholder="teammate@company.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          autoFocus
          style={{ flex: 1 }}
        />
        <select
          className="modal-select"
          value={role}
          onChange={e => setRole(e.target.value)}
          style={{ width: 130 }}
        >
          {ROLES.map(r => (
            <option key={r.value} value={r.value}>{r.icon} {r.label}</option>
          ))}
        </select>
      </div>

      {/* Role description */}
      <div className="member-role-desc">
        {roleInfo[role]?.desc}
      </div>

      <div className="member-add-actions">
        <button type="button" className="btn-modal-cancel" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn-modal-submit" disabled={loading}>
          {loading ? "Adding…" : "Add member"}
        </button>
      </div>
    </form>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function MembersPanel({ workspaceId }) {
  const [members, setMembers]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showAdd, setShowAdd]   = useState(false);
  const [toast, setToast]       = useState(null);
  const [changingRole, setChangingRole] = useState(null); // memberId being edited

  const showMsg = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const load = async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const res = await api.get(`/members?workspace_id=${workspaceId}`);
      setMembers(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [workspaceId]);

  const handleAdd = async (email, role) => {
    await api.post("/members", { workspace_id: workspaceId, email, role });
    showMsg(`Member added successfully`);
    setShowAdd(false);
    await load();
  };

  const handleRoleChange = async (memberId, newRole) => {
    setChangingRole(memberId);
    try {
      await api.put(`/members/${memberId}`, { role: newRole });
      setMembers(prev => prev.map(m =>
        m.member_record_id === memberId ? { ...m, role: newRole } : m
      ));
      showMsg("Role updated");
    } catch (err) {
      showMsg(err.response?.data?.message || "Failed to update role", "error");
    } finally {
      setChangingRole(null);
    }
  };

  const handleRemove = async (member) => {
    if (!window.confirm(`Remove ${member.name} from this workspace?`)) return;
    try {
      await api.delete(`/members/${member.member_record_id}`);
      showMsg(`${member.name} removed`);
      load();
    } catch (err) {
      showMsg(err.response?.data?.message || "Failed to remove member", "error");
    }
  };

  if (loading) return (
    <div className="wl-loading"><div className="spinner" />Loading members…</div>
  );

  const totalManagers = members.filter(m => m.role === "manager" || m.is_owner).length;
  const totalMembers  = members.filter(m => m.role === "member").length;
  const totalViewers  = members.filter(m => m.role === "viewer").length;

  return (
    <div className="members-root">

      {/* ── Header ── */}
      <div className="members-header">
        <div className="members-stats">
          <div className="members-stat">
            <span className="members-stat-num">{members.length}</span>
            <span className="members-stat-label">Total</span>
          </div>
          <div className="members-stat">
            <span className="members-stat-num">{totalManagers}</span>
            <span className="members-stat-label">🏢 Managers</span>
          </div>
          <div className="members-stat">
            <span className="members-stat-num">{totalMembers}</span>
            <span className="members-stat-label">👤 Members</span>
          </div>
          <div className="members-stat">
            <span className="members-stat-num">{totalViewers}</span>
            <span className="members-stat-label">👁 Viewers</span>
          </div>
        </div>
        <button className="btn-members-add" onClick={() => setShowAdd(v => !v)}>
          {showAdd ? "✕ Cancel" : "+ Add Member"}
        </button>
      </div>

      {/* ── Add member form ── */}
      {showAdd && (
        <AddMemberForm
          onAdd={handleAdd}
          onCancel={() => setShowAdd(false)}
        />
      )}

      {/* ── Role legend ── */}
      <div className="members-legend">
        {ROLES.map(r => (
          <div key={r.value} className="members-legend-item">
            <span className="member-role-badge" style={{ background: r.bg, color: r.color }}>
              {r.icon} {r.label}
            </span>
            <span className="members-legend-desc">{r.desc}</span>
          </div>
        ))}
      </div>

      {/* ── Member list ── */}
      {members.length === 0 ? (
        <div className="wl-empty">
          <div style={{ fontSize: 36 }}>👥</div>
          <p>No members yet. Add teammates to collaborate.</p>
        </div>
      ) : (
        <div className="members-list">
          {members.map((m) => (
            <div key={m.user_id} className="member-card">
              {/* Avatar + info */}
              <div className="member-card-left">
                <div className="wl-avatar" style={{ width: 40, height: 40, fontSize: 15 }}>
                  {(m.name || "?").slice(0, 2).toUpperCase()}
                </div>
                <div className="member-info">
                  <div className="member-name">
                    {m.name}
                    {m.is_owner && (
                      <span className="member-owner-tag">owner</span>
                    )}
                  </div>
                  <div className="member-email">{m.email}</div>
                </div>
              </div>

              {/* Capacity indicators */}
              <div className="member-capacity-info">
                {m.on_leave && <span className="member-cap-badge leave">✈️ On leave</span>}
                {m.travel_mode && !m.on_leave && <span className="member-cap-badge travel">✈️ Travel</span>}
                {m.daily_hours && (
                  <span className="member-cap-badge hours">{m.daily_hours}h/day</span>
                )}
              </div>

              {/* Role selector */}
              <div className="member-role-control">
                {m.is_owner ? (
                  <RoleBadge role="manager" />
                ) : (
                  <select
                    className="member-role-select"
                    value={m.role || "member"}
                    onChange={e => handleRoleChange(m.member_record_id, e.target.value)}
                    disabled={changingRole === m.member_record_id}
                  >
                    {ROLES.map(r => (
                      <option key={r.value} value={r.value}>{r.icon} {r.label}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Remove button */}
              {!m.is_owner && (
                <button
                  className="member-remove-btn"
                  onClick={() => handleRemove(m)}
                  title="Remove from workspace"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {toast && (
        <div className={`toast ${toast.type}`}>{toast.msg}</div>
      )}
    </div>
  );
}
