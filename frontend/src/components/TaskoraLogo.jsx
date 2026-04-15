/**
 * Taskora SVG Logo
 * Three kanban-column bars of ascending height with a checkmark accent.
 * Props: size (number), color (string), showName (bool)
 */
export default function TaskoraLogo({ size = 32, color = "#ffffff", showName = true, nameColor = "#ffffff" }) {
  const s = size;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: s * 0.3 + "px" }}>
      {/* Icon mark */}
      <svg
        width={s}
        height={s}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Background rounded square */}
        <rect width="40" height="40" rx="10" fill={color} fillOpacity="0.15" />

        {/* Three kanban column bars */}
        {/* Left bar — shortest (To Do) */}
        <rect x="6" y="22" width="7" height="13" rx="2" fill={color} fillOpacity="0.6" />
        {/* Middle bar — medium (In Progress) */}
        <rect x="16.5" y="14" width="7" height="21" rx="2" fill={color} fillOpacity="0.85" />
        {/* Right bar — tallest (Done) */}
        <rect x="27" y="8" width="7" height="27" rx="2" fill={color} />

        {/* Small checkmark on the right bar */}
        <path
          d="M28.5 16.5 L30.5 18.5 L33.5 14.5"
          stroke="#ffffff"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.9"
        />
      </svg>

      {/* Wordmark */}
      {showName && (
        <span style={{
          fontSize: s * 0.56 + "px",
          fontWeight: 800,
          color: nameColor,
          letterSpacing: "-0.5px",
          fontFamily: "'Inter', sans-serif",
          lineHeight: 1,
        }}>
          Taskora
        </span>
      )}
    </div>
  );
}
