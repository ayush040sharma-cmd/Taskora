import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { useAuth } from "../context/AuthContext";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001";

const SCOPE_LABELS = { self: "Self", team: "Team", department: "Dept", project: "Project", org: "Org" };
const SCOPE_ORDER  = ["self","team","department","project","org"];

function Badge({ color, label }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium text-white"
      style={{ backgroundColor: color }}
    >
      {label}
    </span>
  );
}

// ── Users Tab ─────────────────────────────────────────────────────────────────
function UsersTab({ roles }) {
  const { token } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", email: "", password: "" });
  const [assigning, setAssigning] = useState(null); // userId
  const [assignRole, setAssignRole] = useState("");
  const [assignExpiry, setAssignExpiry] = useState("");

  const headers = { Authorization: `Bearer ${token}` };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/api/user-mgmt/users`, { headers });
      setUsers(data);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const filtered = users.filter(u =>
    u.name?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase())
  );

  async function createUser() {
    if (!createForm.name || !createForm.email) return;
    try {
      await axios.post(`${API}/api/user-mgmt/users`, createForm, { headers });
      setShowCreate(false);
      setCreateForm({ name: "", email: "", password: "" });
      load();
    } catch (err) {
      alert(err.response?.data?.message || "Create failed");
    }
  }

  async function toggleStatus(user) {
    const newStatus = user.status === "active" ? "suspended" : "active";
    try {
      await axios.put(`${API}/api/user-mgmt/users/${user.id}`, { status: newStatus }, { headers });
      load();
    } catch (err) {
      alert(err.response?.data?.message || "Update failed");
    }
  }

  async function assignRoleToUser() {
    if (!assignRole) return;
    try {
      await axios.post(
        `${API}/api/user-mgmt/users/${assigning}/roles`,
        { role_id: parseInt(assignRole), expires_at: assignExpiry || undefined },
        { headers }
      );
      setAssigning(null);
      setAssignRole("");
      setAssignExpiry("");
      load();
    } catch (err) {
      alert(err.response?.data?.message || "Assign failed");
    }
  }

  async function removeRole(userId, roleId) {
    try {
      await axios.delete(`${API}/api/user-mgmt/users/${userId}/roles/${roleId}`, { headers });
      load();
    } catch (err) {
      alert(err.response?.data?.message || "Remove failed");
    }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex gap-3 items-center">
        <input
          type="text"
          placeholder="Search users..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 border rounded-lg px-3 py-2 text-sm"
        />
        <button
          onClick={() => setShowCreate(true)}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700"
        >
          + Add User
        </button>
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-96 shadow-xl space-y-4">
            <h3 className="font-semibold text-lg">Create User</h3>
            {["name","email","password"].map(f => (
              <input
                key={f}
                type={f === "password" ? "password" : "text"}
                placeholder={f.charAt(0).toUpperCase() + f.slice(1)}
                value={createForm[f]}
                onChange={e => setCreateForm(p => ({ ...p, [f]: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            ))}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm border rounded-lg">Cancel</button>
              <button onClick={createUser} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg">Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Assign role modal */}
      {assigning && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-80 shadow-xl space-y-4">
            <h3 className="font-semibold text-lg">Assign Role</h3>
            <select
              value={assignRole}
              onChange={e => setAssignRole(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Select role...</option>
              {roles.map(r => (
                <option key={r.id} value={r.id}>{r.display_name}</option>
              ))}
            </select>
            <input
              type="date"
              placeholder="Expires at (optional)"
              value={assignExpiry}
              onChange={e => setAssignExpiry(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setAssigning(null)} className="px-4 py-2 text-sm border rounded-lg">Cancel</button>
              <button onClick={assignRoleToUser} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg">Assign</button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="text-center text-gray-400 py-12">Loading users...</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
              <tr>
                {["User","Roles","Status","Actions"].map(h => (
                  <th key={h} className="text-left px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(u => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{u.name}</div>
                    <div className="text-gray-400 text-xs">{u.email}</div>
                    {u.job_title && <div className="text-gray-400 text-xs">{u.job_title}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(u.roles || []).map(r => (
                        <span
                          key={r.id}
                          className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full text-white"
                          style={{ backgroundColor: r.color || "#6366f1" }}
                        >
                          {r.display_name}
                          <button
                            onClick={() => removeRole(u.id, r.id)}
                            className="opacity-70 hover:opacity-100 text-white leading-none"
                          >×</button>
                        </span>
                      ))}
                      <button
                        onClick={() => setAssigning(u.id)}
                        className="text-xs text-indigo-600 hover:underline"
                      >+ assign</button>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      u.status === "active"
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-600"
                    }`}>
                      {u.status || "active"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleStatus(u)}
                      className="text-xs text-gray-500 hover:text-gray-800 underline"
                    >
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
  const { token } = useAuth();
  const headers = { Authorization: `Bearer ${token}` };
  const [editingRole, setEditingRole] = useState(null); // full role with permissions
  const [editPerms, setEditPerms]     = useState({});   // permKey → scope
  const [showCreate, setShowCreate]   = useState(false);
  const [createForm, setCreateForm]   = useState({ display_name: "", description: "", color: "#6366f1" });
  const [cloneSource, setCloneSource] = useState(null);
  const [cloneName, setCloneName]     = useState("");
  const [saving, setSaving]           = useState(false);

  const modules = [...new Set(catalog.map(p => p.module))].sort();

  async function openEdit(role) {
    try {
      const { data } = await axios.get(`${API}/api/roles/${role.id}`, { headers });
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
      await axios.put(`${API}/api/roles/${editingRole.id}/permissions`, { permissions }, { headers });
      setEditingRole(null);
      reload();
    } catch (err) {
      alert(err.response?.data?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function createRole() {
    if (!createForm.display_name) return;
    try {
      await axios.post(`${API}/api/roles`, createForm, { headers });
      setShowCreate(false);
      setCreateForm({ display_name: "", description: "", color: "#6366f1" });
      reload();
    } catch (err) {
      alert(err.response?.data?.message || "Create failed");
    }
  }

  async function cloneRole() {
    if (!cloneName || !cloneSource) return;
    try {
      await axios.post(`${API}/api/roles/${cloneSource.id}/clone`, { display_name: cloneName }, { headers });
      setCloneSource(null);
      setCloneName("");
      reload();
    } catch (err) {
      alert(err.response?.data?.message || "Clone failed");
    }
  }

  async function deleteRole(role) {
    if (!window.confirm(`Delete role "${role.display_name}"?`)) return;
    try {
      await axios.delete(`${API}/api/roles/${role.id}`, { headers });
      reload();
    } catch (err) {
      alert(err.response?.data?.message || "Delete failed");
    }
  }

  function togglePerm(key) {
    setEditPerms(prev => {
      const next = { ...prev };
      if (next[key]) {
        delete next[key];
      } else {
        next[key] = "self";
      }
      return next;
    });
  }

  function setScope(key, scope) {
    setEditPerms(prev => ({ ...prev, [key]: scope }));
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          onClick={() => setShowCreate(true)}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700"
        >
          + Create Role
        </button>
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-96 shadow-xl space-y-4">
            <h3 className="font-semibold text-lg">Create Custom Role</h3>
            <input
              placeholder="Display name"
              value={createForm.display_name}
              onChange={e => setCreateForm(p => ({ ...p, display_name: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
            <textarea
              placeholder="Description (optional)"
              value={createForm.description}
              onChange={e => setCreateForm(p => ({ ...p, description: e.target.value }))}
              rows={2}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
            <div className="flex items-center gap-3">
              <label className="text-sm text-gray-600">Color</label>
              <input
                type="color"
                value={createForm.color}
                onChange={e => setCreateForm(p => ({ ...p, color: e.target.value }))}
                className="w-10 h-8 rounded cursor-pointer"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm border rounded-lg">Cancel</button>
              <button onClick={createRole} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg">Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Clone modal */}
      {cloneSource && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-80 shadow-xl space-y-4">
            <h3 className="font-semibold text-lg">Clone "{cloneSource.display_name}"</h3>
            <input
              placeholder="New role name"
              value={cloneName}
              onChange={e => setCloneName(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setCloneSource(null)} className="px-4 py-2 text-sm border rounded-lg">Cancel</button>
              <button onClick={cloneRole} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg">Clone</button>
            </div>
          </div>
        </div>
      )}

      {/* Permission matrix editor */}
      {editingRole && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="font-semibold text-lg">
                Permissions for <span style={{ color: editingRole.color }}>{editingRole.display_name}</span>
              </h3>
              <button onClick={() => setEditingRole(null)} className="text-gray-400 hover:text-gray-700 text-xl">×</button>
            </div>
            <div className="overflow-auto flex-1 p-4 space-y-6">
              {modules.map(mod => {
                const perms = catalog.filter(p => p.module === mod);
                return (
                  <div key={mod}>
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                      {mod.replace(/_/g, " ")}
                    </div>
                    <div className="space-y-1">
                      {perms.map(p => {
                        const granted = p.key in editPerms;
                        const scope   = editPerms[p.key] || "self";
                        return (
                          <div key={p.key} className="flex items-center gap-4 py-1.5 px-2 rounded hover:bg-gray-50">
                            <input
                              type="checkbox"
                              checked={granted}
                              onChange={() => togglePerm(p.key)}
                              className="rounded"
                            />
                            <span className="text-sm flex-1 text-gray-700">{p.label}</span>
                            {granted && (
                              <div className="flex gap-1">
                                {SCOPE_ORDER.map(s => (
                                  <button
                                    key={s}
                                    onClick={() => setScope(p.key, s)}
                                    className={`text-xs px-2 py-0.5 rounded border transition ${
                                      scope === s
                                        ? "bg-indigo-600 text-white border-indigo-600"
                                        : "text-gray-500 border-gray-200 hover:border-indigo-400"
                                    }`}
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
            <div className="px-6 py-4 border-t flex justify-end gap-2">
              <button onClick={() => setEditingRole(null)} className="px-4 py-2 text-sm border rounded-lg">Cancel</button>
              <button
                onClick={savePermissions}
                disabled={saving}
                className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Permissions"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Roles grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {roles.map(role => (
          <div key={role.id} className="border rounded-xl p-4 space-y-3 hover:shadow-sm">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: role.color }} />
                <div>
                  <div className="font-medium text-gray-900 text-sm">{role.display_name}</div>
                  {role.is_system && (
                    <span className="text-xs text-gray-400">System</span>
                  )}
                </div>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => openEdit(role)}
                  className="text-xs text-indigo-600 hover:underline"
                >
                  Edit
                </button>
                <span className="text-gray-300">|</span>
                <button
                  onClick={() => { setCloneSource(role); setCloneName(`${role.display_name} Copy`); }}
                  className="text-xs text-gray-500 hover:underline"
                >
                  Clone
                </button>
                {!role.is_system && (
                  <>
                    <span className="text-gray-300">|</span>
                    <button
                      onClick={() => deleteRole(role)}
                      className="text-xs text-red-500 hover:underline"
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            </div>
            {role.description && (
              <p className="text-xs text-gray-500 line-clamp-2">{role.description}</p>
            )}
            <div className="flex gap-4 text-xs text-gray-500">
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
  const { token } = useAuth();
  const [logs, setLogs]   = useState([]);
  const [loading, setLoading] = useState(true);
  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    (async () => {
      try {
        const { data } = await axios.get(`${API}/api/user-mgmt/audit`, { headers });
        setLogs(data);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const ACTION_COLORS = {
    role_created: "bg-green-100 text-green-700",
    role_deleted: "bg-red-100 text-red-600",
    role_assigned: "bg-blue-100 text-blue-700",
    role_removed: "bg-orange-100 text-orange-700",
    override_set: "bg-purple-100 text-purple-700",
    role_permissions_updated: "bg-indigo-100 text-indigo-700",
    user_created: "bg-teal-100 text-teal-700",
    role_cloned: "bg-sky-100 text-sky-700",
    role_updated: "bg-yellow-100 text-yellow-700",
  };

  return (
    <div>
      {loading ? (
        <div className="text-center text-gray-400 py-12">Loading audit log...</div>
      ) : logs.length === 0 ? (
        <div className="text-center text-gray-400 py-12">No audit events yet.</div>
      ) : (
        <div className="space-y-2">
          {logs.map(log => (
            <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg border hover:bg-gray-50">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm text-gray-800">{log.actor_name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ACTION_COLORS[log.action] || "bg-gray-100 text-gray-600"}`}>
                    {log.action.replace(/_/g, " ")}
                  </span>
                  {log.target_user_name && (
                    <span className="text-sm text-gray-600">→ {log.target_user_name}</span>
                  )}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {log.entity_type && <span className="mr-2">{log.entity_type} #{log.entity_id}</span>}
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

// ── Root Component ────────────────────────────────────────────────────────────
export default function AccessControlPanel() {
  const { token } = useAuth();
  const [tab, setTab]         = useState("users");
  const [roles, setRoles]     = useState([]);
  const [catalog, setCatalog] = useState([]);
  const headers = { Authorization: `Bearer ${token}` };

  const loadRoles = useCallback(async () => {
    try {
      const [rolesRes, catalogRes] = await Promise.all([
        axios.get(`${API}/api/roles`, { headers }),
        axios.get(`${API}/api/roles/permissions/all`, { headers }),
      ]);
      setRoles(rolesRes.data);
      setCatalog(catalogRes.data);
    } catch {}
  }, [token]);

  useEffect(() => { loadRoles(); }, [loadRoles]);

  const TABS = [
    { id: "users",   label: "Users" },
    { id: "roles",   label: "Roles & Permissions" },
    { id: "audit",   label: "Audit Log" },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Access Control</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage users, roles, and permissions for your workspace.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex border-b gap-1">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition -mb-px ${
              tab === t.id
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "users" && <UsersTab roles={roles} />}
      {tab === "roles" && <RolesTab roles={roles} catalog={catalog} reload={loadRoles} />}
      {tab === "audit" && <AuditTab />}
    </div>
  );
}
