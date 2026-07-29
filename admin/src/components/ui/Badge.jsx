const VARIANTS = {
  success: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  error:   "bg-red-500/15 text-red-400 border-red-500/20",
  warning: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  info:    "bg-blue-500/15 text-blue-400 border-blue-500/20",
  purple:  "bg-violet-500/15 text-violet-400 border-violet-500/20",
  indigo:  "bg-indigo-500/15 text-indigo-400 border-indigo-500/20",
  default: "bg-slate-700/50 text-slate-300 border-slate-700",
};

export default function Badge({ children, variant = "default", className = "" }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border ${VARIANTS[variant] || VARIANTS.default} ${className}`}>
      {children}
    </span>
  );
}
