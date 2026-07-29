import { Sun, Moon, LogOut } from "lucide-react";
import useStore from "../../store/useStore";

const PAGE_TITLES = {
  dashboard: "Dashboard",
  users: "User Management",
  boards: "Boards & Tasks",
  analytics: "Analytics",
  billing: "Billing",
  security: "Security Firewall",
  logs: "Logs & Monitoring",
  "ai-usage": "AI Usage",
  flags: "Feature Flags",
  notifications: "Notifications",
  settings: "Settings",
};

function getInitials(name = "") {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2) || "A";
}

export default function Navbar() {
  const { activePage, theme, toggleTheme, user, logout } = useStore();

  return (
    <header className="h-14 bg-slate-900/80 border-b border-slate-800 backdrop-blur-sm flex items-center justify-between px-6 sticky top-0 z-30">
      <h1 className="text-base font-semibold text-slate-100">{PAGE_TITLES[activePage] || "Admin"}</h1>

      <div className="flex items-center gap-3">
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
          title="Toggle theme"
        >
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        <div className="flex items-center gap-2 pl-3 border-l border-slate-800">
          <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold">
            {getInitials(user?.name)}
          </div>
          <div className="hidden sm:block">
            <div className="text-xs font-medium text-slate-100">{user?.name}</div>
            <div className="text-[10px] text-indigo-400 font-semibold uppercase tracking-wide">Admin</div>
          </div>
        </div>

        <button
          onClick={logout}
          className="p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          title="Sign out"
        >
          <LogOut size={16} />
        </button>
      </div>
    </header>
  );
}
