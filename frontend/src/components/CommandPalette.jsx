import { useState, useEffect, useRef } from "react";

const ALL_VIEWS = [
  { id: "board",         label: "Board",                  icon: "📋", keywords: "kanban tasks columns" },
  { id: "summary",       label: "Summary / Overview",     icon: "📊", keywords: "dashboard stats overview" },
  { id: "workload",      label: "Team Workload",          icon: "👥", keywords: "capacity team load members" },
  { id: "calendar",      label: "Calendar",               icon: "📅", keywords: "schedule dates timeline" },
  { id: "sprints",       label: "Sprint Planning",        icon: "🏃", keywords: "sprint agile iterations" },
  { id: "manager",       label: "Manager Dashboard",      icon: "🏢", keywords: "manager admin overview approvals" },
  { id: "capacity",      label: "My Capacity & Leave",    icon: "⚡", keywords: "leave travel mode capacity hours" },
  { id: "members",       label: "Team Members",           icon: "👤", keywords: "members users team roles" },
  { id: "analytics",     label: "Analytics & Velocity",   icon: "📈", keywords: "velocity charts reports trends" },
  { id: "ai-risk",       label: "AI Risk Intelligence",   icon: "🔥", keywords: "risk ai predictions heatmap" },
  { id: "gantt",         label: "Gantt Chart",            icon: "📅", keywords: "gantt timeline project chart" },
  { id: "integrations",  label: "Integrations",           icon: "🔗", keywords: "slack github jira connect" },
  { id: "graph",         label: "Dependency Graph",       icon: "🕸",  keywords: "dependencies blockers graph" },
  { id: "collaboration", label: "Team Collaboration",     icon: "🤝", keywords: "collaboration scores engagement" },
  { id: "simulation",    label: "What-If Simulation",     icon: "🔬", keywords: "simulate preview impact" },
];

const SHORTCUT_HINTS = [
  { key: "N",     desc: "New task" },
  { key: "E",     desc: "Edit focused task" },
  { key: "D",     desc: "Mark done" },
  { key: "/",     desc: "Search" },
  { key: "?",     desc: "Keyboard shortcuts" },
  { key: "J / K", desc: "Navigate tasks" },
  { key: "⌘K",    desc: "This palette" },
];

function score(item, q) {
  const s = (item.label + " " + (item.keywords || "")).toLowerCase();
  const lower = q.toLowerCase();
  if (s.startsWith(lower)) return 3;
  if (item.label.toLowerCase().includes(lower)) return 2;
  if (s.includes(lower)) return 1;
  return 0;
}

export default function CommandPalette({ open, onClose, onViewChange, onCreateTask, tasks = [], currentView }) {
  const [query, setQuery]         = useState("");
  const [selectedIndex, setSelected] = useState(0);
  const inputRef  = useRef(null);
  const listRef   = useRef(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  // ── Build item list ──────────────────────────────────────────
  const q = query.trim();

  const viewItems = ALL_VIEWS
    .map(v => ({ ...v, _score: score(v, q || " ") }))
    .filter(v => !q || v._score > 0)
    .sort((a, b) => b._score - a._score)
    .map(v => ({
      ...v,
      type: "view",
      section: "Go to view",
      action() { onViewChange(v.id); onClose(); },
    }));

  const taskItems = q.length >= 2
    ? tasks
        .filter(t => t.title.toLowerCase().includes(q.toLowerCase()))
        .slice(0, 6)
        .map(t => ({
          id: t.id,
          label: t.title,
          icon: t.status === "done" ? "✅" : t.status === "inprogress" ? "🔵" : "⬜",
          type: "task",
          section: "Tasks",
          meta: t.assignee_name || "",
          action() { onClose(); },
        }))
    : [];

  const actionItems = !q
    ? [
        {
          label: "New Task",
          icon: "➕",
          section: "Quick actions",
          shortcut: "N",
          type: "action",
          action() { onCreateTask?.(); onClose(); },
        },
        {
          label: "Keyboard shortcuts",
          icon: "⌨️",
          section: "Quick actions",
          shortcut: "?",
          type: "action",
          action() { onClose(); /* ? handler fires separately */ },
        },
      ]
    : [];

  const allItems = [...actionItems, ...viewItems, ...taskItems];

  // ── Keyboard navigation ───────────────────────────────────────
  const handleKey = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected(i => Math.min(i + 1, allItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      allItems[selectedIndex]?.action();
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  // Auto-scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(".cmd-item.selected");
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (!open) return null;

  let lastSection = null;

  return (
    <div className="cmd-overlay" onMouseDown={onClose}>
      <div className="cmd-palette" onMouseDown={e => e.stopPropagation()}>
        {/* Search bar */}
        <div className="cmd-search-row">
          <svg className="cmd-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            ref={inputRef}
            className="cmd-input"
            value={query}
            onChange={e => { setQuery(e.target.value); setSelected(0); }}
            onKeyDown={handleKey}
            placeholder="Search views, tasks, or run an action…"
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button className="cmd-clear" onClick={() => { setQuery(""); inputRef.current?.focus(); }}>
              ✕
            </button>
          )}
        </div>

        {/* Results */}
        <div className="cmd-list" ref={listRef}>
          {allItems.length === 0 && (
            <div className="cmd-empty">
              <span>No results for "<strong>{q}</strong>"</span>
            </div>
          )}

          {allItems.map((item, i) => {
            const showHeader = item.section !== lastSection;
            lastSection = item.section;
            return (
              <div key={`${item.type}-${item.id || item.label}`}>
                {showHeader && (
                  <div className="cmd-section-header">{item.section}</div>
                )}
                <button
                  className={`cmd-item ${i === selectedIndex ? "selected" : ""}`}
                  onClick={item.action}
                  onMouseEnter={() => setSelected(i)}
                >
                  <span className="cmd-item-icon">{item.icon}</span>
                  <span className="cmd-item-label">
                    {item.label}
                    {item.meta && <span className="cmd-item-meta">{item.meta}</span>}
                  </span>
                  {item.shortcut && <kbd className="cmd-shortcut">{item.shortcut}</kbd>}
                  {item.type === "view" && currentView === item.id && (
                    <span className="cmd-active-view">current</span>
                  )}
                </button>
              </div>
            );
          })}

          {/* Shortcut hints when no query */}
          {!q && (
            <div className="cmd-hints-section">
              <div className="cmd-section-header">Keyboard shortcuts</div>
              <div className="cmd-hints-grid">
                {SHORTCUT_HINTS.map(h => (
                  <div key={h.key} className="cmd-hint-row">
                    <kbd className="cmd-shortcut">{h.key}</kbd>
                    <span>{h.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="cmd-footer">
          <span><kbd>↑↓</kbd> navigate</span>
          <span><kbd>↵</kbd> select</span>
          <span><kbd>esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
