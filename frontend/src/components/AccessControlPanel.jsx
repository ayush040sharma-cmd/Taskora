import { useState, useEffect, useCallback } from "react";
import api from "../api/api";
import { useAuth } from "../context/AuthContext";

const SCOPE_LABELS = { self: "Self", team: "Team", department: "Dept", project: "Project", org: "Org" };
const SCOPE_ORDER  = ["self","team","department","project","org"];

// ── Shared style tokens ──────────────────────────────────────────────────────
const S = {
  btn: {
    primary: { background: "var(--tk-accent, #3B82F6)", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
    ghost:   { background: "var(--card-bg)", color: "var(--text-primary)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 16px", fontSize: 13, cursor: "pointer" },
    link:    { background: "none", border: "none", color: "var(--tk-accent, #3B82F6)", fontSize: 12, cursor: "pointer", textDecoration: "underline", padding: 0 },
    linkGray:{ background: "none", border: "none", color: "#6b7280", fontSize: 12, cursor: "pointer", textDecoration: "underline", padding: 0 },
    linkRed: { background: "none", border: "none", color: "var(--tk-status-danger, #EF4444)", fontSize: 12, cursor: "pointer", textDecoration: "underline", padding: 0 },
  },
  input: { width: "100%", boxSizing: "border-box", border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 12px", fontSize: 13, outline: "none" },
  badge: {
    green:  { fontSize: 11, padding: "2px 8px", borderRadius: 99, fontWeight: 600, background: "var(--tk-status-ok-bg, rgba(34,197,94,0.15))", color: "var(--tk-status-ok, #22C55E)" },
    red:    { fontSize: 11, padding: "2px 8px", borderRadius: 99, fontWeight: 600, background: "var(--tk-status-danger-bg, rgba(239,68,68,0.15))", color: "var(--tk-status-danger, #EF4444)" },
    blue:   { fontSize: 11, padding: "2px 8px", borderRadius: 99, fontWeight: 600, background: "rgba(59,130,246,0.15)", color: "#60a5fa" },
    purple: { fontSize: 11, padding: "2px 8px", borderRadius: 99, fontWeight: 600, background: "rgba(139,92,246,0.15)", color: "#a78bfa" },
    orange: { fontSize: 11, padding: "2px 8px", borderRadius: 99, fontWeight: 600, background: "rgba(249,115,22,0.15)", color: "#fb923c" },
    sky:    { fontSize: 11, padding: "2px 8px", borderRadius: 99, fontWeight: 600, background: "rgba(14,165,233,0.15)", color: "#38bdf8" },
    yellow: { fontSize: 11, padding: "2px 8px", borderRadius: 99, fontWeight: 600, background: "rgba(234,179,8,0.15)", color: "#eab308" },
    teal:   { fontSize: 11, padding: "2px 8px", borderRadius: 99, fontWeight: 600, background: "rgba(20,184,166,0.15)", color: "#2dd4bf" },
  },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 },
  modal:   { background: "var(--card-bg)", borderRadius: 16, padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,0.5)" },
  card:    { border: "1px solid var(--border)", borderRadius: 12, padding: 16 },
  section: { fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 },
  divider: { borderBottom: "1px solid var(--border)" },
};

const ACTION_BADGE = {
  role_created:              S.badge.green,
  role_deleted:              S.badge.red,
  role_assigned:             S.badge.blue,
  role_removed:              S.badge.orange,
  override_set:              S.badge.purple,
  role_permissions_updated:  S.badge.blue,
  user_created:              S.badge.teal,
  role_cloned:               S.badge.sky,
  role_updated:              S.badge.yellow,
};

// ── Modal wrapper ────────────────────────────────────────────────────────────
function Modal({ onClose, width = 400, children }) {
  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={{ ...S.modal, width, maxWidth: "90vw" }} onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

// ── Users Tab ─────────────────────────────────────────────────────────────────
function UsersTab({ roles }) {
  const [users, setUsers]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", email: "", password: "" });
  const [assigning, setAssigning] = useState(null);
  const [assignRole, setAssignRole] = useState("");
  const [assignExpiry, setAssignExpiry] = useState("");
  const [actionError, setActionError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/user-mgmt/users");
      setUsers(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = users.filter(u =>
    u.name?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase())
  );

  async function createUser() {
    if (!createForm.name || !createForm.email) return;
    setActionError("");
    try {
      await api.post("/user-mgmt/users", createForm);
      setShowCreate(false);
      setCreateForm({ name: "", email: "", password: "" });
      load();
    } catch (err) {
      setActionError(err.response?.data?.message || "Create failed");
    }
  }

  async function toggleStatus(user) {
    const newStatus = user.status === "active" ? "suspended" : "active";
    setActionError("");
    try {
      await api.put(`/user-mgmt/users/${user.id}`, { status: newStatus });
      load();
    } catch (err) {
      setActionError(err.response?.data?.message || "Update failed");
    }
  }

  async function assignRoleToUser() {
    if (!assignRole) return;
    setActionError("");
    try {
      await api.post(
        `/user-mgmt/users/${assigning}/roles`,
        { role_id: parseInt(assignRole), expires_at: assignExpiry || undefined }
      );
      setAssigning(null); setAssignRole(""); setAssignExpiry(""); load();
    } catch (err) {
      setActionError(err.response?.data?.message || "Assign failed");
    }
  }

  async function removeRole(userId, roleId) {
    setActionError("");
    try {
      await api.delete(`/user-mgmt/users/${userId}/roles/${roleId}`);
      load();
    } catch (err) {
      setActionError(err.response?.data?.message || "Remove failed");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {actionError && (
        <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "var(--tk-status-danger, #EF4444)", borderRadius: 8, padding: "8px 12px", fontSize: 13 }}>
          {actionError}
        </div>
      )}
      {/* Toolbar */}
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <input
          type="text"
          placeholder="Search users…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...S.input, flex: 1, width: "auto" }}
        />
        <button onClick={() => setShowCreate(true)} style={S.btn.primary}>+ Add User</button>
      </div>

      {/* Create user modal */}
      {showCreate && (
        <Modal onClose={() => setShowCreate(false)}>
          <h3 style={{ fontWeight: 700, fontSize: 20, margin: "0 0 16px" }}>Create User</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {["name","email","password"].map(f => (
              <input
                key={f}
                type={f === "password" ? "password" : "text"}
                placeholder={f.charAt(0).toUpperCase() + f.slice(1)}
                value={createForm[f]}
                onChange={e => setCreateForm(p => ({ ...p, [f]: e.target.value }))}
                style={S.input}
              />
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
            <button onClick={() => setShowCreate(false)} style={S.btn.ghost}>Cancel</button>
            <button onClick={createUser} style={S.btn.primary}>Create</button>
          </div>
        </Modal>
      )}

      {/* Assign role modal */}
      {assigning && (
        <Modal onClose={() => setAssigning(null)} width={340}>
          <h3 style={{ fontWeight: 700, fontSize: 20, margin: "0 0 16px" }}>Assign Role</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <select
              value={assignRole}
              onChange={e => setAssignRole(e.target.value)}
              style={S.input}
            >
              <option value="">Select role…</option>
              {roles.map(r => (
                <option key={r.id} value={r.id}>{r.display_name}</option>
              ))}
            </select>
            <input
              type="date"
              placeholder="Expires at (optional)"
              value={assignExpiry}
              onChange={e => setAssignExpiry(e.target.value)}
              style={S.input}
            />
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
            <button onClick={() => setAssigning(null)} style={S.btn.ghost}>Cancel</button>
            <button onClick={assignRoleToUser} style={S.btn.primary}>Assign</button>
          </div>
        </Modal>
      )}

      {/* Users table */}
      {loading ? (
        <div style={{ textAlign: "center", color: "#9ca3af", padding: "48px 0" }}>Loading users…</div>
      ) : (
        <div style={{ overflowX: "auto", borderRadius: 8, border: "1px solid #e5e7eb" }}>
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--column-bg)" }}>
                {["User","Roles","Status","Actions"].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "10px 14px", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #e5e7eb" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((u, i) => (
                <tr key={u.id} style={{ borderBottom: i < filtered.length - 1 ? "1px solid #f3f4f6" : "none" }}>
                  <td style={{ padding: "10px 14px" }}>
                    <div style={{ fontWeight: 600, color: "#111827" }}>{u.name}</div>
                    <div style={{ fontSize: 11, color: "#9ca3af" }}>{u.email}</div>
                    {u.job_title && <div style={{ fontSize: 11, color: "#9ca3af" }}>{u.job_title}</div>}
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {(u.roles || []).map(r => (
                        <span
                          key={r.id}
                          style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, padding: "2px 6px", borderRadius: 99, color: "#fff", background: r.color || "var(--tk-accent, #3B82F6)" }}
                        >
                          {r.display_name}
                          <button
                            onClick={() => removeRole(u.id, r.id)}
                            style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", lineHeight: 1, padding: 0, opacity: 0.8, fontSize: 12 }}
                          >×</button>
                        </span>
                      ))}
                      <button onClick={() => setAssigning(u.id)} style={S.btn.link}>+ assign</button>
                    </div>
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    <span style={u.status === "active" ? S.badge.green : S.badge.red}>
                      {u.status || "active"}
                    </span>
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    <button onClick={() => toggleStatus(u)} style={S.btn.linkGray}>
                      {u.status === "active" ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Roles Tab ─────────────────────────────────────────────────────────────────
function RolesTab({ roles, catalog, reload }) {
  const [editingRole, setEditingRole]       = useState(null);
  const [editPerms, setEditPerms]           = useState({});
  const [showCreate, setShowCreate]         = useState(false);
  const [createForm, setCreateForm]         = useState({ display_name: "", description: "", color: "#3B82F6" });
  const [cloneSource, setCloneSource]       = useState(null);
  const [cloneName, setCloneName]           = useState("");
  const [saving, setSaving]                 = useState(false);
  const [confirmDeleteRole, setConfirmDeleteRole] = useState(null);

  const modules = [...new Set(catalog.map(p => p.module))].sort();

  async function openEdit(role) {
    try {
      const { data } = await api.get(`/roles/${role.id}`);
      const map = {};
      data.permissions.forEach(p => { map[p.permission_key] = p.data_scope; });
      setEditPerms(map);
      setEditingRole(data);
    } catch {}
  }

  async function savePermissions() {
    if (!editingRole) return;
    setSaving(true);
    try {
      const permissions = Object.entries(editPerms).map(([key, data_scope]) => ({ key, data_scope }));
      await api.put(`/roles/${editingRole.id}/permissions`, { permissions });
      setEditingRole(null);
      reload();
    } catch (err) {
      console.error("Save permissions failed:", err.response?.data?.message || err.message);
    } finally {
      setSaving(false);
    }
  }

  async function createRole() {
    if (!createForm.display_name) return;
    try {
      const name = createForm.display_name.toLowerCase().replace(/[^a-z0-9_]/g, "_");
      await api.post(`/roles`, { ...createForm, name });
      setShowCreate(false);
      setCreateForm({ display_name: "", description: "", color: "#3B82F6" });
      reload();
    } catch (err) {
      console.error("Create role failed:", err.response?.data?.message || err.message);
    }
  }

  async function cloneRole() {
    if (!cloneName || !cloneSource) return;
    try {
      await api.post(`/roles/${cloneSource.id}/clone`, { display_name: cloneName });
      setCloneSource(null); setCloneName(""); reload();
    } catch (err) {
      console.error("Clone role failed:", err.response?.data?.message || err.message);
    }
  }

  async function deleteRole(role) {
    try {
      await api.delete(`/roles/${role.id}`);
      setConfirmDeleteRole(null);
      reload();
    } catch (err) {
      setConfirmDeleteRole(null);
      console.error("Delete role failed:", err.response?.data?.message || err.message);
    }
  }

  function togglePerm(key) {
    setEditPerms(prev => {
      const next = { ...prev };
      if (next[key]) { delete next[key]; } else { next[key] = "self"; }
      return next;
    });
  }

  function setScope(key, scope) {
    setEditPerms(prev => ({ ...prev, [key]: scope }));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <button onClick={() => setShowCreate(true)} style={S.btn.primary}>+ Create Role</button>
      </div>

      {/* Create modal */}
      {showCreate && (
        <Modal onClose={() => setShowCreate(false)}>
          <h3 style={{ fontWeight: 700, fontSize: 20, margin: "0 0 16px" }}>Create Custom Role</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input
              placeholder="Display name"
              value={createForm.display_name}
              onChange={e => setCreateForm(p => ({ ...p, display_name: e.target.value }))}
              style={S.input}
            />
            <textarea
              placeholder="Description (optional)"
              value={createForm.description}
              onChange={e => setCreateForm(p => ({ ...p, description: e.target.value }))}
              rows={2}
              style={{ ...S.input, resize: "vertical" }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <label style={{ fontSize: 13, color: "#374151" }}>Color</label>
              <input
                type="color"
                value={createForm.color}
                onChange={e => setCreateForm(p => ({ ...p, color: e.target.value }))}
                style={{ width: 40, height: 32, borderRadius: 6, cursor: "pointer", border: "1px solid #e5e7eb", padding: 2 }}
              />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
            <button onClick={() => setShowCreate(false)} style={S.btn.ghost}>Cancel</button>
            <button onClick={createRole} style={S.btn.primary}>Create</button>
          </div>
        </Modal>
      )}

      {/* Clone modal */}
      {cloneSource && (
        <Modal onClose={() => setCloneSource(null)} width={340}>
          <h3 style={{ fontWeight: 700, fontSize: 20, margin: "0 0 16px" }}>Clone "{cloneSource.display_name}"</h3>
          <input
            placeholder="New role name"
            value={cloneName}
            onChange={e => setCloneName(e.target.value)}
            style={{ ...S.input, marginBottom: 16 }}
          />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={() => setCloneSource(null)} style={S.btn.ghost}>Cancel</button>
            <button onClick={cloneRole} style={S.btn.primary}>Clone</button>
          </div>
        </Modal>
      )}

      {/* Permission matrix editor (full-screen modal) */}
      {editingRole && (
        <div style={S.overlay}>
          <div style={{
            background: "var(--card-bg)", borderRadius: 16, boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
            width: "min(860px, 94vw)", maxHeight: "88vh", display: "flex", flexDirection: "column",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", borderBottom: "1px solid var(--border)" }}>
              <h3 style={{ fontWeight: 700, fontSize: 20, margin: 0 }}>
                Permissions for{" "}
                <span style={{ color: editingRole.color }}>{editingRole.display_name}</span>
              </h3>
              <button onClick={() => setEditingRole(null)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#9ca3af" }}>×</button>
            </div>

            <div style={{ overflow: "auto", flex: 1, padding: 20, display: "flex", flexDirection: "column", gap: 24 }}>
              {modules.map(mod => {
                const perms = catalog.filter(p => p.module === mod);
                const moduleLabel = mod === "sidebar_access" ? "Sidebar Views" : mod.replace(/_/g, " ");
                return (
                  <div key={mod}>
                    <div style={S.section}>{moduleLabel}</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      {perms.map(p => {
                        const granted = p.key in editPerms;
                        const scope   = editPerms[p.key] || "self";
                        return (
                          <div key={p.key} style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 8px", borderRadius: 6 }}>
                            <input
                              type="checkbox"
                              checked={granted}
                              onChange={() => togglePerm(p.key)}
                              style={{ cursor: "pointer", width: 14, height: 14, flexShrink: 0 }}
                            />
                            <span style={{ fontSize: 13, flex: 1, color: "#374151" }}>{p.label}</span>
                            {granted && (
                              <div style={{ display: "flex", gap: 4 }}>
                                {SCOPE_ORDER.map(s => (
                                  <button
                                    key={s}
                                    onClick={() => setScope(p.key, s)}
                                    style={scope === s
                                      ? { fontSize: 11, padding: "2px 7px", borderRadius: 4, border: "1px solid var(--tk-accent, #3B82F6)", background: "var(--tk-accent, #3B82F6)", color: "#fff", cursor: "pointer" }
                                      : { fontSize: 11, padding: "2px 7px", borderRadius: 4, border: "1px solid var(--border)", background: "var(--column-bg)", color: "var(--text-secondary)", cursor: "pointer" }
                                    }
                                  >
                                    {SCOPE_LABELS[s]}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ padding: "14px 24px", borderTop: "1px solid #e5e7eb", display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setEditingRole(null)} style={S.btn.ghost}>Cancel</button>
              <button
                onClick={savePermissions}
                disabled={saving}
                style={{ ...S.btn.primary, opacity: saving ? 0.6 : 1 }}
              >
                {saving ? "Saving…" : "Save Permissions"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Roles grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
        {roles.map(role => (
          <div key={role.id} style={S.card}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 12, height: 12, borderRadius: "50%", background: role.color, flexShrink: 0 }} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: "#111827" }}>{role.display_name}</div>
                  {role.is_system && <div style={{ fontSize: 11, color: "#9ca3af" }}>System</div>}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <button onClick={() => openEdit(role)} style={S.btn.link}>Edit</button>
                <span style={{ color: "#e5e7eb", fontSize: 12 }}>|</span>
                <button onClick={() => { setCloneSource(role); setCloneName(`${role.display_name} Copy`); }} style={S.btn.linkGray}>Clone</button>
                {!role.is_system && (
                  <>
                    <span style={{ color: "#e5e7eb", fontSize: 12 }}>|</span>
                    {confirmDeleteRole?.id === role.id ? (
                      <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
                        <button onClick={() => deleteRole(role)} style={{ ...S.btn.linkRed, fontWeight: 700 }}>Confirm</button>
                        <button onClick={() => setConfirmDeleteRole(null)} style={S.btn.linkGray}>Cancel</button>
                      </span>
                    ) : (
                      <button onClick={() => setConfirmDeleteRole(role)} style={S.btn.linkRed}>Delete</button>
                    )}
                  </>
                )}
              </div>
            </div>
            {role.description && (
              <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 8px", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                {role.description}
              </p>
            )}
            <div style={{ display: "flex", gap: 14, fontSize: 12, color: "#6b7280" }}>
              <span>{role.assigned_users ?? 0} users</span>
              <span>{role.permission_count ?? 0} permissions</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Audit Log Tab ─────────────────────────────────────────────────────────────
function AuditTab() {
  const [logs, setLogs]       = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/user-mgmt/audit");
        setLogs(data);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div>
      {loading ? (
        <div style={{ textAlign: "center", color: "#9ca3af", padding: "48px 0" }}>Loading audit log…</div>
      ) : logs.length === 0 ? (
        <div style={{ textAlign: "center", color: "#9ca3af", padding: "48px 0" }}>No audit events yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {logs.map(log => (
            <div key={log.id} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: 12, borderRadius: 8, border: "1px solid #f3f4f6" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 600, fontSize: 13, color: "#111827" }}>{log.actor_name}</span>
                  <span style={ACTION_BADGE[log.action] || S.badge.blue}>
                    {log.action.replace(/_/g, " ")}
                  </span>
                  {log.target_user_name && (
                    <span style={{ fontSize: 13, color: "#374151" }}>→ {log.target_user_name}</span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>
                  {log.entity_type && <span style={{ marginRight: 8 }}>{log.entity_type} #{log.entity_id}</span>}
                  {new Date(log.created_at).toLocaleString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Departments & Teams Tab ───────────────────────────────────────────────────
function DepartmentsTeamsTab() {
  const [depts, setDepts]           = useState([]);
  const [teams, setTeams]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [subTab, setSubTab]         = useState("departments");
  const [showDeptForm, setShowDeptForm] = useState(false);
  const [showTeamForm, setShowTeamForm] = useState(false);
  const [deptForm, setDeptForm]     = useState({ name: "" });
  const [teamForm, setTeamForm]     = useState({ name: "", department_id: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dRes, tRes] = await Promise.all([
        api.get("/user-mgmt/departments"),
        api.get("/user-mgmt/teams"),
      ]);
      setDepts(dRes.data); setTeams(tRes.data);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function createDept() {
    if (!deptForm.name) return;
    try {
      await api.post("/user-mgmt/departments", { workspace_id: 1, name: deptForm.name });
      setShowDeptForm(false); setDeptForm({ name: "" }); load();
    } catch (err) { alert(err.response?.data?.message || "Failed"); }
  }

  async function createTeam() {
    if (!teamForm.name) return;
    try {
      await api.post("/user-mgmt/teams", { workspace_id: 1, name: teamForm.name, department_id: teamForm.department_id || undefined });
      setShowTeamForm(false); setTeamForm({ name: "", department_id: "" }); load();
    } catch (err) { alert(err.response?.data?.message || "Failed"); }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Sub-tabs */}
      <div style={{ display: "flex", gap: 8 }}>
        {[["departments","Departments"],["teams","Teams"]].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setSubTab(id)}
            style={{
              padding: "6px 16px", fontSize: 13, borderRadius: 99, cursor: "pointer",
              background: subTab === id ? "var(--tk-accent, #3B82F6)" : "var(--column-bg)",
              color: subTab === id ? "#fff" : "var(--text-primary)",
              border: subTab === id ? "1px solid var(--tk-accent, #3B82F6)" : "1px solid var(--border)",
              fontWeight: subTab === id ? 600 : 400,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", color: "#9ca3af", padding: "40px 0" }}>Loading…</div>
      ) : subTab === "departments" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button onClick={() => setShowDeptForm(true)} style={S.btn.primary}>+ New Department</button>
          {showDeptForm && (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                placeholder="Department name"
                value={deptForm.name}
                onChange={e => setDeptForm({ name: e.target.value })}
                style={{ ...S.input, flex: 1, width: "auto" }}
              />
              <button onClick={createDept} style={S.btn.primary}>Create</button>
              <button onClick={() => setShowDeptForm(false)} style={S.btn.ghost}>Cancel</button>
            </div>
          )}
          {depts.length === 0 ? (
            <div style={{ textAlign: "center", color: "#9ca3af", padding: "32px 0" }}>No departments yet.</div>
          ) : (
            depts.map(d => (
              <div key={d.id} style={{ ...S.card, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: "#111827" }}>{d.name}</div>
                  {d.head_name && <div style={{ fontSize: 12, color: "#6b7280" }}>Head: {d.head_name}</div>}
                </div>
                <span style={{ fontSize: 11, background: "var(--column-bg)", color: "var(--text-secondary)", borderRadius: 99, padding: "2px 8px" }}>
                  {d.member_count ?? 0} members
                </span>
              </div>
            ))
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button onClick={() => setShowTeamForm(true)} style={S.btn.primary}>+ New Team</button>
          {showTeamForm && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input
                placeholder="Team name"
                value={teamForm.name}
                onChange={e => setTeamForm(p => ({ ...p, name: e.target.value }))}
                style={{ ...S.input, width: 180 }}
              />
              <select
                value={teamForm.department_id}
                onChange={e => setTeamForm(p => ({ ...p, department_id: e.target.value }))}
                style={{ ...S.input, width: "auto" }}
              >
                <option value="">No department</option>
                {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <button onClick={createTeam} style={S.btn.primary}>Create</button>
              <button onClick={() => setShowTeamForm(false)} style={S.btn.ghost}>Cancel</button>
            </div>
          )}
          {teams.length === 0 ? (
            <div style={{ textAlign: "center", color: "#9ca3af", padding: "32px 0" }}>No teams yet.</div>
          ) : (
            teams.map(t => (
              <div key={t.id} style={{ ...S.card, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: "#111827" }}>{t.name}</div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>{t.department_name || "No department"}</div>
                </div>
                <span style={{ fontSize: 11, background: "var(--column-bg)", color: "var(--text-secondary)", borderRadius: 99, padding: "2px 8px" }}>
                  {t.member_count ?? 0} members
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Root Component ────────────────────────────────────────────────────────────
export default function AccessControlPanel({ hideHeader = false }) {
  const { refreshSidebarViews } = useAuth();
  const [tab, setTab]         = useState("users");
  const [roles, setRoles]     = useState([]);
  const [catalog, setCatalog] = useState([]);

  const loadRoles = useCallback(async () => {
    try {
      const [rolesRes, catalogRes] = await Promise.all([
        api.get("/roles"),
        api.get("/roles/permissions/all"),
      ]);
      setRoles(rolesRes.data);
      setCatalog(catalogRes.data);
    } catch {}
  }, []);

  useEffect(() => { loadRoles(); }, [loadRoles]);

  // Refresh sidebar permissions after role changes propagate
  const handleRolesReload = useCallback(() => {
    loadRoles();
    refreshSidebarViews?.();
  }, [loadRoles, refreshSidebarViews]);

  const TABS = [
    { id: "users",  label: "Users" },
    { id: "roles",  label: "Roles & Permissions" },
    { id: "depts",  label: "Departments & Teams" },
    { id: "audit",  label: "Audit Log" },
  ];

  return (
    <div style={hideHeader ? {} : { padding: 24, maxWidth: 900 }}>
      {!hideHeader && (
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontWeight: 800, fontSize: 22, color: "#111827", margin: 0 }}>Access Control</h1>
          <p style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
            Manage users, roles, and permissions for your workspace.
          </p>
        </div>
      )}

      {/* Tab bar */}
      <div style={{ display: "flex", borderBottom: "1px solid #e5e7eb", gap: 0, marginBottom: 20 }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: "10px 18px", fontSize: 13, fontWeight: tab === t.id ? 600 : 400,
              background: "none", border: "none", cursor: "pointer",
              borderBottom: tab === t.id ? "2px solid var(--tk-accent, #3B82F6)" : "2px solid transparent",
              color: tab === t.id ? "var(--tk-accent, #3B82F6)" : "#6b7280",
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "users"  && <UsersTab roles={roles} />}
      {tab === "roles"  && <RolesTab roles={roles} catalog={catalog} reload={handleRolesReload} />}
      {tab === "depts"  && <DepartmentsTeamsTab />}
      {tab === "audit"  && <AuditTab />}
    </div>
  );
}
