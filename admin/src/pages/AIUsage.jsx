import { Brain, Zap, DollarSign, AlertCircle } from "lucide-react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import StatCard from "../components/ui/StatCard";

const TT = { backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: 8, color: "#f1f5f9", fontSize: 12 };

const tokenTrend = Array.from({ length: 30 }, (_, i) => ({
  date: new Date(Date.now() - (29 - i) * 86400000).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
  tokens: Math.floor(20000 + Math.random() * 25000),
}));

const costTrend = Array.from({ length: 14 }, (_, i) => ({
  date: new Date(Date.now() - (13 - i) * 86400000).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
  cost: parseFloat((0.3 + Math.random() * 0.8).toFixed(2)),
}));

const userUsage = [
  { name: "Ayush Sharma",   requests: 142, tokens: 284000, cost: "$4.26" },
  { name: "Sarah K.",       requests: 89,  tokens: 178000, cost: "$2.67" },
  { name: "Marcus T.",      requests: 67,  tokens: 134000, cost: "$2.01" },
  { name: "Priya M.",       requests: 54,  tokens: 108000, cost: "$1.62" },
  { name: "Tom W.",         requests: 38,  tokens: 76000,  cost: "$1.14" },
  { name: "Nishant S.",     requests: 29,  tokens: 58000,  cost: "$0.87" },
];

export default function AIUsage() {
  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Tokens"    value="1.24M"   icon={Brain}       iconColor="text-violet-400" change="+18% vs last month" changeType="up" />
        <StatCard title="Est. Cost"       value="$18.40"  icon={DollarSign}  iconColor="text-emerald-400" change="+$2.10 vs last month" changeType="up" />
        <StatCard title="Active AI Users" value="23"      icon={Zap}         iconColor="text-amber-400"  change="+4 new users" changeType="up" />
        <StatCard title="Failed Requests" value="12"      icon={AlertCircle} iconColor="text-red-400"    change="-3 vs last month" changeType="down" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-100 mb-4">Token Usage — Last 30 Days</h3>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={tokenTrend}>
              <defs><linearGradient id="tokGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/><stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} interval={6} />
              <YAxis tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `${Math.floor(v/1000)}k`} />
              <Tooltip contentStyle={TT} formatter={v => [`${v.toLocaleString()}`, "Tokens"]} />
              <Area type="monotone" dataKey="tokens" stroke="#8b5cf6" fill="url(#tokGrad)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-100 mb-4">Daily Cost (USD) — Last 14 Days</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={costTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} interval={2} />
              <YAxis tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `$${v}`} />
              <Tooltip contentStyle={TT} formatter={v => [`$${v}`, "Cost"]} />
              <Bar dataKey="cost" fill="#10b981" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800"><h3 className="text-sm font-semibold text-slate-100">Per-User AI Usage</h3></div>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-800">{["User","AI Requests","Tokens Used","Est. Cost","Usage"].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-800/50">
            {userUsage.map((u, i) => {
              const pct = Math.round((u.requests / userUsage[0].requests) * 100);
              return (
                <tr key={i} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-5 py-3 font-medium text-slate-200">{u.name}</td>
                  <td className="px-5 py-3 text-slate-300">{u.requests}</td>
                  <td className="px-5 py-3 text-slate-300">{u.tokens.toLocaleString()}</td>
                  <td className="px-5 py-3 text-emerald-400 font-semibold">{u.cost}</td>
                  <td className="px-5 py-3 w-40">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden"><div className="h-full bg-violet-500 rounded-full" style={{ width: `${pct}%` }} /></div>
                      <span className="text-xs text-slate-500 w-8">{pct}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
