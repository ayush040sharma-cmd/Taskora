import { useState } from "react";
import { AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import StatCard from "../components/ui/StatCard";
import { Users, TrendingUp, Activity, Target } from "lucide-react";

const TT = { backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: 8, color: "#f1f5f9", fontSize: 12 };

const genData = (n, keys) =>
  Array.from({ length: n }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (n - 1 - i));
    const obj = { date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) };
    keys.forEach(({ k, base, v }) => { obj[k] = Math.max(1, Math.floor(base + (Math.random() - 0.4) * v)); });
    return obj;
  });

const TABS = ["Daily", "Weekly", "Monthly"];

export default function Analytics() {
  const [tab, setTab] = useState("Daily");
  const n = tab === "Daily" ? 30 : tab === "Weekly" ? 12 : 6;
  const users = genData(n, [{ k: "dau", base: 45, v: 20 }, { k: "mau", base: 180, v: 40 }]);
  const tasks = genData(n, [{ k: "created", base: 28, v: 15 }, { k: "completed", base: 20, v: 12 }]);
  const retention = genData(n, [{ k: "rate", base: 72, v: 12 }]);

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="DAU"         value="47"   icon={Users}      iconColor="text-indigo-400" change="+8% today" changeType="up" />
        <StatCard title="MAU"         value="184"  icon={Activity}   iconColor="text-emerald-400" change="+12% this month" changeType="up" />
        <StatCard title="DAU/MAU"     value="25.5%" icon={TrendingUp} iconColor="text-violet-400" change="-2% vs last week" changeType="down" />
        <StatCard title="Avg Tasks/User" value="6.3" icon={Target}  iconColor="text-amber-400" change="+1.1 vs last month" changeType="up" />
      </div>

      {/* Tab */}
      <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1 w-fit">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === t ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"}`}>
            {t}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-100 mb-4">Active Users (DAU / MAU)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={users}>
              <defs>
                <linearGradient id="dauGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="mauGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} interval={Math.floor(n/5)} />
              <YAxis tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={TT} />
              <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
              <Area type="monotone" dataKey="dau" stroke="#6366f1" fill="url(#dauGrad)" strokeWidth={2} dot={false} name="DAU" />
              <Area type="monotone" dataKey="mau" stroke="#8b5cf6" fill="url(#mauGrad)" strokeWidth={2} dot={false} name="MAU" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-100 mb-4">Tasks Created vs Completed</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={tasks}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} interval={Math.floor(n/5)} />
              <YAxis tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={TT} />
              <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
              <Bar dataKey="created"   fill="#6366f1" radius={[3,3,0,0]} name="Created" />
              <Bar dataKey="completed" fill="#10b981" radius={[3,3,0,0]} name="Completed" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-slate-100 mb-4">Retention Rate (%)</h3>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={retention}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} interval={Math.floor(n/5)} />
            <YAxis tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} domain={[0, 100]} />
            <Tooltip contentStyle={TT} formatter={(v) => [`${v}%`, "Retention"]} />
            <Line type="monotone" dataKey="rate" stroke="#06b6d4" strokeWidth={2} dot={false} name="Retention %" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
