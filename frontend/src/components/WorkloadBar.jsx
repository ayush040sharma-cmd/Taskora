/** Battery-style workload capacity indicator */
export default function WorkloadBar({ percent = 0, maxCapacity = 100 }) {
  const pct = Math.max(0, Math.min(100, percent));
  const color =
    pct >= 90 ? "#de350b" :
    pct >= 70 ? "#ff8b00" :
                "#00875a";
  const label =
    pct >= 90 ? "Overloaded" :
    pct >= 70 ? "Moderate"   :
                "Available";

  const segments = 10;
  const filled = Math.round((pct / 100) * segments);

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
