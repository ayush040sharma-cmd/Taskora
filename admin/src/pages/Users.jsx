import { useState, useEffect, useMemo } from "react";
import { Search, Download, MoreVertical, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import Badge from "../components/ui/Badge";
import Modal from "../components/ui/Modal";
import StatCard from "../components/ui/StatCard";
import { Users as UsersIcon, UserCheck, UserX, Shield } from "lucide-react";
import api from "../services/api";

const PAGE_SIZE = 10;

function getInitials(name = "") {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2) || "?";
}

function exportCSV(users) {
  const headers = "Name,Email,Role,Status,Last Active,Tasks";
  const rows = users.map(u => `"${u.name}","${u.email}","${u.role}","${u.status || "active"}","${u.last_active || "—"}","${u.tasks_count || 0}"`);
  const csv = [headers, ...rows].join("\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = "taskora_users.csv"; a.click();
}

export default function Users() {
  const [users, setUsers]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [roleFilter, setRole]   = useState("all");
  const [page, setPage]         = useState(1);
  const [modal, setModal]       = useState(null); // { type: "reset"|"role"|"profile", user }
  const [actionUser, setActionUser] = useState(null);
  const [newRole, setNewRole]   = useState("member");
  const [newPw, setNewPw]       = useState("");
  const [saving, setSaving]     = useState(false);
  const [toast, setToast]       = useState("");
  const [openMenu, setOpenMenu] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/users");
      setUsers(Array.isArray(data) ? data : []);
    } catch { setUsers([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  const filtered = useMemo(() => users.filter(u => {
    const q = search.toLowerCase();
    const matchQ = !q || u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
    const matchR = roleFilter === "all" || u.role === roleFilter;
    return matchQ && matchR;
  }), [users, search, roleFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageUsers  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const openModal = (type, user) => { setModal(type); setActionUser(user); setNewRole(user.role); setNewPw(""); setOpenMenu(null); };

  const handleResetPw = async () => {
    setSaving(true);
    try {
      const { data } = await api.post(`/admin/users/${actionUser.id}/reset-password`);
      setNewPw(data.newPassword);
    } finally { setSaving(false); }
  };

  const handleChangeRole = async () => {
    setSaving(true);
    try {
      await api.put(`/admin/users/${actionUser.id}`, { role: newRole });
      setUsers(prev => prev.map(u => u.id === actionUser.id ? { ...u, role: newRole } : u));
      setModal(null);
      showToast(`Role updated to ${newRole}`);
    } finally { setSaving(false); }
  };

  const handleSuspend = async (user) => {
    try {
      const suspend = user.status !== "suspended";
      await api.put(`/admin/users/${user.id}`, { suspended: suspend });
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, status: suspend ? "suspended" : "active" } : u));
      showToast(suspend ? "User suspended" : "User reactivated");
    } catch { showToast("Action failed"); }
    setOpenMenu(null);
  };

  const managerCount   = users.filter(u => u.role === "manager").length;
  const suspendedCount = users.filter(u => u.status === "suspended").length;

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Users"   value={users.length}                        icon={UsersIcon}   iconColor="text-indigo-400" loading={loading} />
        <StatCard title="Managers"      value={managerCount}                        icon={Shield}      iconColor="text-violet-400" loading={loading} />
        <StatCard title="Members"       value={users.length - managerCount}         icon={UserCheck}   iconColor="text-emerald-400" loading={loading} />
        <StatCard title="Suspended"     value={suspendedCount}                      icon={UserX}       iconColor="text-red-400" loading={loading} />
      </div>

      {/* Toolbar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div className="flex gap-3 flex-1 min-w-0">
            <div className="relative flex-1 max-w-xs">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search users…"
                className="w-full pl-8 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500" />
            </div>
            <select value={roleFilter} onChange={e => { setRole(e.target.value); setPage(1); }}
              className="px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-slate-300 focus:outline-none">
              <option value="all">All Roles</option>
              <option value="manager">Manager</option>
              <option value="member">Member</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={load} className="p-2 rounded-lg border border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"><RefreshCw size={15} /></button>
            <button onClick={() => exportCSV(filtered)} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors text-sm"><Download size={14} />CSV</button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800">
              {["User", "Role", "Status", "Last Active", "Tasks", "Actions"].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {loading ? [...Array(5)].map((_, i) => (
              <tr key={i} className="animate-pulse">
                {[...Array(6)].map((_, j) => <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-800 rounded w-24" /></td>)}
              </tr>
            )) : pageUsers.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-500">No users found</td></tr>
            ) : pageUsers.map(u => (
              <tr key={u.id} className="hover:bg-slate-800/40 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-indigo-600/80 flex items-center justify-center text-xs font-bold shrink-0">{getInitials(u.name)}</div>
                    <div>
                      <div className="font-medium text-slate-100">{u.name}</div>
                      <div className="text-xs text-slate-500">{u.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3"><Badge variant={u.role === "manager" ? "purple" : "default"}>{u.role}</Badge></td>
                <td className="px-4 py-3"><Badge variant={u.status === "suspended" ? "error" : "success"}>{u.status || "active"}</Badge></td>
                <td className="px-4 py-3 text-slate-400 text-xs">{u.last_active ? new Date(u.last_active).toLocaleDateString() : "—"}</td>
                <td className="px-4 py-3 text-slate-300">{u.tasks_count ?? 0}</td>
                <td className="px-4 py-3">
                  <div className="relative">
                    <button onClick={() => setOpenMenu(openMenu === u.id ? null : u.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors">
                      <MoreVertical size={15} />
                    </button>
                    {openMenu === u.id && (
                      <div className="absolute right-0 top-full mt-1 w-44 bg-slate-800 border border-slate-700 rounded-xl shadow-xl z-10 overflow-hidden">
                        {[
                          { label: "View Profile",    action: () => openModal("profile", u) },
                          { label: "Reset Password",  action: () => openModal("reset", u) },
                          { label: "Change Role",     action: () => openModal("role", u) },
                          { label: u.status === "suspended" ? "Reactivate" : "Suspend", action: () => handleSuspend(u), cls: "text-amber-400" },
                        ].map(({ label, action, cls }) => (
                          <button key={label} onClick={action}
                            className={`w-full text-left px-4 py-2.5 text-sm hover:bg-slate-700 transition-colors ${cls || "text-slate-300"}`}>
                            {label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination */}
        <div className="px-4 py-3 border-t border-slate-800 flex items-center justify-between">
          <span className="text-xs text-slate-500">{filtered.length} user{filtered.length !== 1 ? "s" : ""}</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="p-1.5 rounded text-slate-400 hover:text-slate-200 disabled:opacity-30 transition-colors"><ChevronLeft size={14} /></button>
            <span className="text-xs text-slate-400">{page} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="p-1.5 rounded text-slate-400 hover:text-slate-200 disabled:opacity-30 transition-colors"><ChevronRight size={14} /></button>
          </div>
        </div>
      </div>

      {/* Profile Modal */}
      <Modal open={modal === "profile"} onClose={() => setModal(null)} title="User Profile" size="sm">
        {actionUser && (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-indigo-600 flex items-center justify-center text-xl font-bold">{getInitials(actionUser.name)}</div>
              <div>
                <div className="font-semibold text-slate-100">{actionUser.name}</div>
                <div className="text-sm text-slate-400">{actionUser.email}</div>
                <Badge variant={actionUser.role === "manager" ? "purple" : "default"} className="mt-1">{actionUser.role}</Badge>
              </div>
            </div>
            {[["Tasks Created", actionUser.tasks_count ?? 0], ["Last Active", actionUser.last_active ? new Date(actionUser.last_active).toLocaleString() : "—"], ["Member Since", actionUser.created_at ? new Date(actionUser.created_at).toLocaleDateString() : "—"]].map(([k, v]) => (
              <div key={k} className="flex justify-between py-2 border-b border-slate-800">
                <span className="text-sm text-slate-400">{k}</span>
                <span className="text-sm text-slate-200">{v}</span>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Reset Password Modal */}
      <Modal open={modal === "reset"} onClose={() => { setModal(null); setNewPw(""); }} title="Reset Password" size="sm"
        footer={!newPw && <button onClick={handleResetPw} disabled={saving} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-semibold text-white disabled:opacity-50">{saving ? "Resetting…" : "Generate New Password"}</button>}>
        {actionUser && (
          newPw ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-400">New password for <strong className="text-slate-200">{actionUser.name}</strong>:</p>
              <div className="bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 font-mono text-lg text-emerald-400 text-center tracking-wider">{newPw}</div>
              <p className="text-xs text-slate-500 text-center">Copy this password — it won't be shown again.</p>
            </div>
          ) : (
            <p className="text-sm text-slate-400">Generate a new random password for <strong className="text-slate-200">{actionUser.name}</strong>? The user will need to be informed manually.</p>
          )
        )}
      </Modal>

      {/* Change Role Modal */}
      <Modal open={modal === "role"} onClose={() => setModal(null)} title="Change Role" size="sm"
        footer={<><button onClick={() => setModal(null)} className="px-4 py-2 rounded-lg border border-slate-700 text-sm text-slate-300 hover:bg-slate-800">Cancel</button><button onClick={handleChangeRole} disabled={saving} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : "Save"}</button></>}>
        {actionUser && (
          <div className="space-y-3">
            <p className="text-sm text-slate-400">Change role for <strong className="text-slate-200">{actionUser.name}</strong>:</p>
            <select value={newRole} onChange={e => setNewRole(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none">
              <option value="manager">Manager (Admin access)</option>
              <option value="member">Member (Standard access)</option>
            </select>
          </div>
        )}
      </Modal>

      {toast && <div className="fixed bottom-6 right-6 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 shadow-xl z-50 animate-fade-in">{toast}</div>}
      {openMenu && <div className="fixed inset-0 z-0" onClick={() => setOpenMenu(null)} />}
    </div>
  );
}
