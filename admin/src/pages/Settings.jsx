import { useState } from "react";
import { Save, Eye, EyeOff, RotateCcw, Copy } from "lucide-react";

const Section = ({ title, children }) => (
  <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
    <div className="px-6 py-4 border-b border-slate-800"><h3 className="text-sm font-semibold text-slate-100">{title}</h3></div>
    <div className="px-6 py-5 space-y-5">{children}</div>
  </div>
);

const Field = ({ label, hint, children }) => (
  <div>
    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">{label}</label>
    {hint && <p className="text-xs text-slate-600 mb-2">{hint}</p>}
    {children}
  </div>
);

const Input = ({ value, onChange, ...props }) => (
  <input value={value} onChange={onChange} {...props}
    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors" />
);

function MaskedKey({ value }) {
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <div className="flex gap-2">
      <div className="flex-1 flex items-center px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-lg">
        <span className="text-sm font-mono text-slate-300 flex-1">{show ? value : value.slice(0, 8) + "••••••••••••••••"}</span>
        <button onClick={() => setShow(v => !v)} className="text-slate-500 hover:text-slate-300 ml-2">{show ? <EyeOff size={14}/> : <Eye size={14}/>}</button>
      </div>
      <button onClick={copy} className="px-3 py-2.5 rounded-lg border border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors text-xs">
        {copied ? "Copied!" : <Copy size={14}/>}
      </button>
    </div>
  );
}

export default function Settings() {
  const [config, setConfig] = useState({ appName: "Taskora", supportEmail: "support@taskora.app", maxUploadMb: "2" });
  const [limits, setLimits] = useState({ loginAttempts: "5", apiRateLimit: "300" });
  const [prefs,  setPrefs]  = useState({ notifEmail: "ayush@kanflow.dev", timezone: "Asia/Calcutta", sessionTimeout: "7" });
  const [saved, setSaved]   = useState("");

  const save = (section) => {
    setSaved(section);
    setTimeout(() => setSaved(""), 2500);
  };

  const btn = (section) => (
    <button onClick={() => save(section)}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${saved === section ? "bg-emerald-600 text-white" : "bg-indigo-600 hover:bg-indigo-500 text-white"}`}>
      <Save size={14} />{saved === section ? "Saved!" : "Save Changes"}
    </button>
  );

  return (
    <div className="p-6 space-y-6 animate-fade-in max-w-3xl">
      <Section title="App Configuration">
        <Field label="App Name"><Input value={config.appName} onChange={e => setConfig(p => ({ ...p, appName: e.target.value }))} /></Field>
        <Field label="Support Email"><Input value={config.supportEmail} type="email" onChange={e => setConfig(p => ({ ...p, supportEmail: e.target.value }))} /></Field>
        <Field label="Max Upload Size (MB)"><Input value={config.maxUploadMb} type="number" onChange={e => setConfig(p => ({ ...p, maxUploadMb: e.target.value }))} /></Field>
        <div className="flex justify-end">{btn("app")}</div>
      </Section>

      <Section title="API Keys">
        <Field label="JWT Secret" hint="Used to sign authentication tokens. Keep this private.">
          <MaskedKey value="jwt_sk_9f2a1b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a" />
        </Field>
        <Field label="Resend API Key" hint="Used for sending password reset emails.">
          <MaskedKey value="re_ABCDEFGHIJKLMNopqrst1234567890abcdef" />
        </Field>
        <Field label="AI Agent Key" hint="API key for the Claude AI agent integration.">
          <MaskedKey value="sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
        </Field>
      </Section>

      <Section title="Rate Limits">
        <Field label="Max Login Attempts (per 15 min)" hint="After this many failures, the IP is soft-blocked for 1 hour.">
          <Input value={limits.loginAttempts} type="number" min="1" max="20" onChange={e => setLimits(p => ({ ...p, loginAttempts: e.target.value }))} />
        </Field>
        <Field label="API Rate Limit (requests per 15 min per IP)">
          <Input value={limits.apiRateLimit} type="number" min="10" onChange={e => setLimits(p => ({ ...p, apiRateLimit: e.target.value }))} />
        </Field>
        <div className="flex justify-end">{btn("limits")}</div>
      </Section>

      <Section title="Admin Preferences">
        <Field label="Notifications Email"><Input value={prefs.notifEmail} type="email" onChange={e => setPrefs(p => ({ ...p, notifEmail: e.target.value }))} /></Field>
        <Field label="Timezone">
          <select value={prefs.timezone} onChange={e => setPrefs(p => ({ ...p, timezone: e.target.value }))}
            className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none">
            {["Asia/Calcutta","UTC","America/New_York","Europe/London","America/Los_Angeles"].map(tz => <option key={tz}>{tz}</option>)}
          </select>
        </Field>
        <Field label="Session Timeout (days)">
          <Input value={prefs.sessionTimeout} type="number" min="1" max="30" onChange={e => setPrefs(p => ({ ...p, sessionTimeout: e.target.value }))} />
        </Field>
        <div className="flex justify-end">{btn("prefs")}</div>
      </Section>
    </div>
  );
}
