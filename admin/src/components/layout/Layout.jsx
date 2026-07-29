import { lazy, Suspense } from "react";
import Sidebar from "./Sidebar";
import Navbar from "./Navbar";
import useStore from "../../store/useStore";

import Dashboard    from "../../pages/Dashboard";
import Users        from "../../pages/Users";
import Boards       from "../../pages/Boards";
import Analytics    from "../../pages/Analytics";
import Billing      from "../../pages/Billing";
import Security     from "../../pages/Security";
import Logs         from "../../pages/Logs";
import AIUsage      from "../../pages/AIUsage";
import FeatureFlags from "../../pages/FeatureFlags";
import Notifications from "../../pages/Notifications";
import Settings     from "../../pages/Settings";

const PAGES = {
  dashboard:     Dashboard,
  users:         Users,
  boards:        Boards,
  analytics:     Analytics,
  billing:       Billing,
  security:      Security,
  logs:          Logs,
  "ai-usage":    AIUsage,
  flags:         FeatureFlags,
  notifications: Notifications,
  settings:      Settings,
};

function PageSkeleton() {
  return (
    <div className="p-6 space-y-4 animate-pulse">
      <div className="h-6 bg-slate-800 rounded w-48" />
      <div className="grid grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-slate-900 border border-slate-800 rounded-xl" />)}
      </div>
      <div className="h-64 bg-slate-900 border border-slate-800 rounded-xl" />
    </div>
  );
}

export default function Layout() {
  const { activePage, sidebarCollapsed } = useStore();
  const Page = PAGES[activePage] || Dashboard;

  return (
    <div className="flex h-screen bg-slate-950">
      <Sidebar />
      <div className={`flex-1 flex flex-col min-w-0 transition-all duration-200 ${sidebarCollapsed ? "ml-16" : "ml-60"}`}>
        <Navbar />
        <main className="flex-1 overflow-y-auto">
          <Suspense fallback={<PageSkeleton />}>
            <Page />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
