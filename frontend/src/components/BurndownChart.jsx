/** Pure-SVG burndown chart — no external library needed */
export default function BurndownChart({ data = [], total = 0 }) {
  if (!data.length) return <div className="chart-empty">No sprint data yet</div>;

  const W = 520, H = 220;
  const PAD = { top: 20, right: 20, bottom: 40, left: 40 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const xScale = (i) => PAD.left + (i / (data.length - 1 || 1)) * innerW;
  const yScale = (v) => PAD.top + innerH - (v / (total || 1)) * innerH;

  const idealPoints = data.map((d, i) => `${xScale(i)},${yScale(d.ideal)}`).join(" ");
  const actualPoints = data.map((d, i) => `${xScale(i)},${yScale(d.remaining)}`).join(" ");

  // Y axis ticks
  const yTicks = [0, Math.round(total * 0.25), Math.round(total * 0.5), Math.round(total * 0.75), total];

  return (
    <div className="burndown-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ overflow: "visible" }}>
        {/* Grid lines */}
        {yTicks.map((v) => (
          <g key={v}>
            <line
              x1={PAD.left} x2={W - PAD.right}
              y1={yScale(v)} y2={yScale(v)}
              stroke="#e2e8f0" strokeWidth="1"
            />
            <text x={PAD.left - 6} y={yScale(v) + 4} fontSize="10" fill="#97a0af" textAnchor="end">
              {v}
            </text>
          </g>
        ))}

        {/* X axis labels */}
        {data.filter((_, i) => i % Math.max(1, Math.floor(data.length / 6)) === 0).map((d, _, arr) => {
          const origIdx = data.indexOf(d);
          return (
            <text key={d.date} x={xScale(origIdx)} y={H - PAD.bottom + 16}
              fontSize="10" fill="#97a0af" textAnchor="middle">
              {d.date.slice(5)}
            </text>
          );
        })}

        {/* Ideal line */}
        <polyline
          points={idealPoints}
          fill="none"
          stroke="#97a0af"
          strokeWidth="1.5"
          strokeDasharray="6 3"
        />

        {/* Actual line */}
        <polyline
          points={actualPoints}
          fill="none"
          stroke="#0052cc"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Dots on actual */}
        {data.map((d, i) => (
          <circle key={i} cx={xScale(i)} cy={yScale(d.remaining)} r="3.5"
            fill="white" stroke="#0052cc" strokeWidth="2" />
        ))}

        {/* Legend */}
        <g transform={`translate(${W - PAD.right - 140}, ${PAD.top})`}>
          <line x1="0" y1="6" x2="18" y2="6" stroke="#97a0af" strokeWidth="1.5" strokeDasharray="4 2" />
          <text x="22" y="10" fontSize="10" fill="#5e6c84">Ideal</text>
          <line x1="60" y1="6" x2="78" y2="6" stroke="#0052cc" strokeWidth="2.5" />
          <text x="82" y="10" fontSize="10" fill="#5e6c84">Actual</text>
        </g>
      </svg>
    </div>
  );
}
