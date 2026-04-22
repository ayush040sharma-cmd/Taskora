/** Battery-style workload capacity indicator — matches spec thresholds */
export default function WorkloadBar({ percent = 0 }) {
  // Spec: Green < 80%, Yellow 80-100%, Red > 100%
  const pct    = Math.max(0, percent);
  const fillPct = Math.min(100, pct); // visual bar capped at 100%

  const color =
    pct > 100 ? "#de350b" :
    pct >= 80 ? "#ff8b00" :
                "#00875a";

  const label =
    pct > 100 ? "Overloaded" :
    pct >= 80 ? "At capacity" :
                "Available";

  const segments = 10;
  const filled = Math.round((fillPct / 100) * segments);

  return (
    <div className="workload-bar-wrap">
      <div className="workload-bar-battery">
        <div className="workload-battery-body">
          {Array.from({ length: segments }).map((_, i) => (
            <div
              key={i}
              className="workload-battery-cell"
              style={{ background: i < filled ? color : "rgba(0,0,0,0.08)" }}
            />
          ))}
        </div>
        <div className="workload-battery-tip" style={{ background: color }} />
      </div>
      <div className="workload-bar-meta">
        <span className="workload-bar-pct" style={{ color }}>{pct}%</span>
        <span className="workload-bar-status" style={{ color }}>{label}</span>
      </div>
    </div>
  );
}
