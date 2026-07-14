// Single source of truth for avatar initials. Previously duplicated
// independently in Navbar.jsx, ActivityFeed.jsx, and Sidebar.jsx (all
// correct), while TaskCard.jsx never got a copy and instead sliced the raw
// name string -- "Demo User".slice(0,2) -> "DE" instead of "DU".
export function getInitials(name = "") {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2) || "?";
}
