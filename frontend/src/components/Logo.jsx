import { useId } from "react";

const MARK_PATH = "M8 20 L62 20 L94 28 L62 36 L43 36 L43 90 L27 90 L27 36 L8 36 Z";
const GRADIENT = "linear-gradient(90deg,#3B82F6,#06B6D4)";

/**
 * Single source of truth for the Taskora brand mark (icon + wordmark).
 * Every screen that shows branding renders through this component instead
 * of hardcoding the SVG/wordmark markup independently.
 */
export default function Logo({
  iconSize = 22,
  wordmarkSize = 20,
  showWordmark = true,
  wordmarkColor = "#E2E8F0",
  letterSpacing = "-0.3px",
  gap = 10,
  justify,
  className,
  style,
  onClick,
}) {
  const gradientId = useId();
  return (
    <div
      className={className}
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        ...(justify ? { justifyContent: justify } : {}),
        gap,
        ...style,
      }}
    >
      <svg width={iconSize} height={iconSize} viewBox="0 0 100 100" fill="none" style={{ flexShrink: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="8" y1="20" x2="94" y2="90" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#3B82F6" />
            <stop offset="1" stopColor="#06B6D4" />
          </linearGradient>
        </defs>
        <path d={MARK_PATH} fill={`url(#${gradientId})`} />
      </svg>
      {showWordmark && (
        <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: wordmarkSize, letterSpacing }}>
          <span style={{ color: wordmarkColor }}>Task</span>
          <span
            style={{
              background: GRADIENT,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            ora
          </span>
        </span>
      )}
    </div>
  );
}
