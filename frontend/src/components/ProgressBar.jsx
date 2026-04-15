export default function ProgressBar({ progress = 0, showLabel = true, height = 6, onClick }) {
  const pct = Math.max(0, Math.min(100, progress));
  const color =
    pct >= 70 ? "#00875a" :
    pct >= 30 ? "#ff8b00" :
                "#de350b";

  return (
    <div className="progress-bar-wrap" onClick={onClick} style={{ cursor: onClick ? "pointer" : "default" }}>
      <div className="progress-bar-track" style={{ height }}>
        <div
          className="progress-bar-fill"
          style={{ width: `${pct}%`, background: color, height }}
        />
      </div>
      {showLabel && (
        <span className="progress-bar-label" style={{ color }}>
          {pct}%
        </span>
      )}
    </div>
  );
}
