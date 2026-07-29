import { useState, useMemo } from "react";
import { Search, Download, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import Badge from "../components/ui/Badge";

const METHODS = ["GET","POST","PUT","DELETE","PATCH"];
const ENDPOINTS = ["/api/auth/login","/api/tasks","/api/workspaces","/api/firewall/events","/api/members","/api/sprints","/api/notifications","/api/ai/query","/api/channels","/api/auth/me"];
const LEVELS = ["INFO","INFO","INFO","INFO","WARN","ERROR"];
const MESSAGES = ["Request completed","Query executed","Cache miss","Auth validated","Rate limit approaching","Validation failed","Token refreshed","DB connection slow","Request blocked","Invalid payload"];

const seed = (n) => Math.floor(Math.random() * n);
const mockLogs = Array.from({ length: 80 }, (_, i) => {
  const level = LEVELS[seed(LEVELS.length)];
  const status = level === "ERROR" ? [400,401,422,500][seed(4)] : level === "WARN" ? [429,403][seed(2)] : [200,201,204,304][seed(4)];
  return {
    id: i + 1,
    timestamp: new Date(Date.now() - i * 83000).toISOString(),
    level,
    method: METHODS[seed(METHODS.length)],
    endpoint: ENDPOINTS[seed(ENDPOINTS.length)],
    status,
    ms: Math.floor(10 + Math.random() * 400),
    message: MESSAGES[seed(MESSAGES.length)],
    ip: `192.168.${seed(10)}.${seed(255)}`,
  };
});

const LEVEL_V = { INFO: "info", WARN: "warning", ERROR: "error" };
const PAGE_SIZE = 15;

function exportCSV(logs) {
  const h = "Time,Level,Method,Endpoint,Status,Ms,Message";
  const rows = logs.map(l => `"${l.timestamp}","${l.level}","${l.method}","${l.endpoint}","${l.status}","${l.ms}","${l.message}"`);
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([[h, ...rows].join("\n")], { type: "text/csv" }));
  a.download = "logs.csv"; a.click();
}

export default function Logs() {
  const [search, setSearch]   = useState("");
  const [level, setLevel]     = useState("all");
  const [page, setPage]       = useState(1);

  const filtered = useMemo(() => mockLogs.filter(l => {
    const q = search.toLowerCase();
    return (!q || l.endpoint.includes(q) || l.message.toLowerCase().includes(q) || l.ip.includes(q))
      && (level === "all" || l.level === level);
  }), [search, level]);

  const total = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const rows  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="p-6 space-y-4 animate-fade-in">
      {/* Toolbar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-3 flex-1 min-w-0">
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search endpoint, IP…"
              className="w-full pl-8 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500" />
          </div>
          <select value={level} onChange={e => { setLevel(e.target.value); setPage(1); }}
            className="px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-slate-300 focus:outline-none">
            <option value="all">All Levels</option>
            <option value="INFO">INFO</option>
            <option value="WARN">WARN</option>
            <option value="ERROR">ERROR</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button className="p-2 rounded-lg border border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"><RefreshCw size={14} /></button>
          <button onClick={() => exportCSV(filtered)} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors text-sm"><Download size={14} />CSV</button>
        </div>
      </div>

      {/* Stats */}
      <div className="flex gap-3 text-xs">
        {["INFO","WARN","ERROR"].map(l => {
          const count = mockLogs.filter(x => x.level === l).length;
          return <div key={l} className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 flex items-center gap-2"><Badge variant={LEVEL_V[l]}>{l}</Badge><span className="text-slate-300 font-semibold">{count}</span></div>;
        })}
        <div className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-slate-400">Total: <span className="text-slate-200 font-semibold">{mockLogs.length}</span></div>
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full text-xs">
          <thead><tr className="border-b border-slate-800">{["Time","Level","Method","Endpoint","Status","ms","Message"].map(h => <th key={h} className="px-4 py-3 text-left font-semibold text-slate-500 uppercase tracking-wider">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-800/50 font-mono">
            {rows.map(l => (
              <tr key={l.id} className={`hover:bg-slate-800/30 transition-colors ${l.level === "ERROR" ? "bg-red-500/5" : l.level === "WARN" ? "bg-amber-500/5" : ""}`}>
                <td className="px-4 py-2 text-slate-500 whitespace-nowrap">{new Date(l.timestamp).toLocaleTimeString()}</td>
                <td className="px-4 py-2"><Badge variant={LEVEL_V[l.level]}>{l.level}</Badge></td>
                <td className="px-4 py-2 text-slate-400">{l.method}</td>
                <td className="px-4 py-2 text-slate-300 max-w-[200px] truncate">{l.endpoint}</td>
                <td className="px-4 py-2"><span className={l.status >= 500 ? "text-red-400" : l.status >= 400 ? "text-amber-400" : "text-emerald-400"}>{l.status}</span></td>
                <td className="px-4 py-2 text-slate-500">{l.ms}ms</td>
                <td className="px-4 py-2 text-slate-400 max-w-[200px] truncate">{l.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-4 py-3 border-t border-slate-800 flex items-center justify-between">
          <span className="text-xs text-slate-500">{filtered.length} entries</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded text-slate-400 hover:text-slate-200 disabled:opacity-30"><ChevronLeft size={14} /></button>
            <span className="text-xs text-slate-400">{page} / {total}</span>
            <button onClick={() => setPage(p => Math.min(total, p + 1))} disabled={page === total} className="p-1.5 rounded text-slate-400 hover:text-slate-200 disabled:opacity-30"><ChevronRight size={14} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}
