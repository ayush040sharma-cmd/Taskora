import { useState, useEffect } from "react";
import api from "../api/api";

// ── Role config ───────────────────────────────────────────────────────────────
const ROLES = [
  { value: "manager", label: "Manager", icon: "🏢", desc: "Can view all workload, manage members, approve tasks", color: "#5243aa", bg: "#f0f4ff" },
  { value: "member",  label: "Member",  icon: "👤", desc: "Can create & manage tasks in this workspace",       color: "#0052cc", bg: "#e8f4fd" },
  { value: "viewer",  label: "Viewer",  icon: "👁",  desc: "Read-only access to this workspace",               color: "#5e6c84", bg: "#f4f5f7" },
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

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ member }) {
  if (member.on_leave) {
    const hasPlannedDates = member.leave_start && member.leave_end;
    const now = new Date();
    const start = member.leave_start ? new Date(member.leave_start) : null;
    const end   = member.leave_end   ? new Date(member.leave_end)   : null;

    if (start && start > now) {
      // Planned leave (future)
      return (
        <span style={{
          background: "#fff7ed", color: "#c2410c", border: "1px solid #fed7aa",
          borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 600,
          display: "flex", alignItems: "center", gap: 4,
        }}>
          📅 Planned leave
          {hasPlannedDates && (
            <span style={{ opacity: 0.75 }}>
              {" "}· {start.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              {end ? ` – ${end.toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}
            </span>
          )}
        </span>
      );
    }
    return (
      <span style={{
        background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca",
        borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 600,
      }}>
        🏖️ On leave
        {hasPlannedDates && end && (
          <span style={{ opacity: 0.75 }}>
            {" "}· until {end.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </span>
        )}
      </span>
    );
  }

  if (member.travel_mode) {
    return (
      <span style={{
        background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe",
        borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 600,
      }}>
        ✈️ Travelling{member.travel_hours ? ` (${member.travel_hours}h/day)` : ""}
      </span>
    );
  }

  return (
    <span style={{
      background: "#f0fdf4", color: "#15803d", border: "1px solid #bbf7d0",
      borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 600,
    }}>
      ✅ Available
    </span>
  );
}

// ── Add Member form ───────────────────────────────────────────────────────────
function AddMemberForm({ onAdd, onCancel }) {
  const [email, setEmail]     = useState("");
  const [role, setRole]       = useState("member");
  const [error, setError]     = useState("");
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
        <select className="modal-select" value={role} onChange={e => setRole(e.target.value)} style={{ width: 130 }}>
          {ROLES.map(r => <option key={r.value} value={r.value}>{r.icon} {r.label}</option>)}
        </select>
      </div>
      <div className="member-role-desc">{roleInfo[role]?.desc}</div>
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
  const [members, setMembers]         = useState([]);
  const [capacities, setCapacities]   = useState({});
  const [loading, setLoading]         = useState(true);
  const [showAdd, setShowAdd]         = useState(false);
  const [toast, setToast]             = useState(null);
  const [changingRole, setChangingRole] = useState(null);
  const [searchText, setSearchText]   = useState("");
  const [filterStatus, setFilterStatus] = useState("all"); // all | available | on_leave | travel

  const showMsg = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const load = async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const [membersRes, teamCapRes] = await Promise.allSettled([
        api.get(`/members?workspace_id=${workspaceId}`),
        api.get(`/capacity/team/${workspaceId}`),
      ]);

      const memberList = membersRes.status === "fulfilled" ? membersRes.value.data : [];
      setMembers(memberList);

      // Build capacity map by user_id for quick lookup
      if (teamCapRes.status === "fulfilled") {
        const capMap = {};
        (teamCapRes.value.data || []).forEach(c => { capMap[c.user_id] = c; });
        setCapacities(capMap);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [workspaceId]);

  const handleAdd = async (email, role) => {
    await api.post("/members", { workspace_id: workspaceId, email, role });
    showMsg("Member added successfully");
    setShowAdd(false);
    await load();
  };

  const handleRoleChange = async (memberId, newRole) => {
    setChangingRole(memberId);
    try {
      await api.put(`/members/${memberId}`, { role: newRole, workspace_id: workspaceId });
      setMembers(prev => prev.map(m => m.member_record_id === memberId ? { ...m, role: newRole } : m));
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
      await api.delete(`/members/${member.member_record_id}?workspace_id=${workspaceId}`);
      showMsg(`${member.name} removed`);
      load();
    } catch (err) {
      showMsg(err.response?.data?.message || "Failed to remove member", "error");
    }
  };

  if (loading) return <div className="wl-loading"><div className="spinner" />Loading members…</div>;

  // Merge capacity info into member records
  const enrichedMembers = members.map(m => ({
    ...m,
    ...(capacities[m.user_id] || {}),
  }));

  // Filter
  const filtered = enrichedMembers.filter(m => {
    const matchesSearch = !searchText || m.name?.toLowerCase().includes(searchText.toLowerCase()) || m.email?.toLowerCase().includes(searchText.toLowerCase());
    let matchesStatus = true;
    if (filterStatus === "available") matchesStatus = !m.on_leave && !m.travel_mode;
    if (filterStatus === "on_leave")  matchesStatus = !!m.on_leave;
    if (filterStatus === "travel")    matchesStatus = !!m.travel_mode && !m.on_leave;
    return matchesSearch && matchesStatus;
  });

  const totalManagers = members.filter(m => m.role === "manager" || m.is_owner).length;
  const totalMembers  = members.filter(m => m.role === "member").length;
  const onLeaveCount  = enrichedMembers.filter(m => m.on_leave).length;
  const travelCount   = enrichedMembers.filter(m => m.travel_mode && !m.on_leave).length;

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
            <span className="members-stat-num" style={{ color: onLeaveCount > 0 ? "#ef4444" : undefined }}>{onLeaveCount}</span>
            <span className="members-stat-label">🏖️ On Leave</span>
          </div>
          <div className="members-stat">
            <span className="members-stat-num" style={{ color: travelCount > 0 ? "#1d4ed8" : undefined }}>{travelCount}</span>
            <span className="members-stat-label">✈️ Travelling</span>
          </div>
        </div>
        <button className="btn-members-add" onClick={() => setShowAdd(v => !v)}>
          {showAdd ? "✕ Cancel" : "+ Add Member"}
        </button>
      </div>

      {/* ── Add member form ── */}
      {showAdd && <AddMemberForm onAdd={handleAdd} onCancel={() => setShowAdd(false)} />}

      {/* ── Search + filter bar ── */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center" }}>
        <input
          style={{
            flex: 1, padding: "8px 12px", border: "1.5px solid #e2e8f0",
            borderRadius: 8, fontSize: 13, outline: "none",
          }}
          placeholder="Search by name or email…"
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
        />
        <select
          style={{
            padding: "8px 12px", border: "1.5px solid #e2e8f0",
            borderRadius: 8, fontSize: 13, background: "#fff",
          }}
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
        >
          <option value="all">All status</option>
          <option value="available">✅ Available</option>
          <option value="on_leave">🏖️ On leave</option>
          <option value="travel">✈️ Travelling</option>
        </select>
      </div>

      {/* ── Member list ── */}
      {filtered.length === 0 ? (
        <div className="wl-empty">
          <div style={{ fontSize: 36 }}>👥</div>
          <p>{members.length === 0 ? "No members yet. Add teammates to collaborate." : "No members match the current filter."}</p>
        </div>
      ) : (
        <div className="members-list">
          {filtered.map((m) => {
            const cap = capacities[m.user_id];
            return (
              <div key={m.user_id} className="member-card" style={{
                border: "1.5px solid #e2e8f0",
                borderLeft: m.on_leave ? "4px solid #ef4444" : m.travel_mode ? "4px solid #3b82f6" : "4px solid #10b981",
              }}>
                {/* Left: Avatar + info */}
                <div className="member-card-left">
                  <div style={{
                    width: 44, height: 44, borderRadius: "50%",
                    background: m.on_leave ? "#ef4444" : m.travel_mode ? "#3b82f6" : "#10b981",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 16, fontWeight: 700, color: "#fff", flexShrink: 0,
                  }}>
                    {(m.name || "?").slice(0, 2).toUpperCase()}
                  </div>
                  <div className="member-info">
                    <div className="member-name" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {m.name}
                      {m.is_owner && <span className="member-owner-tag">owner</span>}
                    </div>
                    <div className="member-email">{m.email}</div>
                  </div>
                </div>

                {/* Middle: Status + capacity */}
                <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 0 }}>
                  <StatusBadge member={m} />
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <RoleBadge role={m.role || "member"} />
                    {cap?.daily_hours && (
                      <span style={{
                        background: "#f8fafc", color: "#64748b", border: "1px solid #e2e8f0",
                        borderRadius: 20, padding: "2px 8px", fontSize: 11,
                      }}>
                        ⚡ {cap.daily_hours}h/day
                      </span>
                    )}
                    {cap?.task_count > 0 && (
                      <span style={{
                        background: "#f0f4ff", color: "#4338ca", border: "1px solid #c7d2fe",
                        borderRadius: 20, padding: "2px 8px", fontSize: 11,
                      }}>
                        📋 {cap.task_count} task{cap.task_count !== 1 ? "s" : ""}
                      </span>
                    )}
                    {cap?.load_percent !== undefined && (
                      <span style={{
                        background: cap.load_percent >= 90 ? "#fef2f2" : cap.load_percent >= 70 ? "#fffbeb" : "#f0fdf4",
                        color: cap.load_percent >= 90 ? "#b91c1c" : cap.load_percent >= 70 ? "#92400e" : "#15803d",
                        border: `1px solid ${cap.load_percent >= 90 ? "#fecaca" : cap.load_percent >= 70 ? "#fde68a" : "#bbf7d0"}`,
                        borderRadius: 20, padding: "2px 8px", fontSize: 11,
                      }}>
                        📊 {Math.round(cap.load_percent)}% load
                      </span>
                    )}
                  </div>
                </div>

                {/* Right: Role selector + remove */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  {m.is_owner ? (
                    <RoleBadge role="manager" />
                  ) : (
                    <select
                      className="member-role-select"
                      value={m.role || "member"}
                      onChange={e => handleRoleChange(m.member_record_id, e.target.value)}
                      disabled={changingRole === m.member_record_id}
                    >
                      {ROLES.map(r => <option key={r.value} value={r.value}>{r.icon} {r.label}</option>)}
                    </select>
                  )}
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
              </div>
            );
          })}
        </div>
      )}

      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}
    </div>
  );
}
