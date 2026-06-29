import { useState, useEffect, useCallback } from "react";
import api from "../api/api";

const TEAM_COLORS = [
  "#6366f1", "#8b5cf6", "#06b6d4", "#10b981",
  "#f59e0b", "#ef4444", "#ec4899", "#0ea5e9",
];

const TEAM_ICONS = ["👥", "⚙", "🛡", "🚀", "📊", "🎯", "💡", "🔧", "📱", "🌐"];

// ── Color picker ──────────────────────────────────────────────────────────────
function ColorPicker({ value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {TEAM_COLORS.map(c => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          style={{
            width: 28, height: 28, borderRadius: "50%", background: c,
            border: value === c ? "3px solid #fff" : "3px solid transparent",
            cursor: "pointer", outline: value === c ? `2px solid ${c}` : "none",
          }}
        />
      ))}
    </div>
  );
}

// ── Icon picker ───────────────────────────────────────────────────────────────
function IconPicker({ value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {TEAM_ICONS.map(ic => (
        <button
          key={ic}
          type="button"
          onClick={() => onChange(ic)}
          style={{
            width: 36, height: 36, borderRadius: 8, fontSize: 18,
            background: value === ic ? "#334155" : "#1e293b",
            border: value === ic ? "1px solid #6366f1" : "1px solid #334155",
            cursor: "pointer",
          }}
        >
          {ic}
        </button>
      ))}
    </div>
  );
}

// ── Team modal ────────────────────────────────────────────────────────────────
function TeamModal({ team, workspaceId, onClose, onSaved }) {
  const [name, setName]           = useState(team?.name || "");
  const [description, setDesc]    = useState(team?.description || "");
  const [color, setColor]         = useState(team?.color || "#6366f1");
  const [icon, setIcon]           = useState(team?.icon || "👥");
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState(null);

  const save = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setError("Team name is required"); return; }
    setSaving(true); setError(null);
    try {
      if (team?.id) {
        const { data } = await api.put(`/teams/${team.id}`, { name: name.trim(), description, color, icon });
        onSaved(data, "update");
      } else {
        const { data } = await api.post("/teams", { workspace_id: workspaceId, name: name.trim(), description, color, icon });
        onSaved(data, "create");
      }
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save team");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9000,
      display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={onClose}>
      <form onSubmit={save} onClick={e => e.stopPropagation()} style={{
        background: "#1e293b", borderRadius: 16, padding: 28, width: 440,
        maxWidth: "95vw", border: "1px solid #334155", display: "flex", flexDirection: "column", gap: 16,
      }}>
        <h3 style={{ color: "#f1f5f9", margin: 0, fontSize: 18 }}>
          {team?.id ? "Edit team" : "Create team"}
        </h3>

        {error && (
          <div style={{ background: "#7f1d1d22", border: "1px solid #ef4444", borderRadius: 8, padding: "8px 12px", color: "#fca5a5", fontSize: 13 }}>
            {error}
          </div>
        )}

        <div>
          <label style={{ color: "#94a3b8", fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>Team name *</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Engineering, QA, Marketing"
            style={{
              width: "100%", background: "#0f172a", border: "1px solid #334155",
              borderRadius: 8, padding: "10px 12px", color: "#f1f5f9", fontSize: 14, boxSizing: "border-box",
            }}
            autoFocus
          />
        </div>

        <div>
          <label style={{ color: "#94a3b8", fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>Description</label>
          <textarea
            value={description}
            onChange={e => setDesc(e.target.value)}
            placeholder="What does this team do?"
            rows={2}
            style={{
              width: "100%", background: "#0f172a", border: "1px solid #334155",
              borderRadius: 8, padding: "10px 12px", color: "#f1f5f9", fontSize: 14,
              resize: "none", boxSizing: "border-box",
            }}
          />
        </div>

        <div>
          <label style={{ color: "#94a3b8", fontSize: 12, fontWeight: 600, display: "block", marginBottom: 8 }}>Color</label>
          <ColorPicker value={color} onChange={setColor} />
        </div>

        <div>
          <label style={{ color: "#94a3b8", fontSize: 12, fontWeight: 600, display: "block", marginBottom: 8 }}>Icon</label>
          <IconPicker value={icon} onChange={setIcon} />
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} style={{
            background: "#334155", border: "none", borderRadius: 8, padding: "10px 20px",
            color: "#94a3b8", fontSize: 14, cursor: "pointer",
          }}>Cancel</button>
          <button type="submit" disabled={saving} style={{
            background: color, border: "none", borderRadius: 8, padding: "10px 20px",
            color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", opacity: saving ? 0.7 : 1,
          }}>
            {saving ? "Saving…" : team?.id ? "Save changes" : "Create team"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Members modal ─────────────────────────────────────────────────────────────
function TeamMembersModal({ team, workspaceMembers, onClose, onUpdated }) {
  const [members, setMembers]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [addingId, setAddingId]   = useState("");
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState(null);

  const loadMembers = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/teams/${team.id}/members`);
      setMembers(data);
    } catch {}
    setLoading(false);
  }, [team.id]);

  useEffect(() => { loadMembers(); }, [loadMembers]);

  const addMember = async () => {
    if (!addingId) return;
    setSaving(true); setError(null);
    try {
      await api.post(`/teams/${team.id}/members`, { user_id: parseInt(addingId), role: "member" });
      setAddingId("");
      await loadMembers();
      onUpdated();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to add member");
    } finally {
      setSaving(false);
    }
  };

  const removeMember = async (userId) => {
    try {
      await api.delete(`/teams/${team.id}/members/${userId}`);
      setMembers(m => m.filter(x => x.user_id !== userId));
      onUpdated();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to remove member");
    }
  };

  const toggleRole = async (userId, currentRole) => {
    const newRole = currentRole === "lead" ? "member" : "lead";
    try {
      await api.put(`/teams/${team.id}/members/${userId}`, { role: newRole });
      setMembers(m => m.map(x => x.user_id === userId ? { ...x, role: newRole } : x));
    } catch (err) {
      setError(err.response?.data?.message || "Failed to update role");
    }
  };

  const memberIds = new Set(members.map(m => m.user_id));
  const available = workspaceMembers.filter(m => !memberIds.has(m.user_id));

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9000,
      display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#1e293b", borderRadius: 16, padding: 28, width: 480,
        maxWidth: "95vw", border: "1px solid #334155", maxHeight: "80vh",
        display: "flex", flexDirection: "column", gap: 16,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 24 }}>{team.icon || "👥"}</span>
          <h3 style={{ color: "#f1f5f9", margin: 0, fontSize: 18 }}>{team.name} — Members</h3>
          <button onClick={onClose} style={{
            marginLeft: "auto", background: "none", border: "none",
            color: "#64748b", fontSize: 18, cursor: "pointer",
          }}>✕</button>
        </div>

        {error && (
          <div style={{ background: "#7f1d1d22", border: "1px solid #ef4444", borderRadius: 8, padding: "8px 12px", color: "#fca5a5", fontSize: 13 }}>
            {error}
          </div>
        )}

        {/* Add member */}
        {available.length > 0 && (
          <div style={{ display: "flex", gap: 8 }}>
            <select
              value={addingId}
              onChange={e => setAddingId(e.target.value)}
              style={{
                flex: 1, background: "#0f172a", border: "1px solid #334155",
                borderRadius: 8, padding: "8px 12px", color: "#f1f5f9", fontSize: 14,
              }}
            >
              <option value="">Select workspace member…</option>
              {available.map(m => (
                <option key={m.user_id} value={m.user_id}>{m.name} ({m.email})</option>
              ))}
            </select>
            <button
              onClick={addMember}
              disabled={!addingId || saving}
              style={{
                background: team.color || "#6366f1", border: "none", borderRadius: 8,
                padding: "8px 16px", color: "#fff", fontWeight: 700, cursor: "pointer",
                opacity: (!addingId || saving) ? 0.5 : 1,
              }}
            >
              {saving ? "…" : "Add"}
            </button>
          </div>
        )}

        {/* Member list */}
        <div style={{ overflowY: "auto", flex: 1 }}>
          {loading ? (
            <div style={{ textAlign: "center", color: "#64748b", padding: 24 }}>Loading…</div>
          ) : members.length === 0 ? (
            <div style={{ textAlign: "center", color: "#64748b", padding: 24 }}>No members yet</div>
          ) : (
            members.map(m => (
              <div key={m.user_id} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "12px 0", borderBottom: "1px solid #1e293b",
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                  background: team.color || "#6366f1",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#fff", fontWeight: 700, fontSize: 14,
                }}>
                  {(m.name || "?")[0].toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ color: "#e2e8f0", fontWeight: 500, fontSize: 14 }}>{m.name}</div>
                  <div style={{ color: "#64748b", fontSize: 12 }}>{m.email}</div>
                </div>
                <button
                  onClick={() => toggleRole(m.user_id, m.role)}
                  style={{
                    background: m.role === "lead" ? "#6366f122" : "#334155",
                    border: m.role === "lead" ? "1px solid #6366f1" : "1px solid transparent",
                    borderRadius: 6, padding: "3px 10px", color: m.role === "lead" ? "#6366f1" : "#94a3b8",
                    fontSize: 11, fontWeight: 700, cursor: "pointer", textTransform: "uppercase",
                  }}
                >
                  {m.role === "lead" ? "Lead" : "Member"}
                </button>
                <button
                  onClick={() => removeMember(m.user_id)}
                  style={{
                    background: "none", border: "none", color: "#ef444488",
                    cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "4px",
                  }}
                  title="Remove from team"
                >✕</button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── Team card ─────────────────────────────────────────────────────────────────
function TeamCard({ team, onEdit, onDelete, onManageMembers }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: "#1e293b", borderRadius: 12, padding: 20,
        border: `1px solid ${hover ? team.color : "#334155"}`,
        transition: "border-color 0.2s, transform 0.15s",
        transform: hover ? "translateY(-2px)" : "none",
        cursor: "default",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 10, background: team.color + "22",
          border: `1px solid ${team.color}44`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 22, flexShrink: 0,
        }}>
          {team.icon || "👥"}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: "#f1f5f9", fontWeight: 700, fontSize: 15 }}>{team.name}</div>
          {team.description && (
            <div style={{ color: "#64748b", fontSize: 12, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {team.description}
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
            <span style={{
              background: team.color + "22", color: team.color,
              fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
              border: `1px solid ${team.color}44`,
            }}>
              {team.member_count || 0} member{team.member_count !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, marginTop: 14, justifyContent: "flex-end" }}>
        <button onClick={() => onManageMembers(team)} style={{
          background: "#334155", border: "none", borderRadius: 6,
          padding: "5px 12px", color: "#94a3b8", fontSize: 12, cursor: "pointer",
        }}>
          Members
        </button>
        <button onClick={() => onEdit(team)} style={{
          background: "#334155", border: "none", borderRadius: 6,
          padding: "5px 12px", color: "#94a3b8", fontSize: 12, cursor: "pointer",
        }}>
          Edit
        </button>
        <button onClick={() => onDelete(team)} style={{
          background: "#7f1d1d22", border: "1px solid #ef444422", borderRadius: 6,
          padding: "5px 12px", color: "#ef4444", fontSize: 12, cursor: "pointer",
        }}>
          Delete
        </button>
      </div>
    </div>
  );
}

// ── Main Teams Panel ──────────────────────────────────────────────────────────
export default function TeamsPanel({ workspaceId }) {
  const [teams, setTeams]               = useState([]);
  const [wsMembers, setWsMembers]       = useState([]);
  const [loading, setLoading]           = useState(true);
  const [showCreate, setShowCreate]     = useState(false);
  const [editTeam, setEditTeam]         = useState(null);
  const [membersTeam, setMembersTeam]   = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [toast, setToast]               = useState(null);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const [teamsRes, membersRes] = await Promise.all([
        api.get(`/teams?workspace_id=${workspaceId}`),
        api.get(`/members?workspace_id=${workspaceId}`),
      ]);
      setTeams(teamsRes.data);
      setWsMembers(membersRes.data);
    } catch (err) {
      console.error("Load teams error:", err);
    }
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => { load(); }, [load]);

  const handleSaved = (savedTeam, mode) => {
    if (mode === "create") {
      setTeams(prev => [...prev, savedTeam]);
      showToast("Team created");
    } else {
      setTeams(prev => prev.map(t => t.id === savedTeam.id ? { ...t, ...savedTeam } : t));
      showToast("Team updated");
    }
    setEditTeam(null);
    setShowCreate(false);
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await api.delete(`/teams/${deleteConfirm.id}`);
      setTeams(prev => prev.filter(t => t.id !== deleteConfirm.id));
      showToast("Team deleted");
    } catch (err) {
      showToast(err.response?.data?.message || "Failed to delete team", "error");
    }
    setDeleteConfirm(null);
  };

  return (
    <div style={{ padding: "0 0 40px", position: "relative" }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 9999,
          background: toast.type === "error" ? "#7f1d1d" : "#14532d",
          border: `1px solid ${toast.type === "error" ? "#ef4444" : "#22c55e"}`,
          borderRadius: 10, padding: "12px 20px", color: "#fff", fontSize: 14, fontWeight: 600,
        }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h2 style={{ color: "#f1f5f9", fontSize: 22, fontWeight: 800, margin: 0 }}>Teams</h2>
          <p style={{ color: "#64748b", fontSize: 14, margin: "4px 0 0" }}>
            Organize workspace members into functional teams
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          style={{
            background: "#6366f1", border: "none", borderRadius: 10,
            padding: "10px 20px", color: "#fff", fontWeight: 700,
            fontSize: 14, cursor: "pointer",
          }}
        >
          + New Team
        </button>
      </div>

      {/* Team grid */}
      {loading ? (
        <div style={{ textAlign: "center", color: "#64748b", padding: 60 }}>Loading teams…</div>
      ) : teams.length === 0 ? (
        <div style={{
          textAlign: "center", padding: "60px 20px",
          background: "#1e293b", borderRadius: 16, border: "1px dashed #334155",
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🏢</div>
          <h3 style={{ color: "#e2e8f0", fontSize: 18, fontWeight: 700, margin: "0 0 8px" }}>No teams yet</h3>
          <p style={{ color: "#64748b", margin: "0 0 24px" }}>
            Create teams to organize your workspace members by function.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            style={{
              background: "#6366f1", border: "none", borderRadius: 10,
              padding: "12px 24px", color: "#fff", fontWeight: 700,
              fontSize: 14, cursor: "pointer",
            }}
          >
            Create first team
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
          {teams.map(team => (
            <TeamCard
              key={team.id}
              team={team}
              onEdit={t => setEditTeam(t)}
              onDelete={t => setDeleteConfirm(t)}
              onManageMembers={t => setMembersTeam(t)}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {(showCreate || editTeam) && (
        <TeamModal
          team={editTeam}
          workspaceId={workspaceId}
          onClose={() => { setShowCreate(false); setEditTeam(null); }}
          onSaved={handleSaved}
        />
      )}

      {membersTeam && (
        <TeamMembersModal
          team={membersTeam}
          workspaceMembers={wsMembers}
          onClose={() => setMembersTeam(null)}
          onUpdated={() => load()}
        />
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9000,
          display: "flex", alignItems: "center", justifyContent: "center",
        }} onClick={() => setDeleteConfirm(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: "#1e293b", borderRadius: 16, padding: 28, width: 360,
            border: "1px solid #7f1d1d",
          }}>
            <h3 style={{ color: "#f1f5f9", margin: "0 0 12px" }}>Delete team?</h3>
            <p style={{ color: "#94a3b8", margin: "0 0 20px", fontSize: 14 }}>
              Deleting <strong>{deleteConfirm.name}</strong> will remove all team assignments from tasks.
              This cannot be undone.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setDeleteConfirm(null)} style={{
                background: "#334155", border: "none", borderRadius: 8,
                padding: "10px 20px", color: "#94a3b8", cursor: "pointer",
              }}>Cancel</button>
              <button onClick={confirmDelete} style={{
                background: "#ef4444", border: "none", borderRadius: 8,
                padding: "10px 20px", color: "#fff", fontWeight: 700, cursor: "pointer",
              }}>Delete team</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
