import { LayoutDashboard, Users, Layout, BarChart3, CreditCard, Shield, ScrollText, Brain, ToggleLeft, Bell, Settings, LogOut, ChevronLeft, ChevronRight } from "lucide-react";
import useStore from "../../store/useStore";

const NAV = [
  { id: "dashboard",     label: "Dashboard",     icon: LayoutDashboard },
  { id: "users",         label: "Users",          icon: Users },
  { id: "boards",        label: "Boards & Tasks", icon: Layout },
  { id: "analytics",     label: "Analytics",      icon: BarChart3 },
  { id: "billing",       label: "Billing",        icon: CreditCard },
  { id: "security",      label: "Security",       icon: Shield },
  { id: "logs",          label: "Logs",           icon: ScrollText },
  { id: "ai-usage",      label: "AI Usage",       icon: Brain },
  { id: "flags",         label: "Feature Flags",  icon: ToggleLeft },
  { id: "notifications", label: "Notifications",  icon: Bell },
  { id: "settings",      label: "Settings",       icon: Settings },
];

function getInitials(name = "") {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2) || "A";
}

export default function Sidebar() {
  const { activePage, setPage, sidebarCollapsed, toggleSidebar, user, logout } = useStore();

  return (
    <aside className={`fixed top-0 left-0 h-full bg-slate-900 border-r border-slate-800 flex flex-col transition-all duration-200 z-40 ${sidebarCollapsed ? "w-16" : "w-60"}`}>
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-14 border-b border-slate-800 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-500 to-violet-600 flex items-center justify-center text-sm shrink-0">🛡️</div>
        {!sidebarCollapsed && (
          <div className="overflow-hidden">
            <div className="text-sm font-bold text-slate-100 whitespace-nowrap">Taskora Admin</div>
            <div className="text-[10px] font-bold text-violet-400 tracking-widest uppercase">Restricted</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {NAV.map(({ id, label, icon: Icon }) => {
          const active = activePage === id;
          return (
            <button
              key={id}
              onClick={() => setPage(id)}
              title={sidebarCollapsed ? label : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors group ${
                active
                  ? "bg-indigo-600/20 text-indigo-400 border border-indigo-500/20"
                  : "text-slate-400 hover:text-slate-100 hover:bg-slate-800 border border-transparent"
              }`}
            >
              <Icon size={16} className="shrink-0" />
              {!sidebarCollapsed && <span className="whitespace-nowrap">{label}</span>}
            </button>
          );
        })}
      </nav>

      {/* User + collapse */}
      <div className="border-t border-slate-800 p-2 space-y-1 shrink-0">
        {!sidebarCollapsed && user && (
          <div className="flex items-center gap-2 px-3 py-2">
            <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold shrink-0">
              {getInitials(user.name)}
            </div>
            <div className="overflow-hidden">
              <div className="text-xs font-medium text-slate-100 truncate">{user.name}</div>
              <div className="text-[10px] text-slate-500 truncate">{user.email}</div>
            </div>
          </div>
        )}
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          title={sidebarCollapsed ? "Sign out" : undefined}
        >
          <LogOut size={16} className="shrink-0" />
          {!sidebarCollapsed && <span>Sign out</span>}
        </button>
        <button
          onClick={toggleSidebar}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"
        >
          {sidebarCollapsed ? <ChevronRight size={16} /> : <><ChevronLeft size={16} /><span>Collapse</span></>}
        </button>
      </div>
    </aside>
  );
}
