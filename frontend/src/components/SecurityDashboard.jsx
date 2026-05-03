import { useState, useEffect, useRef, useCallback } from "react";
import api from "../api/api";
import { io } from "socket.io-client";

const SEV_COLOR = {
  critical: { bg: "#fef2f2", text: "#dc2626", dot: "#dc2626" },
  high:     { bg: "#fff7ed", text: "#ea580c", dot: "#ea580c" },
  medium:   { bg: "#fefce8", text: "#ca8a04", dot: "#ca8a04" },
  low:      { bg: "#f0fdf4", text: "#16a34a", dot: "#16a34a" },
};

const THREAT_LABEL = {
  sql_injection:      "SQL Injection",
  xss:                "XSS",
  path_traversal:     "Path Traversal",
  command_injection:  "Command Injection",
  prototype_pollution:"Prototype Pollution",
  malicious_scanner:  "Scanner Bot",
  brute_force:        "Brute Force",
  brute_force_blocked:"BF Blocked",
  blocked_ip:         "Blocked IP",
  oversized_headers:  "Large Headers",
  rate_limit:         "Rate Limit",
};

function SevBadge({ severity }) {
  const c = SEV_COLOR[severity] || SEV_COLOR.low;
  return (
    <span style={{
      background: c.bg, color: c.text,
      padding: "2px 8px", borderRadius: 999,
      fontSize: 11, fontWeight: 700, textTransform: "uppercase",
    }}>
      {severity}
    </span>
  );
}

function StatCard({ label, value, color = "#6366f1", sub }) {
  return (
    <div style={{
      background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12,
      padding: "16px 20px", minWidth: 140,
    }}>
      <div style={{ fontSize: 28, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export default function SecurityDashboard({ token }) {
  const [events, setEvents]     = useState([]);
  const [stats, setStats]       = useState(null);
  const [blockedIPs, setBlocked]= useState([]);
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState("events"); // events | blocked
  const [liveCount, setLive]    = useState(0);
  const [blockInput, setBlockIn]= useState({ ip: "", reason: "" });
  const socketRef               = useRef(null);

  const load = useCallback(async () => {
    try {
      const [evRes, stRes, blRes] = await Promise.all([
        api.get("/firewall/events?limit=100"),
        api.get("/firewall/stats"),
        api.get("/firewall/blocked-ips"),
      ]);
      setEvents(evRes.data.events || []);
      setStats(stRes.data);
      setBlocked(blRes.data || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  // Connect to Socket.io for live threat feed
  useEffect(() => {
    load();

    const socket = io(import.meta.env.VITE_API_URL?.replace("/api", "") || "http://localhost:3001", {
      auth: { token },
      transports: ["websocket"],
    });

    socketRef.current = socket;

    socket.on("security:threat", (event) => {
      setEvents(prev => [event, ...prev.slice(0, 199)]);
      setLive(n => n + 1);
      if (stats) setStats(s => s ? { ...s, last_24h: (s.last_24h || 0) + 1 } : s);
    });

    socket.on("security:blocked", () => {
      api.get("/firewall/blocked-ips").then(r => setBlocked(r.data)).catch(() => {});
    });

    socket.on("security:unblocked", () => {
      api.get("/firewall/blocked-ips").then(r => setBlocked(r.data)).catch(() => {});
    });

    return () => { socket.disconnect(); };
  }, [load, token]);

  const handleUnblock = async (ip) => {
    await api.post(`/firewall/unblock/${encodeURIComponent(ip)}`);
    setBlocked(prev => prev.filter(b => b.ip !== ip));
  };

  const handleBlock = async () => {
    if (!blockInput.ip.trim()) return;
    await api.post(`/firewall/block/${encodeURIComponent(blockInput.ip)}`, { reason: blockInput.reason || "Manual block" });
    setBlockIn({ ip: "", reason: "" });
    api.get("/firewall/blocked-ips").then(r => setBlocked(r.data)).catch(() => {});
  };

  if (loading) return (
    <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>
      Loading security data…
    </div>
  );

  const critCount = stats?.by_severity?.find(s => s.severity === "critical")?.count || 0;
  const highCount = stats?.by_severity?.find(s => s.severity === "high")?.count || 0;

  return (
    <div style={{ padding: "24px 28px", background: "#f8fafc", minHeight: "100vh" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: "linear-gradient(135deg,#dc2626,#7c3aed)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 20,
        }}>🛡️</div>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#0f172a" }}>Security Firewall</div>
          <div style={{ fontSize: 13, color: "#64748b" }}>Real-time threat monitoring & IP management</div>
        </div>
        {liveCount > 0 && (
          <div style={{
            marginLeft: "auto", background: "#fef2f2", color: "#dc2626",
            padding: "4px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700,
            animation: "pulse 1.5s infinite",
          }}>
            🔴 {liveCount} new threat{liveCount !== 1 ? "s" : ""} detected
          </div>
        )}
      </div>

      {/* Stats row */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
        <StatCard label="Total Events"   value={events.length}         color="#6366f1" />
        <StatCard label="Last 24h"       value={stats?.last_24h || 0}  color="#0ea5e9" />
        <StatCard label="Critical"       value={critCount}              color="#dc2626" />
        <StatCard label="High"           value={highCount}              color="#ea580c" />
        <StatCard label="Blocked IPs"    value={blockedIPs.length}      color="#7c3aed" />
      </div>

      {/* Top threat types */}
      {stats?.by_type?.length > 0 && (
        <div style={{
          background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12,
          padding: 16, marginBottom: 20,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 10 }}>
            Threat Breakdown
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {stats.by_type.map(t => (
              <div key={t.threat_type} style={{
                background: "#f1f5f9", borderRadius: 8, padding: "6px 12px",
                fontSize: 12, color: "#475569",
              }}>
                <span style={{ fontWeight: 700 }}>{THREAT_LABEL[t.threat_type] || t.threat_type}</span>
                <span style={{ color: "#94a3b8", marginLeft: 6 }}>{t.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
        {["events", "blocked"].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "7px 18px", borderRadius: 8, border: "none", cursor: "pointer",
            fontSize: 13, fontWeight: 600,
            background: tab === t ? "#6366f1" : "#e2e8f0",
            color:      tab === t ? "#fff"    : "#64748b",
          }}>
            {t === "events" ? `Events (${events.length})` : `Blocked IPs (${blockedIPs.length})`}
          </button>
        ))}
        <button onClick={load} style={{
          marginLeft: "auto", padding: "7px 14px", borderRadius: 8,
          border: "1px solid #e2e8f0", background: "#fff", cursor: "pointer",
          fontSize: 12, color: "#64748b",
        }}>
          ↻ Refresh
        </button>
      </div>

      {/* Events table */}
      {tab === "events" && (
        <div style={{
          background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden",
        }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                {["Time", "IP", "Type", "Severity", "Method", "URL", "Blocked"].map(h => (
                  <th key={h} style={{
                    padding: "10px 14px", textAlign: "left",
                    fontWeight: 700, color: "#374151", fontSize: 12,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {events.length === 0 && (
                <tr><td colSpan={7} style={{ padding: 32, textAlign: "center", color: "#94a3b8" }}>
                  No security events yet — system is clean ✅
                </td></tr>
              )}
              {events.map((e, i) => (
                <tr key={e.id || i} style={{
                  borderBottom: "1px solid #f1f5f9",
                  background: i % 2 === 0 ? "#fff" : "#fafafa",
                }}>
                  <td style={{ padding: "8px 14px", color: "#64748b", whiteSpace: "nowrap" }}>
                    {new Date(e.timestamp).toLocaleTimeString()}
                  </td>
                  <td style={{ padding: "8px 14px", fontFamily: "monospace", color: "#0f172a" }}>
                    {e.ip}
                  </td>
                  <td style={{ padding: "8px 14px", fontWeight: 600, color: "#374151" }}>
                    {THREAT_LABEL[e.threat_type] || e.threat_type}
                  </td>
                  <td style={{ padding: "8px 14px" }}>
                    <SevBadge severity={e.severity} />
                  </td>
                  <td style={{ padding: "8px 14px", color: "#64748b" }}>{e.method}</td>
                  <td style={{
                    padding: "8px 14px", color: "#64748b",
                    maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }} title={e.url}>
                    {e.url}
                  </td>
                  <td style={{ padding: "8px 14px" }}>
                    {e.blocked
                      ? <span style={{ color: "#dc2626", fontWeight: 700 }}>✗ Blocked</span>
                      : <span style={{ color: "#16a34a" }}>✓ Passed</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Blocked IPs */}
      {tab === "blocked" && (
        <div>
          {/* Manual block form */}
          <div style={{
            background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12,
            padding: 16, marginBottom: 16, display: "flex", gap: 10, alignItems: "flex-end",
          }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 4 }}>IP ADDRESS</div>
              <input
                value={blockInput.ip}
                onChange={e => setBlockIn(p => ({ ...p, ip: e.target.value }))}
                placeholder="e.g. 192.168.1.1"
                style={{
                  border: "1px solid #e2e8f0", borderRadius: 8, padding: "7px 12px",
                  fontSize: 13, width: 180,
                }}
              />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 4 }}>REASON</div>
              <input
                value={blockInput.reason}
                onChange={e => setBlockIn(p => ({ ...p, reason: e.target.value }))}
                placeholder="Manual block reason"
                style={{
                  border: "1px solid #e2e8f0", borderRadius: 8, padding: "7px 12px",
                  fontSize: 13, width: 240,
                }}
              />
            </div>
            <button onClick={handleBlock} style={{
              padding: "8px 18px", borderRadius: 8, border: "none",
              background: "#dc2626", color: "#fff", fontWeight: 700,
              fontSize: 13, cursor: "pointer",
            }}>
              Block IP
            </button>
          </div>

          <div style={{
            background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden",
          }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                  {["IP Address", "Reason", "Blocked By", "Blocked At", "Expires", ""].map(h => (
                    <th key={h} style={{
                      padding: "10px 14px", textAlign: "left",
                      fontWeight: 700, color: "#374151", fontSize: 12,
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {blockedIPs.length === 0 && (
                  <tr><td colSpan={6} style={{ padding: 32, textAlign: "center", color: "#94a3b8" }}>
                    No IPs currently blocked
                  </td></tr>
                )}
                {blockedIPs.map((b, i) => (
                  <tr key={b.ip} style={{
                    borderBottom: "1px solid #f1f5f9",
                    background: i % 2 === 0 ? "#fff" : "#fafafa",
                  }}>
                    <td style={{ padding: "8px 14px", fontFamily: "monospace", fontWeight: 700, color: "#dc2626" }}>
                      {b.ip}
                    </td>
                    <td style={{ padding: "8px 14px", color: "#374151" }}>{b.reason}</td>
                    <td style={{ padding: "8px 14px", color: "#64748b" }}>{b.blocked_by}</td>
                    <td style={{ padding: "8px 14px", color: "#64748b", whiteSpace: "nowrap" }}>
                      {new Date(b.blocked_at).toLocaleString()}
                    </td>
                    <td style={{ padding: "8px 14px", color: "#64748b" }}>
                      {b.expires_at ? new Date(b.expires_at).toLocaleString() : "Permanent"}
                    </td>
                    <td style={{ padding: "8px 14px" }}>
                      <button onClick={() => handleUnblock(b.ip)} style={{
                        padding: "4px 12px", borderRadius: 6,
                        border: "1px solid #e2e8f0", background: "#fff",
                        fontSize: 12, color: "#16a34a", cursor: "pointer", fontWeight: 600,
                      }}>
                        Unblock
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
