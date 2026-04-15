const IconSearch = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const IconPlus = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

export default function Navbar({ workspaceName, onCreateTask, user }) {
  const getInitials = (name = "") =>
    name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);

  return (
    <header className="navbar">
      <div className="navbar-breadcrumb">
        <span>Taskora</span>
        <span>/</span>
        <span className="navbar-breadcrumb-current">{workspaceName || "Select a workspace"}</span>
      </div>

      <div className="navbar-search">
        <div className="navbar-search-icon">
          <IconSearch />
        </div>
        <input type="text" placeholder="Search tasks…" />
      </div>

      <div className="navbar-actions">
        <button className="btn-create" onClick={onCreateTask}>
          <IconPlus />
          Create
        </button>
        <div className="navbar-avatar" title={user?.name}>
          {getInitials(user?.name)}
        </div>
      </div>
    </header>
  );
}
