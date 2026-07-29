/**
 * FilterBar — Phase 7
 * Live filters: search text · type · priority · status · assignee
 */
import { LuSearch, LuX } from "react-icons/lu";

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

const IconSearch = () => <LuSearch size={13} />;

const IconX = () => <LuX size={12} />;

export default function FilterBar({ filters, onChange, assignees = [], totalTasks, filteredCount }) {
  const set = (key, val) => onChange({ ...filters, [key]: val });

  const hasAnyFilter =
    filters.search || filters.type || filters.priority || filters.assignee;

  const clearAll = () => onChange({ search: "", type: "", priority: "", assignee: "" });

  return (
    <div className="filter-bar">
      {/* Search */}
      <div className="filter-search-wrap">
        <span className="filter-search-icon"><IconSearch /></span>
        <input
          className="filter-search-input"
          placeholder="Filter tasks…"
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

      {/* No status filter here -- this bar only ever renders above the
          Kanban board, which already groups tasks into status columns
          (To Do / In Progress / Review / Done). A "Status" dropdown that
          just hides every column but one duplicated what the board's own
          layout already shows for free. */}

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

      {/* Result count — only shown while filtering. Unfiltered, this was
          repeating the exact same "N tasks" text already shown in the page
          header above (Dashboard.jsx's "N tasks · Press N to add"), with
          zero added information. */}
      {hasAnyFilter && (
        <span className="filter-count">
          {`${filteredCount} of ${totalTasks} task${totalTasks !== 1 ? "s" : ""}`}
        </span>
      )}
    </div>
  );
}
