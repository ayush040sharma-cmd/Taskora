import { useState, useEffect, useCallback, useRef } from "react";
import api from "../api/api";

const TABS = [
  { id: "import", label: "Import Tasks", icon: "📥" },
  { id: "status", label: "Status Update", icon: "🔄" },
  { id: "export", label: "Export", icon: "📤" },
  { id: "history", label: "Import History", icon: "📋" },
];

// ── Step indicator ────────────────────────────────────────────────────────────
function Steps({ step }) {
  const steps = ["Upload file", "Preview changes", "Confirm import"];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 28 }}>
      {steps.map((s, i) => (
        <div key={s} style={{ display: "flex", alignItems: "center", flex: i < steps.length - 1 ? 1 : "none" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
              background: step > i ? "var(--tk-accent, #3B82F6)" : step === i ? "var(--tk-accent, #3B82F6)" : "var(--border)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", fontSize: 12, fontWeight: 700,
              border: step === i ? "2px solid var(--tk-accent-2, #06B6D4)" : "none",
            }}>
              {step > i ? "✓" : i + 1}
            </div>
            <span style={{ color: step >= i ? "var(--text-primary)" : "var(--text-secondary)", fontSize: 13, fontWeight: step === i ? 700 : 400 }}>
              {s}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div style={{
              flex: 1, height: 2, margin: "0 12px",
              background: step > i ? "var(--tk-accent, #3B82F6)" : "var(--border)",
              transition: "background 0.3s",
            }} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Drop zone ──────────────────────────────────────────────────────────────────
function DropZone({ onFile, accept = ".xlsx,.xls,.csv" }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  };

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      style={{
        border: `2px dashed ${dragging ? "var(--tk-accent, #3B82F6)" : "var(--border)"}`,
        borderRadius: 12, padding: "40px 20px", textAlign: "center",
        cursor: "pointer", transition: "border-color 0.2s, background 0.2s",
        background: dragging ? "rgba(59,130,246,0.07)" : "var(--main-bg)",
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        style={{ display: "none" }}
        onChange={e => e.target.files[0] && onFile(e.target.files[0])}
      />
      <div style={{ fontSize: 40, marginBottom: 12 }}>📂</div>
      <div style={{ color: "var(--text-primary)", fontSize: 15, fontWeight: 600, marginBottom: 8 }}>
        Drop your Excel or CSV file here
      </div>
      <div style={{ color: "var(--text-secondary)", fontSize: 13 }}>
        Supports .xlsx, .xls, .csv · Max 10 MB
      </div>
      <div style={{ marginTop: 16 }}>
        <span style={{
          background: "var(--tk-accent, #3B82F6)", color: "#fff", padding: "8px 20px",
          borderRadius: 8, fontSize: 13, fontWeight: 600, display: "inline-block",
        }}>
          Browse files
        </span>
      </div>
    </div>
  );
}

// ── Preview table ─────────────────────────────────────────────────────────────
function PreviewTable({ data, type }) {
  if (!data || data.length === 0) {
    return <div style={{ color: "var(--text-secondary)", textAlign: "center", padding: 24 }}>None</div>;
  }
  const isError = type === "errors";
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr>
            {isError ? (
              <>
                <th style={th}>Row</th>
                <th style={th}>Title / Task ID</th>
                <th style={th}>Error(s)</th>
              </>
            ) : (
              <>
                <th style={th}>Row</th>
                <th style={th}>Title</th>
                <th style={th}>Status</th>
                <th style={th}>Priority</th>
                <th style={th}>Assignee</th>
                {type === "skipped" && <th style={th}>Reason</th>}
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {data.map((r, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? "var(--main-bg)" : "transparent" }}>
              {isError ? (
                <>
                  <td style={td}>{r.row}</td>
                  <td style={td}>{r.title || r.task_id || "—"}</td>
                  <td style={{ ...td, color: "#ef4444" }}>
                    {Array.isArray(r.errors) ? r.errors.join("; ") : r.message || r.error || "Unknown error"}
                  </td>
                </>
              ) : (
                <>
                  <td style={td}>{r.row}</td>
                  <td style={td}>{r.title}</td>
                  {type !== "skipped" && <td style={td}>{r.status}</td>}
                  {type !== "skipped" && <td style={td}>{r.priority}</td>}
                  {type !== "skipped" && <td style={td}>{r.assignee_email || "—"}</td>}
                  {type === "skipped" && <td style={{ ...td, color: "#f59e0b" }}>{r.reason}</td>}
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const th = { padding: "8px 12px", textAlign: "left", color: "var(--text-secondary)", fontWeight: 700, borderBottom: "1px solid var(--border)" };
const td = { padding: "8px 12px", color: "var(--text-secondary)", borderBottom: "1px solid var(--card-bg)" };

// ── Import Tasks tab ──────────────────────────────────────────────────────────
function ImportTasksTab({ workspaceId }) {
  const [step, setStep]               = useState(0);
  const [file, setFile]               = useState(null);
  const [preview, setPreview]         = useState(null);
  const [uploading, setUploading]     = useState(false);
  const [confirming, setConfirming]   = useState(false);
  const [result, setResult]           = useState(null);
  const [previewTab, setPreviewTab]   = useState("created");
  const [error, setError]             = useState(null);

  const downloadTemplate = async () => {
    try {
      const res = await api.get("/import/template?type=tasks", { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a"); a.href = url;
      a.download = "taskora-tasks-template.xlsx"; a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Failed to download template");
    }
  };

  const handleFile = useCallback(async (f) => {
    setFile(f);
    setError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", f);
      const { data } = await api.post(`/import/tasks/${workspaceId}`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setPreview(data);
      setStep(1);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to parse file. Check the format.");
    } finally {
      setUploading(false);
    }
  }, [workspaceId]);

  const confirmImport = async () => {
    if (!preview) return;
    setConfirming(true);
    try {
      const { data } = await api.post(`/import/tasks/${workspaceId}/confirm`, {
        created: preview.created,
        updated: preview.updated,
        filename: file?.name,
      });
      setResult(data);
      setStep(2);
    } catch (err) {
      setError(err.response?.data?.message || "Import failed");
    } finally {
      setConfirming(false);
    }
  };

  const reset = () => {
    setStep(0); setFile(null); setPreview(null); setResult(null); setError(null);
  };

  return (
    <div>
      <Steps step={step} />

      {error && (
        <div style={{
          background: "#7f1d1d22", border: "1px solid #ef4444", borderRadius: 10,
          padding: "12px 16px", color: "#fca5a5", fontSize: 13, marginBottom: 20,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          {error}
          <button onClick={() => setError(null)} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer" }}>✕</button>
        </div>
      )}

      {/* Step 0: Upload */}
      {step === 0 && (
        <>
          <div style={{ marginBottom: 20 }}>
            <div style={{
              background: "var(--card-bg)", borderRadius: 10, padding: "14px 16px",
              border: "1px solid var(--border)", display: "flex", alignItems: "center",
              justifyContent: "space-between", marginBottom: 16,
            }}>
              <div>
                <div style={{ color: "var(--text-primary)", fontWeight: 600, fontSize: 14 }}>Download template first</div>
                <div style={{ color: "var(--text-secondary)", fontSize: 12, marginTop: 2 }}>
                  Use the official template to ensure columns match. Fill it in, then upload.
                </div>
              </div>
              <button
                onClick={downloadTemplate}
                style={{
                  background: "var(--border)", border: "none", borderRadius: 8,
                  padding: "8px 16px", color: "var(--text-primary)", fontSize: 13, fontWeight: 600,
                  cursor: "pointer", flexShrink: 0,
                }}
              >
                ⬇ Download Template
              </button>
            </div>
            {uploading ? (
              <div style={{
                border: "2px dashed var(--tk-accent, #3B82F6)", borderRadius: 12, padding: "60px 20px",
                textAlign: "center", background: "rgba(59,130,246,0.07)",
              }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>⏳</div>
                <div style={{ color: "var(--text-primary)", fontWeight: 600 }}>Parsing {file?.name}…</div>
              </div>
            ) : (
              <DropZone onFile={handleFile} />
            )}
          </div>
        </>
      )}

      {/* Step 1: Preview */}
      {step === 1 && preview && (
        <>
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24,
          }}>
            {[
              { label: "To create", count: preview.summary.to_create, color: "#22c55e", id: "created" },
              { label: "To update", count: preview.summary.to_update, color: "#3b82f6", id: "updated" },
              { label: "To skip", count: preview.summary.to_skip, color: "#f59e0b", id: "skipped" },
              { label: "Errors", count: preview.summary.errors, color: "#ef4444", id: "errors" },
            ].map(item => (
              <div
                key={item.id}
                onClick={() => setPreviewTab(item.id)}
                style={{
                  background: previewTab === item.id ? item.color + "22" : "var(--card-bg)",
                  border: `1px solid ${previewTab === item.id ? item.color : "var(--border)"}`,
                  borderRadius: 10, padding: "14px 16px", cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                <div style={{ color: item.color, fontSize: 24, fontWeight: 800 }}>{item.count}</div>
                <div style={{ color: "var(--text-secondary)", fontSize: 12, marginTop: 4 }}>{item.label}</div>
              </div>
            ))}
          </div>

          <div style={{
            background: "var(--main-bg)", borderRadius: 12, border: "1px solid var(--border)",
            overflow: "hidden", marginBottom: 24, maxHeight: 340, overflowY: "auto",
          }}>
            <div style={{ padding: "10px 12px", background: "var(--card-bg)", borderBottom: "1px solid var(--border)" }}>
              <span style={{ color: "var(--text-secondary)", fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>
                {previewTab === "created" ? "Tasks to create" :
                 previewTab === "updated" ? "Tasks to update" :
                 previewTab === "skipped" ? "Rows to skip" : "Validation errors"}
              </span>
            </div>
            <PreviewTable
              data={preview[previewTab]}
              type={previewTab}
            />
          </div>

          {preview.summary.errors > 0 && (
            <div style={{
              background: "#f59e0b22", border: "1px solid #f59e0b", borderRadius: 8,
              padding: "10px 14px", color: "#fbbf24", fontSize: 13, marginBottom: 16,
            }}>
              ⚠ {preview.summary.errors} row{preview.summary.errors > 1 ? "s" : ""} have errors and will be skipped.
              Only valid rows ({preview.summary.to_create + preview.summary.to_update}) will be imported.
            </div>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={reset} style={{
              background: "var(--border)", border: "none", borderRadius: 8,
              padding: "10px 20px", color: "var(--text-secondary)", fontSize: 14, cursor: "pointer",
            }}>
              ← Upload different file
            </button>
            <button
              onClick={confirmImport}
              disabled={confirming || (preview.summary.to_create + preview.summary.to_update === 0)}
              style={{
                background: "var(--tk-accent, #3B82F6)", border: "none", borderRadius: 8,
                padding: "10px 20px", color: "#fff", fontSize: 14, fontWeight: 700,
                cursor: "pointer", opacity: (confirming || preview.summary.to_create + preview.summary.to_update === 0) ? 0.5 : 1,
              }}
            >
              {confirming ? "Importing…" : `Import ${preview.summary.to_create + preview.summary.to_update} tasks`}
            </button>
          </div>
        </>
      )}

      {/* Step 2: Result */}
      {step === 2 && result && (
        <div style={{ textAlign: "center", padding: "40px 0" }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>
            {result.errors > 0 ? "⚠" : "✅"}
          </div>
          <h3 style={{ color: "var(--text-primary)", fontSize: 22, fontWeight: 800, margin: "0 0 8px" }}>
            Import {result.errors > 0 ? "completed with warnings" : "successful!"}
          </h3>
          <div style={{ display: "flex", gap: 24, justifyContent: "center", margin: "24px 0" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ color: "#22c55e", fontSize: 32, fontWeight: 800 }}>{result.created}</div>
              <div style={{ color: "var(--text-secondary)", fontSize: 13 }}>Tasks created</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ color: "#3b82f6", fontSize: 32, fontWeight: 800 }}>{result.updated}</div>
              <div style={{ color: "var(--text-secondary)", fontSize: 13 }}>Tasks updated</div>
            </div>
            {result.errors > 0 && (
              <div style={{ textAlign: "center" }}>
                <div style={{ color: "#ef4444", fontSize: 32, fontWeight: 800 }}>{result.errors}</div>
                <div style={{ color: "var(--text-secondary)", fontSize: 13 }}>Errors</div>
              </div>
            )}
          </div>
          <button
            onClick={reset}
            style={{
              background: "var(--tk-accent, #3B82F6)", border: "none", borderRadius: 8,
              padding: "12px 24px", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer",
            }}
          >
            Import another file
          </button>
        </div>
      )}
    </div>
  );
}

// ── Status Import tab ─────────────────────────────────────────────────────────
function StatusImportTab({ workspaceId }) {
  const [file, setFile]       = useState(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult]   = useState(null);
  const [error, setError]     = useState(null);

  const downloadTemplate = async () => {
    try {
      const res = await api.get("/import/template?type=status", { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a"); a.href = url;
      a.download = "taskora-status-template.xlsx"; a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Failed to download template");
    }
  };

  const handleFile = useCallback(async (f) => {
    setFile(f); setError(null); setResult(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", f);
      const { data } = await api.post(`/import/status/${workspaceId}`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(data);
    } catch (err) {
      setError(err.response?.data?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }, [workspaceId]);

  return (
    <div>
      <div style={{
        background: "var(--card-bg)", borderRadius: 10, padding: "14px 16px",
        border: "1px solid var(--border)", display: "flex", alignItems: "center",
        justifyContent: "space-between", marginBottom: 20,
      }}>
        <div>
          <div style={{ color: "var(--text-primary)", fontWeight: 600, fontSize: 14 }}>Daily status template</div>
          <div style={{ color: "var(--text-secondary)", fontSize: 12, marginTop: 2 }}>
            Columns: task_id, status, progress_percent, comment
          </div>
        </div>
        <button onClick={downloadTemplate} style={{
          background: "var(--border)", border: "none", borderRadius: 8,
          padding: "8px 16px", color: "var(--text-primary)", fontSize: 13, fontWeight: 600, cursor: "pointer",
        }}>
          ⬇ Template
        </button>
      </div>

      {error && (
        <div style={{
          background: "#7f1d1d22", border: "1px solid #ef4444", borderRadius: 10,
          padding: "12px 16px", color: "#fca5a5", fontSize: 13, marginBottom: 16,
        }}>{error}</div>
      )}

      {!result ? (
        uploading ? (
          <div style={{ border: "2px dashed var(--tk-accent, #3B82F6)", borderRadius: 12, padding: "60px 20px", textAlign: "center", background: "rgba(59,130,246,0.07)" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>⏳</div>
            <div style={{ color: "var(--text-primary)", fontWeight: 600 }}>Updating tasks from {file?.name}…</div>
          </div>
        ) : (
          <DropZone onFile={handleFile} />
        )
      ) : (
        <div style={{ textAlign: "center", padding: "40px 0" }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>{result.errors > 0 ? "⚠" : "✅"}</div>
          <h3 style={{ color: "var(--text-primary)", fontSize: 20, fontWeight: 800, margin: "0 0 16px" }}>
            Status import {result.errors > 0 ? "done with warnings" : "complete"}
          </h3>
          <div style={{ display: "flex", gap: 24, justifyContent: "center", margin: "0 0 24px" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ color: "#22c55e", fontSize: 28, fontWeight: 800 }}>{result.updated}</div>
              <div style={{ color: "var(--text-secondary)", fontSize: 13 }}>Tasks updated</div>
            </div>
            {result.errors > 0 && (
              <div style={{ textAlign: "center" }}>
                <div style={{ color: "#ef4444", fontSize: 28, fontWeight: 800 }}>{result.errors}</div>
                <div style={{ color: "var(--text-secondary)", fontSize: 13 }}>Errors</div>
              </div>
            )}
          </div>
          <button onClick={() => { setResult(null); setFile(null); }} style={{
            background: "var(--tk-accent, #3B82F6)", border: "none", borderRadius: 8,
            padding: "10px 24px", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer",
          }}>
            Upload another
          </button>
        </div>
      )}
    </div>
  );
}

// ── Export tab ────────────────────────────────────────────────────────────────
function ExportTab({ workspaceId }) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(null);

  const exportTasks = async () => {
    setDownloading(true); setError(null);
    try {
      const res = await api.get(`/import/tasks/${workspaceId}/export`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const disposition = res.headers["content-disposition"] || "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] || `tasks-export.xlsx`;
      const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.response?.data?.message || "Export failed");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div style={{ textAlign: "center", padding: "40px 0" }}>
      <div style={{ fontSize: 56, marginBottom: 20 }}>📊</div>
      <h3 style={{ color: "var(--text-primary)", fontSize: 20, fontWeight: 800, margin: "0 0 8px" }}>Export all workspace tasks</h3>
      <p style={{ color: "var(--text-secondary)", fontSize: 14, margin: "0 0 32px", maxWidth: 400, marginInline: "auto" }}>
        Download all tasks as an Excel file with full details: status, priority, assignee, team, dates, and progress.
      </p>
      {error && (
        <div style={{
          background: "#7f1d1d22", border: "1px solid #ef4444", borderRadius: 8,
          padding: "10px 14px", color: "#fca5a5", fontSize: 13, marginBottom: 20, display: "inline-block",
        }}>{error}</div>
      )}
      <button
        onClick={exportTasks}
        disabled={downloading}
        style={{
          background: downloading ? "var(--border)" : "var(--tk-accent, #3B82F6)",
          border: "none", borderRadius: 10, padding: "14px 32px",
          color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer",
          opacity: downloading ? 0.7 : 1,
        }}
      >
        {downloading ? "Preparing export…" : "⬇ Download Excel"}
      </button>
    </div>
  );
}

// ── History tab ───────────────────────────────────────────────────────────────
function HistoryTab({ workspaceId }) {
  const [logs, setLogs]     = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/import/logs/${workspaceId}`);
      setLogs(data);
    } catch {}
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => { load(); }, [load]);

  const STATUS_COLOR = { completed: "#22c55e", partial: "#f59e0b", failed: "#ef4444" };

  return (
    <div>
      {loading ? (
        <div style={{ textAlign: "center", color: "var(--text-secondary)", padding: 40 }}>Loading history…</div>
      ) : logs.length === 0 ? (
        <div style={{ textAlign: "center", color: "var(--text-secondary)", padding: 60 }}>No import history yet</div>
      ) : (
        <div style={{ background: "var(--main-bg)", borderRadius: 12, border: "1px solid var(--border)", overflow: "hidden" }}>
          <div style={{
            display: "grid", gridTemplateColumns: "2fr 1fr 3fr 1fr",
            padding: "10px 16px", background: "var(--card-bg)", borderBottom: "1px solid var(--border)",
            color: "var(--text-secondary)", fontSize: 11, fontWeight: 700, textTransform: "uppercase",
          }}>
            <div>File</div>
            <div>Type</div>
            <div>Results</div>
            <div>Date</div>
          </div>
          {logs.map((log, i) => (
            <div key={log.id} style={{
              display: "grid", gridTemplateColumns: "2fr 1fr 3fr 1fr",
              padding: "12px 16px", borderBottom: i < logs.length - 1 ? "1px solid var(--card-bg)" : "none",
            }}>
              <div style={{ color: "var(--text-primary)", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {log.filename || "—"}
              </div>
              <div>
                <span style={{
                  background: "var(--border)", color: "var(--text-secondary)", fontSize: 11,
                  padding: "2px 8px", borderRadius: 4, textTransform: "uppercase",
                }}>
                  {log.import_type}
                </span>
              </div>
              <div style={{ color: "var(--text-secondary)", fontSize: 12 }}>
                <span style={{ color: "#22c55e" }}>+{log.created_count} created</span>
                {log.updated_count > 0 && <span style={{ color: "#3b82f6", marginLeft: 10 }}>~{log.updated_count} updated</span>}
                {log.error_count > 0 && <span style={{ color: "#ef4444", marginLeft: 10 }}>{log.error_count} errors</span>}
                <span style={{ marginLeft: 10 }}>· total {log.total_rows}</span>
              </div>
              <div style={{ color: "var(--text-secondary)", fontSize: 12 }}>
                {new Date(log.created_at).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main ImportWizard ─────────────────────────────────────────────────────────
export default function ImportWizard({ workspaceId }) {
  const [tab, setTab] = useState("import");

  return (
    <div style={{ paddingBottom: 40 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ color: "var(--text-primary)", fontSize: 22, fontWeight: 800, margin: "0 0 4px" }}>Import / Export</h2>
        <p style={{ color: "var(--text-secondary)", fontSize: 14, margin: 0 }}>
          Bulk-manage tasks with Excel or CSV files
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 28, background: "var(--main-bg)", borderRadius: 10, padding: 4, border: "1px solid var(--card-bg)", width: "fit-content" }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              background: tab === t.id ? "var(--card-bg)" : "none",
              border: tab === t.id ? "1px solid var(--border)" : "1px solid transparent",
              borderRadius: 8, padding: "8px 16px",
              color: tab === t.id ? "var(--text-primary)" : "var(--text-secondary)",
              fontSize: 13, fontWeight: tab === t.id ? 700 : 400, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ background: "var(--card-bg)", borderRadius: 16, padding: 28, border: "1px solid var(--border)" }}>
        {tab === "import"  && <ImportTasksTab workspaceId={workspaceId} />}
        {tab === "status"  && <StatusImportTab workspaceId={workspaceId} />}
        {tab === "export"  && <ExportTab workspaceId={workspaceId} />}
        {tab === "history" && <HistoryTab workspaceId={workspaceId} />}
      </div>
    </div>
  );
}
