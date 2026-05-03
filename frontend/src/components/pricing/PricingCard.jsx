export default function PricingCard({
  plan,
  price,
  period = "/month",
  title,
  description,
  features,
  badge,
  highlighted = false,
  ctaLabel = "Get started",
  onCta,
  current = false,
}) {
  return (
    <div style={{
      position: "relative",
      background: highlighted
        ? "linear-gradient(160deg, rgba(99,102,241,0.12) 0%, rgba(139,92,246,0.08) 100%)"
        : "rgba(255,255,255,0.03)",
      border: highlighted
        ? "1.5px solid rgba(99,102,241,0.5)"
        : "1.5px solid rgba(255,255,255,0.07)",
      borderRadius: 18,
      padding: "28px 24px 24px",
      display: "flex",
      flexDirection: "column",
      gap: 0,
      flex: 1,
      minWidth: 240,
    }}>
      {badge && (
        <div style={{
          position: "absolute",
          top: -13,
          left: "50%",
          transform: "translateX(-50%)",
          background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
          color: "#fff",
          fontSize: 11,
          fontWeight: 700,
          padding: "4px 14px",
          borderRadius: 20,
          whiteSpace: "nowrap",
          letterSpacing: "0.03em",
        }}>
          {badge}
        </div>
      )}

      <div style={{ marginBottom: 6 }}>
        <span style={{
          fontSize: 12,
          fontWeight: 700,
          color: highlighted ? "#a5b4fc" : "#64748b",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}>
          {title}
        </span>
      </div>

      <div style={{ marginBottom: 4 }}>
        <span style={{ fontSize: 36, fontWeight: 800, color: "#f1f5f9" }}>{price}</span>
        {period && (
          <span style={{ fontSize: 14, color: "#64748b", marginLeft: 4 }}>{period}</span>
        )}
      </div>

      <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 20px", lineHeight: 1.5 }}>
        {description}
      </p>

      <button
        onClick={onCta}
        disabled={current}
        style={{
          width: "100%",
          padding: "11px",
          borderRadius: 10,
          border: "none",
          cursor: current ? "default" : "pointer",
          fontSize: 14,
          fontWeight: 600,
          marginBottom: 20,
          background: current
            ? "rgba(255,255,255,0.06)"
            : highlighted
            ? "linear-gradient(135deg, #6366f1, #8b5cf6)"
            : "rgba(255,255,255,0.08)",
          color: current ? "#475569" : "#fff",
          transition: "opacity 0.15s",
        }}
      >
        {current ? "Current plan" : ctaLabel}
      </button>

      <div style={{
        borderTop: "1px solid rgba(255,255,255,0.06)",
        paddingTop: 16,
        display: "flex",
        flexDirection: "column",
        gap: 9,
      }}>
        {features.map((f, i) => (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <span style={{
              color: f.locked ? "#475569" : "#34d399",
              fontSize: 13,
              flexShrink: 0,
              marginTop: 1,
            }}>
              {f.locked ? "—" : "✓"}
            </span>
            <span style={{ fontSize: 13, color: f.locked ? "#475569" : "#94a3b8", lineHeight: 1.4 }}>
              {f.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
