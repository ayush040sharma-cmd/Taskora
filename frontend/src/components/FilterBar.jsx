/**
 * FilterBar — Phase 7
 * Live filters: search text · type · priority · status · assignee
 */

const TYPE_OPTIONS = [
  { value: "",             label: "All types" },
  { value: "task",         label: "📋 Task" },
  { value: "bug",          label: "🐛 Bug" },
  { value: "story",        label: "📖 Story" },
  { value: "rfp",          label: "📑 RFP" },
  { value: "proposal",     label: "📝 Proposal" },
  { value: "presentation", label: "🎤 Presentation" },
  { value: "upgrade",      label: "⬆️ Upgrade" },
  { value: "poc",          label: "🔬 POC" },
];

const PRIORITY_OPTIONS = [
  { value: "",       label: "All priorities" },
  { value: "high",   label: "🔴 High" },
  { value: "medium", label: "🟡 Medium" },
  { value: "low",    label: "🟢 Low" },
];

const STATUS_OPTIONS = [
  { value: "",           label: "All statuses" },
  { value: "todo",       label: "To Do" },
  { value: "inprogress", label: "In Progress" },
  { value: "done",       label: "Done" },
];

const IconSearch = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
);

const IconX = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

export default function FilterBar({ filters, onChange, assignees = [], totalTasks, filteredCount }) {
  const set = (key, val) => onChange({ ...filters, [key]: val });

  const hasAnyFilter =
    filters.search || filters.type || filters.priority ||
    filters.status || filters.assignee;

  const clearAll = () => onChange({ search: "", type: "", priority: "", status: "", assignee: "" });

  return (
    <div className="filter-bar">
      {/* Search */}
      <div className="filter-search-wrap">
        <span className="filter-search-icon"><IconSearch /></span>
        <input
          className="filter-search-input"
          placeholder="Search tasks…"
          value={filters.search}
          onChange={e => set("search", e.target.value)}
        />
        {filters.search && (
          <button className="filter-clear-btn" onClick={() => set("search", "")} title="Clear search">
            <IconX />
          </button>
        )}
      </div>

      {/* Type */}
      <select
        className="filter-select"
        value={filters.type}
        onChange={e => set("type", e.target.value)}
      >
        {TYPE_OPTIONS.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      {/* Priority */}
      <select
        className="filter-select"
        value={filters.priority}
        onChange={e => set("priority", e.target.value)}
      >
        {PRIORITY_OPTIONS.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      {/* Status */}
      <select
        className="filter-select"
        value={filters.status}
        onChange={e => set("status", e.target.value)}
      >
        {STATUS_OPTIONS.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      {/* Assignee */}
      {assignees.length > 0 && (
        <select
          className="filter-select"
          value={filters.assignee}
          onChange={e => set("assignee", e.target.value)}
        >
          <option value="">All assignees</option>
          <option value="__unassigned__">Unassigned</option>
          {assignees.map(a => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      )}

      {/* Clear all */}
      {hasAnyFilter && (
        <button className="filter-clear-all" onClick={clearAll}>
          Clear filters
        </button>
      )}

      {/* Result count */}
      <span className="filter-count">
        {hasAnyFilter
          ? `${filteredCount} of ${totalTasks} task${totalTasks !== 1 ? "s" : ""}`
          : `${totalTasks} task${totalTasks !== 1 ? "s" : ""}`}
      </span>
    </div>
  );
}
