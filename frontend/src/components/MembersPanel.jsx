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
          background: "rgba(249,115,22,0.15)", color: "#fb923c", border: "1px solid rgba(249,115,22,0.3)",
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
        background: "rgba(239,68,68,0.15)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.3)",
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
function AddMemberForm({ onAdd, onCancel, workspaceId }) {
  const [tab, setTab]         = useState("email"); // "email" | "link"
  const [email, setEmail]     = useState("");
  const [role, setRole]       = useState("member");
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);
  const [inviteLink, setInviteLink] = useState(null);
  const [copied, setCopied]   = useState(false);
  const [invited, setInvited] = useState(null); // { email, email_sent, invite_url, message }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return setError("Email is required");
    setError(""); setLoading(true);
    try {
      await onAdd(email.trim(), role, (data) => setInvited(data));
      setEmail(""); setRole("member");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to add member");
    } finally {
      setLoading(false);
    }
  };

  const generateLink = async () => {
    setLoading(true); setError("");
    try {
      const { data } = await api.post("/members/invite", { workspace_id: workspaceId, role });
      const url = `${window.location.origin}/join/${data.token}`;
      setInviteLink({ url, expires_at: data.expires_at, role: data.role });
    } catch (err) {
      setError(err.response?.data?.message || "Failed to generate invite link");
    } finally {
      setLoading(false);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(inviteLink.url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const tabStyle = (active) => ({
    flex: 1, padding: "7px 0", background: "none", border: "none",
    cursor: "pointer", fontSize: 13, fontWeight: active ? 600 : 400,
    color: active ? "var(--tk-accent, #3B82F6)" : "var(--tk-text-muted, #94A3B8)",
    borderBottom: active ? "2px solid var(--tk-accent, #3B82F6)" : "2px solid transparent",
    transition: "color 0.15s",
  });

  return (
    <div className="member-add-form">
      <div className="member-add-title">Add member to workspace</div>

      {/* Tab switcher */}
      <div style={{ display: "flex", borderBottom: "1px solid var(--tk-border, #e2e8f0)", marginBottom: 14 }}>
        <button type="button" style={tabStyle(tab === "email")} onClick={() => { setTab("email"); setInviteLink(null); setError(""); }}>
          ✉️ By email
        </button>
        <button type="button" style={tabStyle(tab === "link")} onClick={() => { setTab("link"); setInviteLink(null); setError(""); }}>
          🔗 Invite link
        </button>
      </div>

      {error && <div className="auth-error-banner" style={{ marginBottom: 10 }}>{error}</div>}

      {tab === "email" ? (
        invited ? (
          /* ── Invite sent / link fallback ── */
          <div>
            <div style={{
              padding: "16px", borderRadius: 10, marginBottom: 14,
              background: invited.email_sent ? "rgba(34,197,94,0.08)" : "rgba(59,130,246,0.08)",
              border: `1px solid ${invited.email_sent ? "rgba(34,197,94,0.3)" : "rgba(59,130,246,0.3)"}`,
            }}>
              <div style={{ fontSize: 20, marginBottom: 6 }}>{invited.email_sent ? "✉️" : "🔗"}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--tk-text-primary)", marginBottom: 4 }}>
                {invited.email_sent ? "Invite email sent!" : "Share this invite link"}
              </div>
              <div style={{ fontSize: 12, color: "var(--tk-text-muted)", marginBottom: invited.email_sent ? 0 : 10 }}>
                {invited.message}
              </div>
              {!invited.email_sent && invited.invite_url && (
                <div>
                  <div style={{
                    padding: "8px 12px", borderRadius: 6, marginBottom: 8,
                    background: "var(--tk-bg-elevated)", border: "1px solid var(--tk-border)",
                    fontSize: 11, color: "var(--tk-text-secondary)", wordBreak: "break-all",
                  }}>
                    {invited.invite_url}
                  </div>
                  <button
                    onClick={() => { navigator.clipboard.writeText(invited.invite_url); setCopied(true); setTimeout(() => setCopied(false), 2500); }}
                    style={{
                      width: "100%", padding: "8px 0", borderRadius: 8,
                      background: copied ? "var(--tk-status-ok)" : "var(--tk-gradient)",
                      color: "#fff", border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer",
                    }}
                  >
                    {copied ? "✓ Copied!" : "Copy Invite Link"}
                  </button>
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => { setInvited(null); setEmail(""); }}
                style={{
                  flex: 1, padding: "8px 0", borderRadius: 8,
                  background: "var(--tk-gradient)", color: "#fff",
                  border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}
              >
                Invite Another
              </button>
              <button type="button" className="btn-modal-cancel" onClick={onCancel}>Done</button>
            </div>
          </div>
        ) : (
        <form onSubmit={handleSubmit}>
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
          <div style={{ fontSize: 11, color: "var(--tk-text-muted, #94A3B8)", marginBottom: 8 }}>
            💡 Works for both existing Taskora users and new invites — we'll send them an email if they don't have an account yet.
          </div>
          <div className="member-add-actions">
            <button type="button" className="btn-modal-cancel" onClick={onCancel}>Cancel</button>
            <button type="submit" className="btn-modal-submit" disabled={loading}>
              {loading ? "Sending…" : "Add / Invite"}
            </button>
          </div>
        </form>
        )
      ) : (
        <div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "var(--tk-text-muted, #94A3B8)", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 6 }}>
              Role for invited user
            </label>
            <select className="modal-select" value={role} onChange={e => { setRole(e.target.value); setInviteLink(null); }} style={{ width: "100%" }}>
              {ROLES.map(r => <option key={r.value} value={r.value}>{r.icon} {r.label}</option>)}
            </select>
            <div className="member-role-desc">{roleInfo[role]?.desc}</div>
          </div>

          {!inviteLink ? (
            <div className="member-add-actions">
              <button type="button" className="btn-modal-cancel" onClick={onCancel}>Cancel</button>
              <button
                type="button"
                className="btn-modal-submit"
                onClick={generateLink}
                disabled={loading}
              >
                {loading ? "Generating…" : "Generate Invite Link"}
              </button>
            </div>
          ) : (
            <div>
              <div style={{
                padding: "10px 14px", borderRadius: 8,
                background: "var(--tk-bg-elevated, #0F172A)",
                border: "1px solid var(--tk-border, #1E293B)",
                marginBottom: 10,
              }}>
                <div style={{ fontSize: 11, color: "var(--tk-text-muted, #94A3B8)", marginBottom: 4 }}>
                  🔗 Invite link · valid 7 days · {inviteLink.role} access
                </div>
                <div style={{
                  fontSize: 12, color: "var(--tk-text-primary, #E2E8F0)",
                  wordBreak: "break-all", lineHeight: 1.5,
                }}>
                  {inviteLink.url}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={copyLink}
                  style={{
                    flex: 1, padding: "8px 0",
                    background: copied ? "var(--tk-status-ok, #22C55E)" : "var(--tk-gradient, linear-gradient(90deg,#3B82F6,#06B6D4))",
                    color: "#fff", border: "none", borderRadius: 8,
                    fontSize: 13, fontWeight: 600, cursor: "pointer",
                    transition: "background 0.2s",
                  }}
                >
                  {copied ? "✓ Copied!" : "Copy Link"}
                </button>
                <button
                  type="button"
                  onClick={() => { setInviteLink(null); generateLink(); }}
                  title="Generate a new link"
                  style={{
                    padding: "8px 14px", background: "transparent",
                    border: "1px solid var(--tk-border, #1E293B)",
                    borderRadius: 8, fontSize: 12, cursor: "pointer",
                    color: "var(--tk-text-muted, #94A3B8)",
                  }}
                >
                  ↻ New
                </button>
                <button type="button" className="btn-modal-cancel" onClick={onCancel}>Done</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function MembersPanel({ workspaceId }) {
  const [members, setMembers]         = useState([]);
  const [capacities, setCapacities]   = useState({});
  const [loading, setLoading]         = useState(true);
  const [loadError, setLoadError]     = useState("");
  const [showAdd, setShowAdd]         = useState(false);
  const [toast, setToast]             = useState(null);
  const [changingRole, setChangingRole] = useState(null);
  const [searchText, setSearchText]   = useState("");
  const [filterStatus, setFilterStatus] = useState("all"); // all | available | on_leave | travel
  const [confirmRemove, setConfirmRemove] = useState(null); // member object

  const showMsg = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const load = async () => {
    if (!workspaceId) return;
    setLoading(true);
    setLoadError("");
    try {
      const [membersRes, teamCapRes] = await Promise.allSettled([
        api.get(`/members?workspace_id=${workspaceId}`),
        api.get(`/capacity/team/${workspaceId}`),
      ]);

      const memberList = membersRes.status === "fulfilled" ? membersRes.value.data : [];
      setMembers(memberList);

      if (membersRes.status === "rejected") {
        setLoadError("Failed to load members. Please try again.");
      }

      // Build capacity map by user_id for quick lookup
      if (teamCapRes.status === "fulfilled") {
        const capMap = {};
        (teamCapRes.value.data || []).forEach(c => { capMap[c.user_id] = c; });
        setCapacities(capMap);
      }
    } catch (e) {
      console.error(e);
      setLoadError("Failed to load members. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [workspaceId]);

  const handleAdd = async (email, role, onInvited) => {
    const res = await api.post("/members", { workspace_id: workspaceId, email, role });
    if (res.data?.invited) {
      // Non-Taskora user — email invite sent (or link returned if no email service)
      onInvited?.(res.data);
    } else {
      showMsg("Member added successfully");
      setShowAdd(false);
      await load();
    }
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
    try {
      await api.delete(`/members/${member.member_record_id}?workspace_id=${workspaceId}`);
      showMsg(`${member.name} removed`);
      setConfirmRemove(null);
      load();
    } catch (err) {
      showMsg(err.response?.data?.message || "Failed to remove member", "error");
    }
  };

  if (loading) return <div className="wl-loading"><div className="spinner" />Loading members…</div>;

  // Merge capacity info into member records (keep workspace role, not global user role)
  const enrichedMembers = members.map(m => ({
    ...m,
    ...(capacities[m.user_id] || {}),
    role: m.role,
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
      {showAdd && <AddMemberForm onAdd={handleAdd} onCancel={() => setShowAdd(false)} workspaceId={workspaceId} />}

      {/* ── Search + filter bar ── */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center" }}>
        <input
          style={{
            flex: 1, padding: "8px 12px", border: "1.5px solid var(--border)",
            borderRadius: 8, fontSize: 13, outline: "none",
            background: "var(--card-bg)", color: "var(--text-primary)",
          }}
          placeholder="Search by name or email…"
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
        />
        <select
          style={{
            padding: "8px 12px", border: "1px solid var(--border)",
            borderRadius: 8, fontSize: 13, background: "var(--card-bg)", color: "var(--text-primary)",
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

      {/* ── Load error ── */}
      {loadError && (
        <div style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 12 }}>
          {loadError}
        </div>
      )}

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
                        background: cap.load_percent >= 90 ? "rgba(239,68,68,0.15)" : cap.load_percent >= 70 ? "rgba(234,179,8,0.15)" : "rgba(34,197,94,0.15)",
                        color: cap.load_percent >= 90 ? "#ef4444" : cap.load_percent >= 70 ? "#eab308" : "#22c55e",
                        border: `1px solid ${cap.load_percent >= 90 ? "rgba(239,68,68,0.3)" : cap.load_percent >= 70 ? "rgba(234,179,8,0.3)" : "rgba(34,197,94,0.3)"}`,
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
                    confirmRemove?.user_id === m.user_id ? (
                      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                        <button
                          className="member-remove-btn"
                          onClick={() => handleRemove(m)}
                          style={{ color: "#ef4444", fontSize: 11, fontWeight: 700, padding: "3px 7px" }}
                          title="Confirm remove"
                        >Remove</button>
                        <button
                          className="member-remove-btn"
                          onClick={() => setConfirmRemove(null)}
                          style={{ color: "#94a3b8", fontSize: 11, padding: "3px 7px" }}
                          title="Cancel"
                        >Cancel</button>
                      </div>
                    ) : (
                      <button
                        className="member-remove-btn"
                        onClick={() => setConfirmRemove(m)}
                        title="Remove from workspace"
                      >
                        ✕
                      </button>
                    )
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
