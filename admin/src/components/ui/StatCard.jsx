import { TrendingUp, TrendingDown } from "lucide-react";

export default function StatCard({ title, value, change, changeType, icon: Icon, iconColor = "text-indigo-400", loading }) {
  if (loading) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 animate-pulse">
        <div className="h-4 bg-slate-800 rounded w-24 mb-3" />
        <div className="h-8 bg-slate-800 rounded w-16 mb-2" />
        <div className="h-3 bg-slate-800 rounded w-20" />
      </div>
    );
  }
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-colors">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-slate-400 font-medium">{title}</span>
        {Icon && <div className={`p-2 rounded-lg bg-slate-800 ${iconColor}`}><Icon size={16} /></div>}
      </div>
      <div className="text-2xl font-bold text-slate-100 mb-1">{value}</div>
      {change !== undefined && (
        <div className={`flex items-center gap-1 text-xs font-medium ${changeType === "up" ? "text-emerald-400" : "text-red-400"}`}>
          {changeType === "up" ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          {change}
        </div>
      )}
    </div>
  );
}
