import { useState, useEffect, useRef, useCallback } from "react";
import api from "../api/api";

const STATUS_COLOR  = { todo: "#94a3b8", inprogress: "#6366f1", done: "#10b981" };
const RISK_COLOR    = (score) => score >= 75 ? "#dc2626" : score >= 50 ? "#ef4444" : score >= 25 ? "#f59e0b" : "#10b981";
const PRIORITY_ICON = { critical: "🔴", high: "🟠", medium: "🟡", low: "🟢" };

const NODE_W  = 160;
const NODE_H  = 52;
const H_GAP   = 80;
const V_GAP   = 32;

// Simple layered layout: topological sort → assign columns (layers), then rows
function layoutGraph(nodes, edges) {
  if (!nodes.length) return { positioned: [], edgePaths: [] };

  const idMap = {};
  nodes.forEach(n => { idMap[n.id] = n; });

  // Build adjacency
  const outEdges = {};   // from → [to]
  const inDegree = {};
  nodes.forEach(n => { outEdges[n.id] = []; inDegree[n.id] = 0; });
  edges.forEach(e => {
    if (outEdges[e.from] !== undefined) outEdges[e.from].push(e.to);
    if (inDegree[e.to]   !== undefined) inDegree[e.to]++;
  });

  // Kahn's BFS topological sort → layers
  const layers = [];
  let queue = nodes.filter(n => inDegree[n.id] === 0).map(n => n.id);

  const visited = new Set();
  while (queue.length) {
    layers.push([...queue]);
    queue.forEach(id => visited.add(id));
    const next = [];
    queue.forEach(id => {
      (outEdges[id] || []).forEach(toId => {
        if (!visited.has(toId)) {
          inDegree[toId]--;
          if (inDegree[toId] === 0) next.push(toId);
        }
      });
    });
    queue = next;
  }

  // Any nodes not in layers (cycle) go in a final layer
  const inLayers = new Set(layers.flat());
  const orphans = nodes.filter(n => !inLayers.has(n.id)).map(n => n.id);
  if (orphans.length) layers.push(orphans);

  // Position nodes
  const posMap = {};
  layers.forEach((layer, col) => {
    layer.forEach((id, row) => {
      posMap[id] = {
        x: col * (NODE_W + H_GAP),
        y: row * (NODE_H + V_GAP),
      };
    });
  });

  const positioned = nodes.map(n => ({ ...n, ...posMap[n.id] }));

  // Build SVG edge paths
  const edgePaths = edges.map((e, i) => {
    const from = posMap[e.from];
    const to   = posMap[e.to];
    if (!from || !to) return null;

    const x1 = from.x + NODE_W;
    const y1 = from.y + NODE_H / 2;
    const x2 = to.x;
    const y2 = to.y + NODE_H / 2;
    const mx = (x1 + x2) / 2;

    return {
      key: i,
      d: `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`,
      fromId: e.from,
      toId: e.to,
    };
  }).filter(Boolean);

  return { positioned, edgePaths };
}

function GraphNode({ node, selected, onClick }) {
  const borderColor = selected ? "#6366f1"
    : node.risk_score >= 50 ? RISK_COLOR(node.risk_score)
    : STATUS_COLOR[node.status] || "#94a3b8";

  return (
    <g
      transform={`translate(${node.x}, ${node.y})`}
      style={{ cursor: "pointer" }}
      onClick={() => onClick(node)}
    >
      <rect
        width={NODE_W}
        height={NODE_H}
        rx={8}
        ry={8}
        fill={selected ? "#eef2ff" : "#fff"}
        stroke={borderColor}
        strokeWidth={selected ? 2.5 : 1.5}
        style={{ filter: selected ? "drop-shadow(0 2px 8px rgba(99,102,241,0.3))" : "none" }}
      />
      {/* Status indicator strip */}
      <rect
        width={4}
        height={NODE_H}
        rx={4}
        fill={STATUS_COLOR[node.status] || "#94a3b8"}
      />
      {/* Title */}
      <foreignObject x={10} y={6} width={NODE_W - 16} height={26}>
        <div
          xmlns="http://www.w3.org/1999/xhtml"
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "#1e293b",
            overflow: "hidden",
            whiteSpace: "nowrap",
            textOverflow: "ellipsis",
            lineHeight: "1.3",
          }}
        >
          {PRIORITY_ICON[node.priority] || ""} {node.title}
        </div>
      </foreignObject>
      {/* Assignee + risk */}
      <foreignObject x={10} y={30} width={NODE_W - 16} height={18}>
        <div
          xmlns="http://www.w3.org/1999/xhtml"
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
        >
          <span style={{ fontSize: 10, color: "#64748b", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", maxWidth: 90 }}>
            {node.assignee_name || "Unassigned"}
          </span>
          {node.risk_score > 0 && (
            <span style={{ fontSize: 10, fontWeight: 700, color: RISK_COLOR(node.risk_score) }}>
              {node.risk_score}
            </span>
          )}
        </div>
      </foreignObject>
    </g>
  );
}

export default function DependencyGraph({ workspaceId }) {
  const [graph, setGraph]         = useState({ nodes: [], edges: [] });
  const [layout, setLayout]       = useState({ positioned: [], edgePaths: [] });
  const [selected, setSelected]   = useState(null);
  const [loading, setLoading]     = useState(true);
  const [pan, setPan]             = useState({ x: 24, y: 24 });
  const [dragging, setDragging]   = useState(false);
  const [dragStart, setDragStart] = useState(null);
  const svgRef = useRef(null);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const res = await api.get(`/tasks/workspace/${workspaceId}/graph`);
      setGraph(res.data);
      setLayout(layoutGraph(res.data.nodes, res.data.edges));
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { load(); }, [load]);

  // Pan handlers
  const onMouseDown = (e) => {
    if (e.target.closest("g")) return; // don't pan when clicking a node
    setDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };
  const onMouseMove = (e) => {
    if (!dragging) return;
    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };
  const onMouseUp = () => setDragging(false);

  if (!workspaceId) return null;

  const maxX = layout.positioned.reduce((m, n) => Math.max(m, n.x + NODE_W), 0) + H_GAP;
  const maxY = layout.positioned.reduce((m, n) => Math.max(m, n.y + NODE_H), 0) + V_GAP;

  return (
    <div className="dep-graph-wrap">
      <div className="dep-graph-toolbar">
        <span className="dep-graph-legend">
          <span className="dep-legend-item" style={{ background: "#94a3b8" }}>Todo</span>
          <span className="dep-legend-item" style={{ background: "#6366f1" }}>In Progress</span>
          <span className="dep-legend-item" style={{ background: "#10b981" }}>Done</span>
          <span className="dep-legend-item" style={{ background: "#ef4444" }}>At Risk</span>
        </span>
        <button className="btn-secondary dep-graph-refresh" onClick={load} disabled={loading}>
          {loading ? "Loading…" : "↺ Refresh"}
        </button>
      </div>

      {loading ? (
        <div className="dep-graph-loading">
          <div className="spinner" style={{ width: 24, height: 24 }} />
          <span>Building dependency graph…</span>
        </div>
      ) : layout.positioned.length === 0 ? (
        <div className="dep-graph-empty">
          No tasks found. Create tasks and link dependencies to see the graph.
        </div>
      ) : (
        <div className="dep-graph-canvas-wrap">
          <svg
            ref={svgRef}
            className="dep-graph-svg"
            width="100%"
            height={500}
            style={{ cursor: dragging ? "grabbing" : "grab", userSelect: "none" }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
          >
            <defs>
              <marker id="arrowhead" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
                <path d="M0,0 L0,6 L8,3 z" fill="#94a3b8" />
              </marker>
            </defs>
            <g transform={`translate(${pan.x}, ${pan.y})`}>
              {/* Edges */}
              {layout.edgePaths.map(e => (
                <path
                  key={e.key}
                  d={e.d}
                  fill="none"
                  stroke={e.toId === selected?.id || e.fromId === selected?.id ? "#6366f1" : "#cbd5e1"}
                  strokeWidth={e.toId === selected?.id || e.fromId === selected?.id ? 2 : 1.5}
                  strokeDasharray={e.toId === selected?.id || e.fromId === selected?.id ? "none" : "4 3"}
                  markerEnd="url(#arrowhead)"
                />
              ))}
              {/* Nodes */}
              {layout.positioned.map(node => (
                <GraphNode
                  key={node.id}
                  node={node}
                  selected={selected?.id === node.id}
                  onClick={setSelected}
                />
              ))}
            </g>
          </svg>

          {/* Node detail panel */}
          {selected && (
            <div className="dep-graph-detail">
              <div className="dep-detail-header">
                <span className="dep-detail-title">{selected.title}</span>
                <button onClick={() => setSelected(null)} className="dep-detail-close">✕</button>
              </div>
              <div className="dep-detail-row"><span>Status</span><span className="dep-detail-val" style={{ color: STATUS_COLOR[selected.status] }}>{selected.status}</span></div>
              <div className="dep-detail-row"><span>Priority</span><span className="dep-detail-val">{PRIORITY_ICON[selected.priority]} {selected.priority}</span></div>
              <div className="dep-detail-row"><span>Assignee</span><span className="dep-detail-val">{selected.assignee_name || "—"}</span></div>
              <div className="dep-detail-row"><span>Progress</span><span className="dep-detail-val">{selected.progress || 0}%</span></div>
              {selected.risk_score > 0 && (
                <div className="dep-detail-row">
                  <span>Risk Score</span>
                  <span className="dep-detail-val" style={{ color: RISK_COLOR(selected.risk_score), fontWeight: 700 }}>
                    {selected.risk_score}/100
                  </span>
                </div>
              )}
              {selected.due_date && (
                <div className="dep-detail-row">
                  <span>Due</span>
                  <span className="dep-detail-val">{new Date(selected.due_date).toLocaleDateString()}</span>
                </div>
              )}
              <div className="dep-detail-deps">
                <div className="dep-detail-deps-label">Dependencies</div>
                {graph.edges.filter(e => e.to === selected.id).length === 0 ? (
                  <div className="dep-detail-no-deps">No dependencies</div>
                ) : (
                  graph.edges.filter(e => e.to === selected.id).map(e => {
                    const depNode = graph.nodes.find(n => n.id === e.from);
                    return depNode ? (
                      <div key={e.from} className="dep-detail-dep-item"
                        style={{ color: depNode.status === "done" ? "#10b981" : "#ef4444" }}>
                        {depNode.status === "done" ? "✓" : "⚠"} {depNode.title}
                      </div>
                    ) : null;
                  })
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="dep-graph-hint">Drag to pan · Click node for details · {graph.nodes.length} tasks · {graph.edges.length} dependencies</div>
    </div>
  );
}
