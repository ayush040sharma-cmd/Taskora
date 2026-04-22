/**
 * Integration Layer — REST API
 *
 * GET    /api/integrations/:workspaceId           → list integrations for workspace
 * PUT    /api/integrations/:workspaceId/:type      → upsert integration config
 * DELETE /api/integrations/:workspaceId/:type      → remove integration
 * POST   /api/integrations/:workspaceId/slack/test → test Slack webhook
 * POST   /api/integrations/github/webhook          → receive GitHub webhook (public, no auth)
 * POST   /api/integrations/:workspaceId/jira/import → import Jira CSV
 * POST   /api/integrations/:workspaceId/notify/slack → manually trigger Slack alert
 */

const express = require("express");
const multer  = require("multer");
const axios   = require("axios");
const router  = express.Router();
const pool    = require("../db");
const auth    = require("../middleware/auth");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// ── Helpers ───────────────────────────────────────────────────────────────────

async function logEvent(workspaceId, integrationType, eventType, payload, status = "ok", error = null) {
  await pool.query(
    `INSERT INTO integration_events (workspace_id, integration_type, event_type, payload, status, error_message)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [workspaceId, integrationType, eventType, JSON.stringify(payload), status, error]
  ).catch(() => {});
}

async function getIntegration(workspaceId, type) {
  const row = await pool.query(
    "SELECT * FROM workspace_integrations WHERE workspace_id=$1 AND type=$2",
    [workspaceId, type]
  );
  return row.rows[0] || null;
}

async function verifyWorkspaceAccess(workspaceId, userId) {
  const row = await pool.query(
    "SELECT id FROM workspaces WHERE id=$1 AND user_id=$2",
    [workspaceId, userId]
  );
  return row.rows.length > 0;
}

// ── Slack helpers ─────────────────────────────────────────────────────────────

async function sendSlackMessage(webhookUrl, blocks, text = "") {
  const res = await axios.post(webhookUrl, { text, blocks }, {
    headers: { "Content-Type": "application/json" },
    timeout: 5000,
  });
  return res.data;
}

function buildSlackAlertBlocks(alerts, workspaceName) {
  if (!alerts || alerts.length === 0) return null;

  const EMOJI = { critical: ":rotating_light:", high: ":warning:", medium: ":zap:", low: ":bulb:" };

  const alertBlocks = alerts.slice(0, 5).map(a => ({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `${EMOJI[a.severity] || ":info:"} *${a.severity.toUpperCase()}*: ${a.message}\n_→ ${a.action}_`,
    },
  }));

  return [
    {
      type: "header",
      text: { type: "plain_text", text: `🧠 AI Alerts — ${workspaceName}`, emoji: true },
    },
    { type: "divider" },
    ...alertBlocks,
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: `Sent by *Taskora* · ${new Date().toLocaleString()}` }],
    },
  ];
}

// ── GET /api/integrations/:workspaceId ────────────────────────────────────────
router.get("/:workspaceId", auth, async (req, res) => {
  try {
    const access = await verifyWorkspaceAccess(req.params.workspaceId, req.user.id);
    if (!access) return res.status(403).json({ message: "Access denied" });

    const rows = await pool.query(
      "SELECT type, enabled, config, updated_at FROM workspace_integrations WHERE workspace_id=$1",
      [req.params.workspaceId]
    );

    // Mask secrets in config before sending to client
    const safe = rows.rows.map(r => {
      const cfg = { ...r.config };
      if (cfg.webhook_url) cfg.webhook_url_set = true, delete cfg.webhook_url;
      if (cfg.token)       cfg.token_set = true,       delete cfg.token;
      if (cfg.secret)      cfg.secret_set = true,      delete cfg.secret;
      return { type: r.type, enabled: r.enabled, config: cfg, updated_at: r.updated_at };
    });

    res.json(safe);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to load integrations" });
  }
});

// ── PUT /api/integrations/:workspaceId/:type ──────────────────────────────────
router.put("/:workspaceId/:type", auth, async (req, res) => {
  const { workspaceId, type } = req.params;
  const ALLOWED_TYPES = ["slack", "github", "email", "jira"];
  if (!ALLOWED_TYPES.includes(type)) return res.status(400).json({ message: "Unknown integration type" });

  try {
    const access = await verifyWorkspaceAccess(workspaceId, req.user.id);
    if (!access) return res.status(403).json({ message: "Access denied" });

    const { enabled = false, config = {} } = req.body;

    // Fetch existing config to merge (preserve secrets not being updated)
    const existing = await getIntegration(workspaceId, type);
    const mergedConfig = { ...(existing?.config || {}), ...config };

    const row = await pool.query(
      `INSERT INTO workspace_integrations (workspace_id, type, enabled, config, updated_at)
       VALUES ($1,$2,$3,$4,NOW())
       ON CONFLICT (workspace_id, type)
       DO UPDATE SET enabled=$3, config=$4, updated_at=NOW()
       RETURNING type, enabled, updated_at`,
      [workspaceId, type, enabled, JSON.stringify(mergedConfig)]
    );

    res.json(row.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to save integration" });
  }
});

// ── DELETE /api/integrations/:workspaceId/:type ───────────────────────────────
router.delete("/:workspaceId/:type", auth, async (req, res) => {
  try {
    const access = await verifyWorkspaceAccess(req.params.workspaceId, req.user.id);
    if (!access) return res.status(403).json({ message: "Access denied" });

    await pool.query(
      "DELETE FROM workspace_integrations WHERE workspace_id=$1 AND type=$2",
      [req.params.workspaceId, req.params.type]
    );
    res.json({ message: "Integration removed" });
  } catch (err) {
    res.status(500).json({ message: "Failed to remove integration" });
  }
});

// ── POST /api/integrations/:workspaceId/slack/test ────────────────────────────
router.post("/:workspaceId/slack/test", auth, async (req, res) => {
  try {
    const access = await verifyWorkspaceAccess(req.params.workspaceId, req.user.id);
    if (!access) return res.status(403).json({ message: "Access denied" });

    const integration = await getIntegration(req.params.workspaceId, "slack");
    if (!integration?.config?.webhook_url) {
      return res.status(400).json({ message: "Slack webhook URL not configured" });
    }

    const wsRow = await pool.query("SELECT name FROM workspaces WHERE id=$1", [req.params.workspaceId]);
    const wsName = wsRow.rows[0]?.name || "Your workspace";

    await sendSlackMessage(integration.config.webhook_url, null,
      `✅ Taskora Slack integration is working for workspace *${wsName}*!`
    );

    await logEvent(req.params.workspaceId, "slack", "test_message_sent", { workspace: wsName });
    res.json({ message: "Test message sent successfully" });
  } catch (err) {
    await logEvent(req.params.workspaceId, "slack", "test_message_failed", {}, "error", err.message);
    res.status(500).json({ message: "Failed to send test message: " + err.message });
  }
});

// ── POST /api/integrations/:workspaceId/notify/slack ─────────────────────────
// Triggered by AI engine when critical alerts fire
router.post("/:workspaceId/notify/slack", auth, async (req, res) => {
  try {
    const access = await verifyWorkspaceAccess(req.params.workspaceId, req.user.id);
    if (!access) return res.status(403).json({ message: "Access denied" });

    const integration = await getIntegration(req.params.workspaceId, "slack");
    if (!integration?.enabled || !integration?.config?.webhook_url) {
      return res.json({ skipped: true, reason: "Slack not enabled" });
    }

    const wsRow = await pool.query("SELECT name FROM workspaces WHERE id=$1", [req.params.workspaceId]);
    const wsName = wsRow.rows[0]?.name || "Workspace";

    const { alerts = [] } = req.body;
    if (alerts.length === 0) return res.json({ skipped: true, reason: "No alerts" });

    const blocks = buildSlackAlertBlocks(alerts, wsName);
    await sendSlackMessage(integration.config.webhook_url, blocks, `${alerts.length} AI alert(s) from Taskora`);

    await logEvent(req.params.workspaceId, "slack", "alerts_sent", { count: alerts.length });
    res.json({ sent: true, count: alerts.length });
  } catch (err) {
    await logEvent(req.params.workspaceId, "slack", "alerts_failed", {}, "error", err.message);
    res.status(500).json({ message: "Slack notification failed: " + err.message });
  }
});

// ── POST /api/integrations/github/webhook ─────────────────────────────────────
// Public endpoint — receives GitHub webhooks
// Parses commit messages for task IDs: "fixes #123", "closes #456", "refs #789"
router.post("/github/webhook", async (req, res) => {
  try {
    const event = req.headers["x-github-event"];
    if (event !== "push") return res.json({ skipped: true });

    const { repository, commits = [] } = req.body;
    if (!commits.length) return res.json({ processed: 0 });

    // Find workspace with this repo configured
    const repoName = repository?.full_name || repository?.name;
    if (!repoName) return res.json({ skipped: true, reason: "No repo name" });

    const intRow = await pool.query(
      `SELECT wi.workspace_id, wi.config FROM workspace_integrations wi
       WHERE wi.type='github' AND wi.enabled=true
         AND wi.config->>'repo' = $1`,
      [repoName]
    );
    if (!intRow.rows.length) return res.json({ skipped: true, reason: "No matching workspace" });

    const workspaceId = intRow.rows[0].workspace_id;

    // Parse commit messages for task references
    const TASK_REF_RE = /(?:fixes?|closes?|refs?)\s+#(\d+)/gi;
    let linked = 0;

    for (const commit of commits) {
      const message = commit.message || "";
      let match;
      while ((match = TASK_REF_RE.exec(message)) !== null) {
        const taskId = parseInt(match[1]);

        // Validate task belongs to this workspace
        const taskRow = await pool.query(
          "SELECT id, title FROM tasks WHERE id=$1 AND workspace_id=$2",
          [taskId, workspaceId]
        );
        if (!taskRow.rows.length) continue;

        // Add comment linking the commit
        await pool.query(
          `INSERT INTO task_comments (task_id, user_id, content)
           SELECT $1, w.user_id, $2 FROM workspaces w WHERE w.id=$3`,
          [
            taskId,
            `🔗 GitHub commit linked: [${commit.id?.slice(0, 7)}] ${commit.message?.split('\n')[0]} — by ${commit.author?.name}`,
            workspaceId,
          ]
        ).catch(() => {});

        linked++;
      }
    }

    await logEvent(workspaceId, "github", "push_received", { repo: repoName, commits: commits.length, linked });
    res.json({ processed: commits.length, linked });
  } catch (err) {
    console.error("GitHub webhook error:", err);
    res.status(500).json({ message: "Webhook processing failed" });
  }
});

// ── POST /api/integrations/:workspaceId/jira/import ───────────────────────────
// Accepts Jira CSV export (standard format)
router.post("/:workspaceId/jira/import", auth, upload.single("file"), async (req, res) => {
  try {
    const access = await verifyWorkspaceAccess(req.params.workspaceId, req.user.id);
    if (!access) return res.status(403).json({ message: "Access denied" });

    if (!req.file) return res.status(400).json({ message: "CSV file required" });

    const csv = req.file.buffer.toString("utf8");
    const lines = csv.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return res.status(400).json({ message: "CSV appears empty" });

    // Parse CSV headers (first line)
    const headers = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase());
    const tasks = [];
    const errors = [];

    for (let i = 1; i < lines.length; i++) {
      try {
        const values = parseCSVLine(lines[i]);
        if (values.length < 2) continue;

        const row = {};
        headers.forEach((h, idx) => { row[h] = values[idx]?.trim() || ""; });

        // Map Jira fields → Taskora fields
        const title = row["summary"] || row["title"] || row["issue key"] || `Imported task ${i}`;
        const description = row["description"] || "";
        const priority = mapJiraPriority(row["priority"] || row["p"]);
        const status = mapJiraStatus(row["status"] || row["resolution"]);
        const dueDate = parseDate(row["due date"] || row["due"] || row["target end"]);
        const estimatedHours = parseFloat(row["original estimate"] || row["estimated hours"] || "0") || null;
        const type = mapJiraType(row["issue type"] || row["type"]);

        if (!title) continue;
        tasks.push({ title, description, priority, status, due_date: dueDate, estimated_hours: estimatedHours, type });
      } catch (e) {
        errors.push({ line: i + 1, error: e.message });
      }
    }

    if (tasks.length === 0) {
      return res.status(400).json({ message: "No valid tasks found in CSV", errors });
    }

    // Bulk insert tasks
    let imported = 0;
    const workspaceId = req.params.workspaceId;

    for (const t of tasks) {
      try {
        await pool.query(
          `INSERT INTO tasks (workspace_id, title, description, priority, status, due_date, estimated_hours, type)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [workspaceId, t.title, t.description, t.priority, t.status, t.due_date, t.estimated_hours, t.type]
        );
        imported++;
      } catch (e) {
        errors.push({ task: t.title, error: e.message });
      }
    }

    await logEvent(workspaceId, "jira", "csv_import", { total: tasks.length, imported, errors: errors.length });
    res.json({ imported, total: tasks.length, skipped: tasks.length - imported, errors: errors.slice(0, 10) });
  } catch (err) {
    console.error("Jira import error:", err);
    res.status(500).json({ message: "Import failed: " + err.message });
  }
});

// ── GET /api/integrations/:workspaceId/events ─────────────────────────────────
router.get("/:workspaceId/events", auth, async (req, res) => {
  try {
    const access = await verifyWorkspaceAccess(req.params.workspaceId, req.user.id);
    if (!access) return res.status(403).json({ message: "Access denied" });

    const rows = await pool.query(
      `SELECT id, integration_type, event_type, status, error_message, created_at
       FROM integration_events
       WHERE workspace_id=$1
       ORDER BY created_at DESC
       LIMIT 50`,
      [req.params.workspaceId]
    );
    res.json(rows.rows);
  } catch (err) {
    res.status(500).json({ message: "Failed to load events" });
  }
});

// ── CSV parsing helpers ───────────────────────────────────────────────────────

function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function mapJiraPriority(p) {
  const map = { highest: "critical", high: "high", medium: "medium", low: "low", lowest: "low" };
  return map[(p || "").toLowerCase()] || "medium";
}

function mapJiraStatus(s) {
  const lc = (s || "").toLowerCase();
  if (["done", "closed", "resolved", "fixed"].some(x => lc.includes(x))) return "done";
  if (["in progress", "in_progress", "inprogress", "in review", "in development"].some(x => lc.includes(x))) return "inprogress";
  return "todo";
}

function mapJiraType(t) {
  const lc = (t || "").toLowerCase();
  if (lc.includes("bug")) return "bug";
  if (lc.includes("story") || lc.includes("feature")) return "feature";
  if (lc.includes("epic")) return "epic";
  if (lc.includes("sub-task") || lc.includes("subtask")) return "task";
  return "task";
}

function parseDate(s) {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

module.exports = router;
