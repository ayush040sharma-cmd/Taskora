import { useState, useEffect, useCallback } from "react";
import api from "../api/api";

const TYPE_ICONS = {
  leave: "🏖️", wfh: "🏠", expense: "💳", overtime: "⏱️",
  task_completion: "✅", access_request: "🔑", timesheet: "📋",
  shift_change: "🔄", purchase: "🛒", document: "📄", release: "🚀", other: "📝",
};

const STATUS_STYLES = {
  pending:        "bg-yellow-100 text-yellow-700",
  approved:       "bg-green-100 text-green-700",
  rejected:       "bg-red-100 text-red-600",
  cancelled:      "bg-gray-100 text-gray-500",
  escalated:      "bg-purple-100 text-purple-700",
  info_requested: "bg-blue-100 text-blue-700",
};

function StatCard({ label, value, sub, color = "indigo" }) {
  const colors = {
    indigo: "bg-indigo-50 text-indigo-700",
    red:    "bg-red-50 text-red-600",
    green:  "bg-green-50 text-green-700",
    yellow: "bg-yellow-50 text-yellow-600",
  };
  return (
    <div className={`rounded-xl p-4 ${colors[color]} space-y-1`}>
      <div className="text-2xl font-bold">{value ?? "–"}</div>
      <div className="text-sm font-medium">{label}</div>
      {sub && <div className="text-xs opacity-70">{sub}</div>}
    </div>
  );
}

function ApprovalCard({ req, onAction, isApprover }) {
  const [note, setNote]         = useState("");
  const [showNote, setShowNote] = useState(false);
  const [actionType, setActionType] = useState(""); // "approve"|"reject"|"info"

  function startAction(type) {
    setActionType(type);
    setShowNote(true);
    setNote("");
  }

  function submit() {
    if (actionType === "reject" && !note.trim()) {
      alert("A rejection reason is required.");
      return;
    }
    onAction(req.id, actionType, note.trim());
    setShowNote(false);
  }

  const metaEntries = Object.entries(req.metadata || {}).filter(([,v]) => v !== null && v !== undefined);

  return (
    <div className={`border rounded-xl p-4 space-y-3 ${req.is_overdue ? "border-red-300 bg-red-50/30" : "bg-white"}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <span className="text-xl mt-0.5 shrink-0">{TYPE_ICONS[req.type] || "📝"}</span>
          <div className="min-w-0">
            <div className="font-medium text-gray-900 truncate">{req.subject}</div>
            <div className="text-xs text-gray-500">
              {req.type.replace(/_/g, " ")} · {req.requester_name}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {req.is_overdue && (
            <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">Overdue</span>
          )}
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[req.status] || "bg-gray-100 text-gray-600"}`}>
            {req.status.replace(/_/g, " ")}
          </span>
        </div>
      </div>

      {/* Description */}
      {req.description && (
        <p className="text-sm text-gray-600 line-clamp-2">{req.description}</p>
      )}

      {/* Metadata pills */}
      {metaEntries.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {metaEntries.slice(0, 5).map(([k, v]) => (
            <span key={k} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
              {k.replace(/_/g, " ")}: <strong>{String(v)}</strong>
            </span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>Due: {req.due_at ? new Date(req.due_at).toLocaleDateString() : "–"}</span>
        <span>Submitted: {new Date(req.created_at).toLocaleDateString()}</span>
      </div>

      {/* Decision note */}
      {req.decision_note && (
        <div className="text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
          <span className="font-medium">Note:</span> {req.decision_note}
        </div>
      )}

      {/* Actions (approver only, pending/info_requested) */}
      {isApprover && ["pending","info_requested"].includes(req.status) && !showNote && (
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => onAction(req.id, "approve", "")}
            className="flex-1 text-sm py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            Approve
          </button>
          <button
            onClick={() => startAction("reject")}
            className="flex-1 text-sm py-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600"
          >
            Decline
          </button>
          <button
            onClick={() => startAction("info")}
            className="flex-1 text-sm py-1.5 border text-gray-600 rounded-lg hover:bg-gray-50"
          >
            Ask Info
          </button>
        </div>
      )}

      {/* Note input for reject/info */}
      {showNote && (
        <div className="space-y-2">
          <textarea
            className="w-full border rounded-lg px-3 py-2 text-sm resize-none"
            rows={2}
            placeholder={actionType === "reject" ? "Reason for declining (required)..." : "What information do you need?"}
            value={note}
            onChange={e => setNote(e.target.value)}
            autoFocus
          />
          <div className="flex gap-2">
            <button
              onClick={submit}
              className="px-4 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              Confirm
            </button>
            <button
              onClick={() => setShowNote(false)}
              className="px-4 py-1.5 text-sm border rounded-lg text-gray-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Submit new request modal
function SubmitModal({ onClose, onSubmit }) {
  const TYPES = ["leave","wfh","expense","overtime","task_completion","access_request",
                 "timesheet","shift_change","purchase","document","release","other"];
  const [form, setForm] = useState({ type: "leave", subject: "", description: "", sla_hours: 24 });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl space-y-4">
        <h3 className="font-semibold text-lg">Submit Request</h3>
        <div className="space-y-3">
          <select
            value={form.type}
            onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          >
            {TYPES.map(t => (
              <option key={t} value={t}>{TYPE_ICONS[t]} {t.replace(/_/g, " ")}</option>
            ))}
          </select>
          <input
            placeholder="Subject / title *"
            value={form.subject}
            onChange={e => setForm(p => ({ ...p, subject: e.target.value }))}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
          <textarea
            placeholder="Description (optional)"
            value={form.description}
            onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
            rows={3}
            className="w-full border rounded-lg px-3 py-2 text-sm resize-none"
          />
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-600 shrink-0">SLA (hours)</label>
            <input
              type="number"
              min={1}
              max={168}
              value={form.sla_hours}
              onChange={e => setForm(p => ({ ...p, sla_hours: parseInt(e.target.value) || 24 }))}
              className="w-24 border rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm border rounded-lg">Cancel</button>
          <button
            onClick={() => { if (form.subject) onSubmit(form); }}
            className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            Submit
          </button>
        </div>
      </div>
    </div>
  );
}

export default function EnterpriseApprovalCenter() {
  const [tab, setTab]           = useState("pending");
  const [requests, setRequests] = useState([]);
  const [stats, setStats]       = useState({});
  const [loading, setLoading]   = useState(true);
  const [typeFilter, setTypeFilter] = useState("all");
  const [showSubmit, setShowSubmit] = useState(false);

  const TABS = [
    { id: "pending",  label: "Pending My Action" },
    { id: "mine",     label: "My Requests" },
    { id: "all",      label: "All (Approver)" },
  ];

  const TYPES = ["all","leave","wfh","expense","overtime","task_completion",
                 "access_request","timesheet","shift_change","purchase","document","release"];

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, reqRes] = await Promise.all([
        api.get("/approvals-engine/stats"),
        tab === "pending"
          ? api.get("/approvals-engine/pending")
          : api.get("/approvals-engine", {
              params: {
                view: tab === "mine" ? "mine" : "approver",
                type: typeFilter !== "all" ? typeFilter : undefined,
              },
            }),
      ]);
      setStats(statsRes.data);
      setRequests(reqRes.data);
    } finally {
      setLoading(false);
    }
  }, [tab, typeFilter]);

  useEffect(() => { load(); }, [load]);

  async function handleAction(id, actionType, note) {
    try {
      await api.put(
        `/approvals-engine/${id}/${actionType}`,
        { decision_note: note || undefined }
      );
      load();
    } catch (err) {
      alert(err.response?.data?.message || "Action failed");
    }
  }

  async function submitRequest(form) {
    try {
      await api.post("/approvals-engine", form);
      setShowSubmit(false);
      load();
    } catch (err) {
      alert(err.response?.data?.message || "Submit failed");
    }
  }

  const isApproverView = tab !== "mine";

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Approval Center</h1>
          <p className="text-sm text-gray-500 mt-1">Review, approve, and track all approval requests.</p>
        </div>
        <button
          onClick={() => setShowSubmit(true)}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700"
        >
          + New Request
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Pending Your Action" value={stats.pending_approvals} color="yellow" />
        <StatCard label="Overdue" value={stats.overdue_approvals} color="red" />
        <StatCard label="Approved Today" value={stats.approved_today} color="green" />
        <StatCard label="My Pending Requests" value={stats.my_pending_requests} color="indigo" />
      </div>

      {/* Tabs */}
      <div className="flex border-b gap-1">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition -mb-px ${
              tab === t.id
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Type filter */}
      {tab !== "pending" && (
        <div className="flex gap-2 flex-wrap">
          {TYPES.map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`text-xs px-3 py-1.5 rounded-full border transition ${
                typeFilter === t
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "text-gray-600 border-gray-200 hover:border-indigo-400"
              }`}
            >
              {t !== "all" && TYPE_ICONS[t]} {t.replace(/_/g, " ")}
            </button>
          ))}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="text-center text-gray-400 py-16">Loading...</div>
      ) : requests.length === 0 ? (
        <div className="text-center text-gray-400 py-16">
          <div className="text-4xl mb-3">🎉</div>
          <div>No requests here.</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {requests.map(req => (
            <ApprovalCard
              key={req.id}
              req={req}
              onAction={handleAction}
              isApprover={isApproverView}
            />
          ))}
        </div>
      )}

      {showSubmit && (
        <SubmitModal
          onClose={() => setShowSubmit(false)}
          onSubmit={submitRequest}
        />
      )}
    </div>
  );
}
