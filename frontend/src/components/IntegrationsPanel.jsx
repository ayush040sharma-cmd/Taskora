import { useState, useEffect, useRef } from "react";
import api from "../api/api";

const INTEGRATIONS_META = {
  slack: {
    label: "Slack",
    icon: "💬",
    description: "Send AI risk alerts and task updates to a Slack channel.",
    fields: [
      { key: "webhook_url", label: "Incoming Webhook URL", type: "url", placeholder: "https://hooks.slack.com/services/..." },
      { key: "notify_critical", label: "Notify on critical alerts only", type: "checkbox" },
    ],
  },
  github: {
    label: "GitHub",
    icon: "🐙",
    description: "Link commits to tasks via message keywords (fixes #123). Paste your repo's full name.",
    fields: [
      { key: "repo", label: "Repository (owner/repo)", type: "text", placeholder: "acme/my-project" },
      { key: "webhook_secret", label: "Webhook Secret (optional)", type: "password", placeholder: "leave blank to skip verification" },
    ],
  },
  jira: {
    label: "Jira Import",
    icon: "🟦",
    description: "Import tasks from a Jira CSV export. Download from Jira → Issues → Export → CSV.",
    fields: [],
  },
  email: {
    label: "Email Digest",
    icon: "📧",
    description: "Receive a weekly summary of at-risk tasks and team workload by email.",
    fields: [
      { key: "digest_email", label: "Send digest to", type: "email", placeholder: "you@company.com" },
      { key: "frequency", label: "Frequency", type: "select", options: ["daily", "weekly"] },
    ],
  },
};

function IntegrationCard({ type, meta, current, workspaceId, onSaved }) {
  const [open, setOpen]       = useState(false);
  const [enabled, setEnabled] = useState(current?.enabled || false);
  const [form, setForm]       = useState({});
  const [saving, setSaving]   = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus]   = useState(null); // { ok, msg }
  const fileRef = useRef(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    setEnabled(current?.enabled || false);
  }, [current]);

  const save = async () => {
    setSaving(true);
    setStatus(null);
    try {
      // Only send non-empty config values to avoid wiping existing secrets
      const patch = {};
      Object.entries(form).forEach(([k, v]) => { if (v !== "") patch[k] = v; });

      await api.put(`/integrations/${workspaceId}/${type}`, { enabled, config: patch });
      setStatus({ ok: true, msg: "Saved!" });
      onSaved();
      setForm({});
    } catch (err) {
      setStatus({ ok: false, msg: err.response?.data?.message || "Save failed" });
    } finally {
      setSaving(false);
    }
  };

  const testSlack = async () => {
    setTesting(true);
    setStatus(null);
    try {
      // If a new URL was entered, save first
      if (form.webhook_url) await save();
      await api.post(`/integrations/${workspaceId}/slack/test`);
      setStatus({ ok: true, msg: "Test message sent to Slack!" });
    } catch (err) {
      setStatus({ ok: false, msg: err.response?.data?.message || "Test failed" });
    } finally {
      setTesting(false);
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setStatus(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api.post(`/integrations/${workspaceId}/jira/import`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setStatus({ ok: true, msg: `Imported ${res.data.imported} of ${res.data.total} tasks` });
      onSaved();
    } catch (err) {
      setStatus({ ok: false, msg: err.response?.data?.message || "Import failed" });
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  };

  return (
    <div className="integration-card" style={{ borderColor: open ? "#6366f1" : "#e2e8f0" }}>
      <div className="integration-card-header" onClick={() => setOpen(v => !v)} style={{ cursor: "pointer" }}>
        <div className="integration-card-title">
          <span className="integration-icon">{meta.icon}</span>
          <div>
            <div className="integration-label">{meta.label}</div>
            <div className="integration-desc">{meta.description}</div>
          </div>
        </div>
        <div className="integration-card-right">
          {current?.enabled && <span className="integration-badge-on">Active</span>}
          <span className="integration-chevron">{open ? "▲" : "▼"}</span>
        </div>
      </div>

      {open && (
        <div className="integration-card-body">
          {/* Enable toggle */}
          <label className="integration-toggle-row">
            <span>Enable {meta.label}</span>
            <input
              type="checkbox"
              checked={enabled}
              onChange={e => setEnabled(e.target.checked)}
            />
          </label>

          {/* Fields */}
          {meta.fields.map(field => {
            if (field.type === "checkbox") {
              return (
                <label key={field.key} className="integration-toggle-row" style={{ marginTop: 8 }}>
                  <span>{field.label}</span>
                  <input
                    type="checkbox"
                    checked={!!form[field.key]}
                    onChange={e => setForm(p => ({ ...p, [field.key]: e.target.checked }))}
                  />
                </label>
              );
            }
            if (field.type === "select") {
              return (
                <div key={field.key} className="integration-field">
                  <label>{field.label}</label>
                  <select
                    value={form[field.key] || ""}
                    onChange={e => setForm(p => ({ ...p, [field.key]: e.target.value }))}
                  >
                    <option value="">Select…</option>
                    {(field.options || []).map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              );
            }
            return (
              <div key={field.key} className="integration-field">
                <label>
                  {field.label}
                  {current?.config?.[`${field.key}_set`] && (
                    <span className="integration-set-badge"> (already set — leave blank to keep)</span>
                  )}
                </label>
                <input
                  type={field.type}
                  value={form[field.key] !== undefined ? form[field.key] : ""}
                  placeholder={field.placeholder || ""}
                  onChange={e => setForm(p => ({ ...p, [field.key]: e.target.value }))}
                />
              </div>
            );
          })}

          {/* Jira file upload */}
          {type === "jira" && (
            <div className="integration-field">
              <label>Upload Jira CSV Export</label>
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                style={{ display: "none" }}
                onChange={handleImport}
              />
              <button
                className="integration-upload-btn"
                onClick={() => fileRef.current?.click()}
                disabled={importing}
              >
                {importing ? "Importing…" : "Choose CSV file…"}
              </button>
            </div>
          )}

          {/* GitHub webhook instructions */}
          {type === "github" && (
            <div className="integration-info-box">
              <strong>Setup:</strong> In your GitHub repo → Settings → Webhooks → Add webhook.<br />
              Set Payload URL to: <code>{window.location.origin.replace(':5173', ':3001')}/api/integrations/github/webhook</code><br />
              Content type: <code>application/json</code>
            </div>
          )}

          {/* Actions */}
          <div className="integration-actions">
            <button className="btn-primary" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
            {type === "slack" && (
              <button className="btn-secondary" onClick={testSlack} disabled={testing || saving}>
                {testing ? "Sending…" : "Send test message"}
              </button>
            )}
          </div>

          {status && (
            <div className={`integration-status ${status.ok ? "ok" : "err"}`}>
              {status.ok ? "✓" : "✗"} {status.msg}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function IntegrationsPanel({ workspaceId }) {
  const [integrations, setIntegrations] = useState([]);
  const [events, setEvents]             = useState([]);
  const [loading, setLoading]           = useState(true);
  const [showEvents, setShowEvents]     = useState(false);

  const load = async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const [intRes, evRes] = await Promise.all([
        api.get(`/integrations/${workspaceId}`),
        api.get(`/integrations/${workspaceId}/events`),
      ]);
      setIntegrations(intRes.data);
      setEvents(evRes.data);
    } catch {
      // Non-blocking
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [workspaceId]); // eslint-disable-line

  const getCurrent = (type) => integrations.find(i => i.type === type) || null;

  if (!workspaceId) return null;

  return (
    <div className="integrations-panel">
      <div className="integrations-header">
        <h2>Integrations</h2>
        <p>Connect Taskora with your existing tools.</p>
      </div>

      {loading ? (
        <div className="integrations-loading">
          <div className="spinner" style={{ width: 20, height: 20 }} />
          <span>Loading…</span>
        </div>
      ) : (
        <>
          <div className="integrations-grid">
            {Object.entries(INTEGRATIONS_META).map(([type, meta]) => (
              <IntegrationCard
                key={type}
                type={type}
                meta={meta}
                current={getCurrent(type)}
                workspaceId={workspaceId}
                onSaved={load}
              />
            ))}
          </div>

          {/* Event log */}
          <div className="integrations-events">
            <button
              className="integrations-events-toggle"
              onClick={() => setShowEvents(v => !v)}
            >
              {showEvents ? "▲" : "▼"} Integration event log ({events.length})
            </button>

            {showEvents && (
              <div className="integrations-events-list">
                {events.length === 0 ? (
                  <div className="integrations-no-events">No events yet.</div>
                ) : (
                  events.map(e => (
                    <div key={e.id} className={`integration-event-row ${e.status}`}>
                      <span className="ie-type">{e.integration_type}</span>
                      <span className="ie-event">{e.event_type}</span>
                      <span className={`ie-status ${e.status}`}>{e.status}</span>
                      {e.error_message && <span className="ie-error">{e.error_message}</span>}
                      <span className="ie-time">{new Date(e.created_at).toLocaleString()}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
