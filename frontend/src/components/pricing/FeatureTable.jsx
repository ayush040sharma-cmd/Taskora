const ROWS = [
  { label: "Projects",              free: "3",        pro: "Unlimited",  ent: "Unlimited" },
  { label: "Tasks per project",     free: "10",       pro: "Unlimited",  ent: "Unlimited" },
  { label: "Team members",          free: "3",        pro: "25",         ent: "Unlimited" },
  { label: "Board & Calendar",      free: true,       pro: true,         ent: true },
  { label: "Gantt chart",           free: false,      pro: true,         ent: true },
  { label: "Sprints",               free: false,      pro: true,         ent: true },
  { label: "Task approvals",        free: false,      pro: true,         ent: true },
  { label: "AI Risk Heatmap",       free: false,      pro: false,        ent: true },
  { label: "AI Requests / month",   free: "0",        pro: "500",        ent: "Unlimited" },
  { label: "Workload planning",     free: false,      pro: false,        ent: true },
  { label: "Integrations",          free: false,      pro: false,        ent: true },
  { label: "Simulation engine",     free: false,      pro: false,        ent: true },
  { label: "Priority support",      free: false,      pro: true,         ent: true },
  { label: "SLA & dedicated CSM",   free: false,      pro: false,        ent: true },
];

function Cell({ val }) {
  if (val === true) return <span style={{ color: "#34d399", fontSize: 16 }}>✓</span>;
  if (val === false) return <span style={{ color: "#475569", fontSize: 14 }}>—</span>;
  return <span style={{ color: "#cbd5e1", fontSize: 13 }}>{val}</span>;
}

export default function FeatureTable({ highlight = "pro" }) {
  const cols = [
    { key: "free", label: "Free" },
    { key: "pro",  label: "Pro" },
    { key: "ent",  label: "Enterprise" },
  ];

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: "10px 16px", color: "#64748b", fontWeight: 500, width: "40%" }}>
              Feature
            </th>
            {cols.map(c => (
              <th key={c.key} style={{
                textAlign: "center",
                padding: "10px 16px",
                color: highlight === c.key ? "#a5b4fc" : "#64748b",
                fontWeight: highlight === c.key ? 700 : 500,
                background: highlight === c.key ? "rgba(99,102,241,0.06)" : "transparent",
              }}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row, i) => (
            <tr key={row.label} style={{
              borderTop: "1px solid rgba(255,255,255,0.05)",
              background: i % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent",
            }}>
              <td style={{ padding: "10px 16px", color: "#94a3b8" }}>{row.label}</td>
              {cols.map(c => (
                <td key={c.key} style={{
                  textAlign: "center",
                  padding: "10px 16px",
                  background: highlight === c.key ? "rgba(99,102,241,0.04)" : "transparent",
                }}>
                  <Cell val={row[c.key]} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
