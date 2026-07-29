import { useState, useEffect, useRef, useCallback } from "react";
import { Shield, RefreshCw, Wifi } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { io } from "socket.io-client";
import StatCard from "../components/ui/StatCard";
import Badge from "../components/ui/Badge";
import api from "../services/api";

const TT = { backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: 8, color: "#f1f5f9", fontSize: 12 };
const SEV_V = { critical: "error", high: "warning", medium: "info", low: "success" };
const THREAT_LABEL = { sql_injection: "SQL Injection", xss: "XSS", path_traversal: "Path Traversal", command_injection: "Cmd Injection", prototype_pollution: "Proto Pollution", malicious_scanner: "Scanner Bot", brute_force: "Brute Force", brute_force_blocked: "BF Blocked", oversized_headers: "Large Headers" };

export default function Security() {
  const [events, setEvents]   = useState([]);
  const [stats, setStats]     = useState(null);
  const [blocked, setBlocked] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState("events");
  const [live, setLive]       = useState(0);
  const [blockForm, setForm]  = useState({ ip: "", reason: "" });
  const socketRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const [ev, st, bl] = await Promise.all([
        api.get("/firewall/events?limit=200"),
        api.get("/firewall/stats"),
        api.get("/firewall/blocked-ips"),
      ]);
      setEvents(ev.data.events || []);
      setStats(st.data);
      setBlocked(bl.data || []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const token = localStorage.getItem("admin_token");
    const socket = io("http://localhost:3001", { auth: { token }, transports: ["websocket"] });
    socketRef.current = socket;
    socket.on("security:threat",   ev  => { setEvents(p => [ev, ...p.slice(0, 299)]); setLive(n => n + 1); });
    socket.on("security:blocked",  ()  => api.get("/firewall/blocked-ips").then(r => setBlocked(r.data)).catch(() => {}));
    socket.on("security:unblocked",()  => api.get("/firewall/blocked-ips").then(r => setBlocked(r.data)).catch(() => {}));
    return () => socket.disconnect();
  }, [load]);

  const handleBlock = async () => {
    if (!blockForm.ip.trim()) return;
    await api.post(`/firewall/block/${encodeURIComponent(blockForm.ip)}`, { reason: blockForm.reason || "Manual block" });
    setForm({ ip: "", reason: "" });
    api.get("/firewall/blocked-ips").then(r => setBlocked(r.data)).catch(() => {});
  };

  const handleUnblock = async (ip) => {
    await api.post(`/firewall/unblock/${encodeURIComponent(ip)}`);
    setBlocked(p => p.filter(b => b.ip !== ip));
  };

  const critCount = stats?.by_severity?.find(s => s.severity === "critical")?.count || 0;
  const highCount = stats?.by_severity?.find(s => s.severity === "high")?.count || 0;
  const hourlyData = (stats?.hourly_trend || []).map(h => ({ time: new Date(h.hour).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), events: h.count }));

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Events"  value={events.length}           icon={Shield} iconColor="text-indigo-400"  loading={loading} />
        <StatCard title="Last 24h"      value={stats?.last_24h || 0}   icon={Shield} iconColor="text-blue-400"    loading={loading} />
        <StatCard title="Critical"      value={critCount}               icon={Shield} iconColor="text-red-400"     loading={loading} />
        <StatCard title="Blocked IPs"   value={blocked.length}          icon={Shield} iconColor="text-violet-400"  loading={loading} />
      </div>

      {/* Live badge + threat breakdown */}
      <div className="flex flex-wrap gap-3 items-center">
        {live > 0 && (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-1.5">
            <Wifi size={12} className="text-red-400 animate-pulse" />
            <span className="text-xs font-semibold text-red-400">LIVE — {live} new threat{live !== 1 ? "s" : ""}</span>
          </div>
        )}
        {stats?.by_type?.map(t => (
          <div key={t.threat_type} className="bg-slate-800 rounded-lg px-3 py-1.5 text-xs">
            <span className="font-semibold text-slate-200">{THREAT_LABEL[t.threat_type] || t.threat_type}</span>
            <span className="text-slate-500 ml-2">{t.count}</span>
          </div>
        ))}
      </div>

      {/* Hourly trend */}
      {hourlyData.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-100 mb-4">Events — Last 24h</h3>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={hourlyData}>
              <defs><linearGradient id="evGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/><stop offset="95%" stopColor="#6366f1" stopOpacity={0}/></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="time" tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={TT} />
              <Area type="monotone" dataKey="events" stroke="#6366f1" fill="url(#evGrad)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 items-center">
        {["events", "blocked"].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"}`}>
            {t === "events" ? `Events (${events.length})` : `Blocked IPs (${blocked.length})`}
          </button>
        ))}
        <button onClick={load} className="ml-auto p-2 rounded-lg border border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"><RefreshCw size={14} /></button>
      </div>

      {/* Events table */}
      {tab === "events" && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-800">{["Time","IP","Type","Severity","Method","URL","Blocked"].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-800/50">
              {events.length === 0 ? <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-500">No events — system is clean ✅</td></tr>
                : events.map((e, i) => (
                <tr key={e.id || i} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-2.5 text-slate-500 text-xs whitespace-nowrap">{new Date(e.timestamp).toLocaleTimeString()}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-red-400">{e.ip}</td>
                  <td className="px-4 py-2.5 font-medium text-slate-200 text-xs">{THREAT_LABEL[e.threat_type] || e.threat_type}</td>
                  <td className="px-4 py-2.5"><Badge variant={SEV_V[e.severity] || "default"}>{e.severity}</Badge></td>
                  <td className="px-4 py-2.5 text-slate-500 text-xs">{e.method}</td>
                  <td className="px-4 py-2.5 text-slate-500 text-xs max-w-[200px] truncate" title={e.url}>{e.url}</td>
                  <td className="px-4 py-2.5">{e.blocked ? <Badge variant="error">Blocked</Badge> : <Badge variant="success">Passed</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Blocked IPs */}
      {tab === "blocked" && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap gap-3 items-end">
            <div><label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">IP Address</label>
              <input value={blockForm.ip} onChange={e => setForm(p => ({ ...p, ip: e.target.value }))} placeholder="192.168.1.1"
                className="px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-indigo-500 w-44" /></div>
            <div><label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Reason</label>
              <input value={blockForm.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} placeholder="Manual block reason"
                className="px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-indigo-500 w-60" /></div>
            <button onClick={handleBlock} className="px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-sm font-semibold text-white transition-colors">Block IP</button>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-800">{["IP","Reason","Blocked By","Blocked At","Expires",""].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-800/50">
                {blocked.length === 0 ? <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-500">No IPs blocked</td></tr>
                  : blocked.map(b => (
                  <tr key={b.ip} className="hover:bg-slate-800/30">
                    <td className="px-4 py-2.5 font-mono text-xs text-red-400 font-bold">{b.ip}</td>
                    <td className="px-4 py-2.5 text-slate-300 text-xs">{b.reason}</td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs">{b.blocked_by}</td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs whitespace-nowrap">{new Date(b.blocked_at).toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs">{b.expires_at ? new Date(b.expires_at).toLocaleString() : "Permanent"}</td>
                    <td className="px-4 py-2.5"><button onClick={() => handleUnblock(b.ip)} className="px-3 py-1 rounded-lg border border-slate-700 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/10 transition-colors">Unblock</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
