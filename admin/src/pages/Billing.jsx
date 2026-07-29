import { DollarSign, CreditCard, TrendingUp, AlertCircle } from "lucide-react";
import { LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import StatCard from "../components/ui/StatCard";
import Badge from "../components/ui/Badge";

const TT = { backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: 8, color: "#f1f5f9", fontSize: 12 };

const revenue = Array.from({ length: 12 }, (_, i) => ({
  month: new Date(2025, i).toLocaleDateString("en-US", { month: "short" }),
  mrr: Math.floor(2000 + i * 200 + Math.random() * 300),
}));

const plans = [
  { name: "Free",       value: 68, color: "#475569" },
  { name: "Pro",        value: 28, color: "#6366f1" },
  { name: "Enterprise", value: 4,  color: "#8b5cf6" },
];

const transactions = [
  { id: 1, date: "2025-05-01", user: "Ayush Sharma",    plan: "Pro",        amount: "$19",  status: "success" },
  { id: 2, date: "2025-04-28", user: "Sarah K.",         plan: "Pro",        amount: "$19",  status: "success" },
  { id: 3, date: "2025-04-25", user: "Acme Corp",        plan: "Enterprise", amount: "$199", status: "success" },
  { id: 4, date: "2025-04-22", user: "Marcus T.",        plan: "Pro",        amount: "$19",  status: "failed" },
  { id: 5, date: "2025-04-20", user: "Priya M.",         plan: "Pro",        amount: "$19",  status: "success" },
  { id: 6, date: "2025-04-18", user: "Tom W.",           plan: "Pro",        amount: "$19",  status: "refunded" },
];

const STATUS_V = { success: "success", failed: "error", refunded: "warning" };

export default function Billing() {
  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="MRR"              value="$4,200"  icon={DollarSign}    iconColor="text-emerald-400" change="+8.3% vs last month" changeType="up" />
        <StatCard title="ARR"              value="$50,400" icon={TrendingUp}    iconColor="text-indigo-400"  change="+8.3% vs last year" changeType="up" />
        <StatCard title="Active Subs"      value="47"      icon={CreditCard}    iconColor="text-violet-400"  change="+3 this month" changeType="up" />
        <StatCard title="Failed Payments"  value="2"       icon={AlertCircle}   iconColor="text-red-400"     change="-1 vs last month" changeType="down" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-100 mb-4">Revenue Trend (MRR)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={revenue}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="month" tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `$${v}`} />
              <Tooltip contentStyle={TT} formatter={v => [`$${v}`, "MRR"]} />
              <Line type="monotone" dataKey="mrr" stroke="#10b981" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-100 mb-4">Plan Distribution</h3>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={plans} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value">
                {plans.map((p, i) => <Cell key={i} fill={p.color} />)}
              </Pie>
              <Tooltip contentStyle={TT} formatter={(v, n) => [`${v}%`, n]} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-2 mt-2">
            {plans.map(p => (
              <div key={p.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full" style={{ background: p.color }} /><span className="text-slate-400">{p.name}</span></div>
                <span className="text-slate-200 font-medium">{p.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Transactions */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800"><h3 className="text-sm font-semibold text-slate-100">Recent Transactions</h3></div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800">
              {["Date", "User", "Plan", "Amount", "Status"].map(h => (
                <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {transactions.map(t => (
              <tr key={t.id} className="hover:bg-slate-800/30 transition-colors">
                <td className="px-5 py-3 text-slate-400 text-xs">{t.date}</td>
                <td className="px-5 py-3 text-slate-200">{t.user}</td>
                <td className="px-5 py-3"><Badge variant="indigo">{t.plan}</Badge></td>
                <td className="px-5 py-3 font-semibold text-slate-100">{t.amount}</td>
                <td className="px-5 py-3"><Badge variant={STATUS_V[t.status]}>{t.status}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
