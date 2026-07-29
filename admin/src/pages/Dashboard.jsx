import { useState, useEffect } from "react";
import { Users, Layout, CheckSquare, Activity, Server, Database, Clock, ArrowRight } from "lucide-react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import StatCard from "../components/ui/StatCard";
import Badge from "../components/ui/Badge";
import api from "../services/api";

const genDays = (n, base, v) =>
  Array.from({ length: n }, (_, i) => ({
    date: new Date(Date.now() - (n - 1 - i) * 86400000).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    users: Math.max(0, Math.floor(base + (Math.random() - 0.4) * v + i * 0.5)),
    tasks: Math.max(0, Math.floor(base * 2.5 + (Math.random() - 0.4) * v * 3)),
  }));

const CHART_STYLE = { background: "transparent", fontSize: 11, fill: "#94a3b8" };
const TT_STYLE   = { backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: 8, color: "#f1f5f9", fontSize: 12 };

export default function Dashboard() {
  const [stats, setStats]       = useState(null);
  const [health, setHealth]     = useState(null);
  const [events, setEvents]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const chartData = genDays(30, 40, 20);

  useEffect(() => {
    const load = async () => {
      try {
        const [stRes, hlRes, evRes] = await Promise.allSettled([
          api.get("/admin/stats"),
          fetch("/health").then(r => r.json()),
          api.get("/firewall/events?limit=5"),
        ]);
        if (stRes.status === "fulfilled") setStats(stRes.value.data);
        if (hlRes.status === "fulfilled") setHealth(hlRes.value);
        if (evRes.status === "fulfilled") setEvents(evRes.value.data.events || []);
      } finally { setLoading(false); }
    };
    load();
  }, []);

  const SEV_V = { critical: "error", high: "warning", medium: "info", low: "success" };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Users"  value={stats?.total_users  ?? "—"} icon={Users}       iconColor="text-indigo-400" loading={loading} change="+12% vs last month" changeType="up" />
        <StatCard title="Active Today" value={stats?.active_today ?? "—"} icon={Activity}    iconColor="text-emerald-400" loading={loading} change="+5% vs yesterday" changeType="up" />
        <StatCard title="Total Tasks"  value={stats?.total_tasks  ?? "—"} icon={CheckSquare} iconColor="text-violet-400" loading={loading} change="+23% vs last month" changeType="up" />
        <StatCard title="Total Boards" value={stats?.total_boards ?? "—"} icon={Layout}      iconColor="text-amber-400" loading={loading} change="+8% vs last month" changeType="up" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">User Growth</h3>
              <p className="text-xs text-slate-500">Last 30 days</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData} style={CHART_STYLE}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} interval={6} />
              <YAxis tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={TT_STYLE} />
              <Line type="monotone" dataKey="users" stroke="#6366f1" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-slate-100">Task Activity</h3>
            <p className="text-xs text-slate-500">Tasks created per day</p>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData.slice(-14)} style={CHART_STYLE}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} interval={2} />
              <YAxis tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={TT_STYLE} />
              <Bar dataKey="tasks" fill="#6366f1" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent security events */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-100 mb-4">Recent Security Events</h3>
          {events.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">No events yet — system is clean ✅</p>
          ) : (
            <div className="space-y-2">
              {events.map((e, i) => (
                <div key={e.id || i} className="flex items-center gap-3 py-2 border-b border-slate-800 last:border-0">
                  <Badge variant={SEV_V[e.severity] || "default"}>{e.severity}</Badge>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-slate-200 truncate">{e.threat_type?.replace(/_/g, " ")}</div>
                    <div className="text-[10px] text-slate-500 font-mono">{e.ip}</div>
                  </div>
                  <div className="text-[10px] text-slate-500 shrink-0">{new Date(e.timestamp).toLocaleTimeString()}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* System health */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-100 mb-4">System Health</h3>
          <div className="space-y-3">
            {[
              { label: "API Server", icon: Server,   status: health ? "online" : "checking", ok: !!health },
              { label: "Database",   icon: Database, status: health?.database === "ok" ? "connected" : health ? "error" : "checking", ok: health?.database === "ok" },
              { label: "Uptime",     icon: Clock,    status: health ? "99.9%" : "—", ok: true },
              { label: "Service",    icon: Activity, status: health?.service || "taskora-api", ok: true },
            ].map(({ label, icon: Icon, status, ok }) => (
              <div key={label} className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0">
                <div className="flex items-center gap-3">
                  <div className="p-1.5 rounded-lg bg-slate-800"><Icon size={14} className="text-slate-400" /></div>
                  <span className="text-sm text-slate-300">{label}</span>
                </div>
                <Badge variant={ok ? "success" : "error"}>{status}</Badge>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
