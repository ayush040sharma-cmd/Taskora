import { useState } from "react";
import { RotateCcw, Save } from "lucide-react";
import Badge from "../components/ui/Badge";

const DEFAULT_FLAGS = [
  { id: "ai_assistant",    label: "AI Assistant",         desc: "Enable Jarvis AI voice & chat assistant",     env: "prod",  enabled: true },
  { id: "beta_ui",         label: "Beta UI",              desc: "New interface components & redesigned views",  env: "beta",  enabled: false },
  { id: "voice_commands",  label: "Voice Commands",       desc: "Jarvis wake-word and voice recognition",       env: "prod",  enabled: true },
  { id: "analytics",       label: "Analytics Dashboard",  desc: "Advanced analytics & reporting tab",           env: "prod",  enabled: true },
  { id: "jira_import",     label: "Jira Import",          desc: "Import tasks and sprints from Jira",           env: "prod",  enabled: true },
  { id: "simulation",      label: "Simulation Panel",     desc: "What-if workload simulation mode",             env: "beta",  enabled: false },
  { id: "collab_score",    label: "Collaboration Score",  desc: "Team collaboration rating & badges",           env: "beta",  enabled: false },
  { id: "nl_query",        label: "NL Query",             desc: "Natural language workspace search",            env: "prod",  enabled: true },
  { id: "billing_advanced",label: "Advanced Billing",     desc: "Stripe billing portal & invoices",             env: "dev",   enabled: false },
  { id: "debug_mode",      label: "Debug Mode",           desc: "Show debug panels and verbose logging",        env: "dev",   enabled: false },
];

const ENV_V = { prod: "success", beta: "warning", dev: "info" };

const load = () => {
  try { return JSON.parse(localStorage.getItem("admin_flags")) || null; } catch { return null; }
};

export default function FeatureFlags() {
  const [flags, setFlags] = useState(() => {
    const saved = load();
    return saved ? DEFAULT_FLAGS.map(f => ({ ...f, enabled: saved[f.id] ?? f.enabled })) : DEFAULT_FLAGS;
  });
  const [saved, setSaved] = useState(false);

  const toggle = (id) => setFlags(prev => prev.map(f => f.id === id ? { ...f, enabled: !f.enabled } : f));

  const save = () => {
    const map = Object.fromEntries(flags.map(f => [f.id, f.enabled]));
    localStorage.setItem("admin_flags", JSON.stringify(map));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const reset = () => { setFlags(DEFAULT_FLAGS); localStorage.removeItem("admin_flags"); };

  const enabledCount = flags.filter(f => f.enabled).length;

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm">
            <span className="text-slate-400">Active: </span><span className="text-emerald-400 font-bold">{enabledCount}</span>
            <span className="text-slate-600 mx-2">/</span>
            <span className="text-slate-400">Total: </span><span className="text-slate-200 font-bold">{flags.length}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={reset} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors text-sm"><RotateCcw size={14} />Reset</button>
          <button onClick={save} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${saved ? "bg-emerald-600 text-white" : "bg-indigo-600 hover:bg-indigo-500 text-white"}`}>
            <Save size={14} />{saved ? "Saved!" : "Save Changes"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {flags.map(f => (
          <div key={f.id} className={`bg-slate-900 border rounded-xl p-5 flex items-center gap-4 transition-colors ${f.enabled ? "border-indigo-500/30" : "border-slate-800"}`}>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold text-slate-100">{f.label}</span>
                <Badge variant={ENV_V[f.env]}>{f.env}</Badge>
              </div>
              <p className="text-xs text-slate-500">{f.desc}</p>
            </div>
            <button
              onClick={() => toggle(f.id)}
              className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${f.enabled ? "bg-indigo-600" : "bg-slate-700"}`}
            >
              <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${f.enabled ? "translate-x-5" : "translate-x-0"}`} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
