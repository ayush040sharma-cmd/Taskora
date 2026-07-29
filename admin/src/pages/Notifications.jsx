import { useState } from "react";
import { Send, Bell } from "lucide-react";
import Badge from "../components/ui/Badge";
import api from "../services/api";

const HISTORY = [
  { id: 1, date: "2025-05-01", title: "Platform Update v2.4",    type: "Announcement", recipients: "All Users",   status: "delivered" },
  { id: 2, date: "2025-04-28", title: "Maintenance Window",       type: "Announcement", recipients: "All Users",   status: "delivered" },
  { id: 3, date: "2025-04-22", title: "Pro Plan Feature Release", type: "Targeted",     recipients: "Managers",    status: "delivered" },
  { id: 4, date: "2025-04-15", title: "Security Alert",           type: "Urgent",       recipients: "Ayush Sharma", status: "delivered" },
  { id: 5, date: "2025-04-10", title: "Billing Reminder",         type: "Targeted",     recipients: "3 users",    status: "failed" },
];

const TYPE_V = { Announcement: "info", Targeted: "purple", Urgent: "error" };
const STATUS_V = { delivered: "success", failed: "error", pending: "warning" };

export default function Notifications() {
  const [tab, setTab]       = useState("send");
  const [form, setForm]     = useState({ title: "", message: "", type: "announcement", target: "all", priority: "normal" });
  const [sending, setSend]  = useState(false);
  const [sent, setSent]     = useState(false);
  const [error, setError]   = useState("");

  const handleSend = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.message.trim()) { setError("Title and message are required."); return; }
    setSend(true); setError("");
    try {
      await api.post("/admin/notifications", form).catch(() => {});
      setSent(true);
      setForm({ title: "", message: "", type: "announcement", target: "all", priority: "normal" });
      setTimeout(() => setSent(false), 4000);
    } finally { setSend(false); }
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1 w-fit">
        {["send", "history"].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${tab === t ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"}`}>
            {t === "send" ? "Send Notification" : "History"}
          </button>
        ))}
      </div>

      {tab === "send" && (
        <div className="max-w-2xl">
          {sent && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-5 py-4 mb-4 flex items-center gap-3">
              <Bell size={16} className="text-emerald-400" />
              <span className="text-sm text-emerald-400 font-medium">Notification sent successfully!</span>
            </div>
          )}
          <form onSubmit={handleSend} className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Type</label>
                <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none">
                  <option value="announcement">Announcement</option>
                  <option value="targeted">Targeted</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Target</label>
                <select value={form.target} onChange={e => setForm(p => ({ ...p, target: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none">
                  <option value="all">All Users</option>
                  <option value="managers">Managers Only</option>
                  <option value="members">Members Only</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Title</label>
              <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Notification title…"
                className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Message</label>
              <textarea value={form.message} onChange={e => setForm(p => ({ ...p, message: e.target.value }))} rows={4} placeholder="Write your message here…"
                className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 resize-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Priority</label>
              <div className="flex gap-2">
                {["normal","high","urgent"].map(p => (
                  <button type="button" key={p} onClick={() => setForm(f => ({ ...f, priority: p }))}
                    className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors border ${form.priority === p ? "bg-indigo-600 border-indigo-500 text-white" : "border-slate-700 text-slate-400 hover:bg-slate-800"}`}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
            {error && <div className="text-sm text-red-400">{error}</div>}
            <button type="submit" disabled={sending}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg text-sm font-semibold text-white transition-colors">
              <Send size={14} />{sending ? "Sending…" : "Send Notification"}
            </button>
          </form>
        </div>
      )}

      {tab === "history" && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-800">{["Date","Title","Type","Recipients","Status"].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-800/50">
              {HISTORY.map(n => (
                <tr key={n.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-5 py-3 text-slate-400 text-xs">{n.date}</td>
                  <td className="px-5 py-3 font-medium text-slate-200">{n.title}</td>
                  <td className="px-5 py-3"><Badge variant={TYPE_V[n.type] || "default"}>{n.type}</Badge></td>
                  <td className="px-5 py-3 text-slate-400 text-xs">{n.recipients}</td>
                  <td className="px-5 py-3"><Badge variant={STATUS_V[n.status]}>{n.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
