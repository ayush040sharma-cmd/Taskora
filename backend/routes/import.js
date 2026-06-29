/**
 * Task Import / Export API — Taskora v1.1
 *
 * GET  /api/import/template             — download Excel template
 * POST /api/import/tasks/:workspaceId   — upload + parse + preview
 * POST /api/import/tasks/:workspaceId/confirm — UPSERT confirmed rows
 * GET  /api/import/tasks/:workspaceId/export  — download tasks as Excel
 * POST /api/import/status/:workspaceId        — daily status import
 * GET  /api/import/logs/:workspaceId          — import history
 */

const express = require("express");
const router  = express.Router();
const multer  = require("multer");
const XLSX    = require("xlsx");
const pool    = require("../db");
const auth    = require("../middleware/auth");

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "text/csv",
      "application/csv",
    ];
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(xlsx|xls|csv)$/i)) {
      cb(null, true);
    } else {
      cb(new Error("Only Excel (.xlsx, .xls) or CSV files are allowed"));
    }
  },
});

const VALID_STATUSES  = ["todo", "in_progress", "inprogress", "review", "done", "blocked"];
const VALID_PRIORITIES = ["low", "medium", "high", "critical"];
const VALID_TYPES     = ["task", "bug", "story", "rfp", "proposal", "presentation", "upgrade", "poc", "feature", "normal"];

// ── Helper: workspace access check ───────────────────────────────────────────
async function canAccess(userId, workspaceId) {
  const [o, m] = await Promise.all([
    pool.query("SELECT id FROM workspaces WHERE id=$1 AND user_id=$2", [workspaceId, userId]),
    pool.query("SELECT user_id FROM workspace_members WHERE workspace_id=$1 AND user_id=$2", [workspaceId, userId]),
  ]);
  return o.rows.length > 0 || m.rows.length > 0;
}

// ── GET /api/import/template ──────────────────────────────────────────────────
// Returns a downloadable Excel template file
router.get("/template", auth, (req, res) => {
  const type = req.query.type || "tasks";

  if (type === "status") {
    const wb = XLSX.utils.book_new();
    const data = [
      ["task_id", "status", "progress_percent", "comment"],
      [101, "in_progress", 50, "Updated by daily standup"],
      [102, "done", 100, "Completed"],
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws["!cols"] = [{ wch: 12 }, { wch: 15 }, { wch: 20 }, { wch: 40 }];
    XLSX.utils.book_append_sheet(wb, ws, "Status Update");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=taskora-status-template.xlsx");
    return res.send(buf);
  }

  // Tasks template
  const wb = XLSX.utils.book_new();
  const data = [
    ["task_id", "title", "description", "status", "priority", "type", "due_date", "start_date", "assignee_email", "estimated_hours", "team_name", "tags"],
    ["", "Design new landing page", "Redesign the homepage", "todo", "high", "task", "2025-07-31", "2025-07-01", "john@example.com", "16", "Engineering", ""],
    ["", "Fix checkout bug", "Payment flow broken on mobile", "in_progress", "high", "bug", "2025-07-15", "", "", "8", "QA", ""],
    ["101", "Update API docs", "Document all REST endpoints", "todo", "medium", "task", "", "", "", "4", "", ""],
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = [
    { wch: 12 }, { wch: 35 }, { wch: 40 }, { wch: 15 }, { wch: 12 },
    { wch: 15 }, { wch: 14 }, { wch: 14 }, { wch: 28 }, { wch: 18 }, { wch: 20 }, { wch: 20 },
  ];

  // Add a "README" sheet
  const readme = XLSX.utils.aoa_to_sheet([
    ["Column", "Required", "Values", "Notes"],
    ["task_id", "No", "Number", "Leave blank to CREATE. Fill to UPDATE existing task."],
    ["title", "Yes", "Text", "Task title (required for new tasks)"],
    ["description", "No", "Text", "Detailed description"],
    ["status", "No", `${VALID_STATUSES.join(" | ")}`, "Default: todo"],
    ["priority", "No", `${VALID_PRIORITIES.join(" | ")}`, "Default: medium"],
    ["type", "No", `${VALID_TYPES.join(" | ")}`, "Default: task"],
    ["due_date", "No", "YYYY-MM-DD", "Task due date"],
    ["start_date", "No", "YYYY-MM-DD", "Task start date"],
    ["assignee_email", "No", "Email", "Must match a workspace member email"],
    ["estimated_hours", "No", "Number", "e.g. 8"],
    ["team_name", "No", "Text", "Must match an existing team name"],
    ["tags", "No", "Text", "Comma-separated tags (informational)"],
  ]);
  readme["!cols"] = [{ wch: 20 }, { wch: 12 }, { wch: 45 }, { wch: 50 }];

  XLSX.utils.book_append_sheet(wb, ws, "Tasks");
  XLSX.utils.book_append_sheet(wb, readme, "README");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", "attachment; filename=taskora-tasks-template.xlsx");
  res.send(buf);
});

// ── POST /api/import/tasks/:workspaceId — parse + preview ────────────────────
router.post("/tasks/:workspaceId", auth, upload.single("file"), async (req, res) => {
  const { workspaceId } = req.params;

  if (!req.file) return res.status(400).json({ message: "No file uploaded" });
  if (!(await canAccess(req.user.id, workspaceId))) {
    return res.status(403).json({ message: "Access denied" });
  }

  try {
    // Parse file
    const wb   = XLSX.read(req.file.buffer, { type: "buffer", cellDates: true });
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

    if (!rows.length) return res.status(400).json({ message: "File is empty or has no data rows" });

    // Load workspace members for email lookup
    const memberRes = await pool.query(
      `SELECT u.id, u.email, u.name
       FROM users u
       WHERE u.id IN (
         SELECT user_id FROM workspaces WHERE id=$1
         UNION
         SELECT user_id FROM workspace_members WHERE workspace_id=$1
       )`,
      [workspaceId]
    );
    const membersByEmail = {};
    for (const m of memberRes.rows) {
      membersByEmail[m.email.toLowerCase()] = m;
    }

    // Load teams for name lookup
    const teamRes = await pool.query("SELECT id, name FROM teams WHERE workspace_id=$1", [workspaceId]);
    const teamsByName = {};
    for (const t of teamRes.rows) {
      teamsByName[t.name.toLowerCase()] = t;
    }

    // Load existing tasks for UPSERT matching
    const existingRes = await pool.query("SELECT id, title FROM tasks WHERE workspace_id=$1", [workspaceId]);
    const existingById = {};
    for (const t of existingRes.rows) existingById[t.id] = t;

    const created = [], updated = [], skipped = [], errors = [];
    const seenIds = new Set();

    for (let i = 0; i < rows.length; i++) {
      const row   = rows[i];
      const rowNum = i + 2; // Excel row number (1-indexed + header row)
      const rowErrors = [];

      const taskId     = row["task_id"]       ? parseInt(row["task_id"])     : null;
      const title      = String(row["title"] || "").trim();
      const description = String(row["description"] || "").trim();
      const status     = String(row["status"] || "todo").toLowerCase().trim();
      const priority   = String(row["priority"] || "medium").toLowerCase().trim();
      const type       = String(row["type"] || "task").toLowerCase().trim();
      const dueDate    = row["due_date"]    ? String(row["due_date"]).trim()    : null;
      const startDate  = row["start_date"]  ? String(row["start_date"]).trim()  : null;
      const assigneeEmail = String(row["assignee_email"] || "").toLowerCase().trim();
      const estimatedHours = row["estimated_hours"] ? parseFloat(row["estimated_hours"]) : null;
      const teamName   = String(row["team_name"] || "").trim();

      // Validation
      if (!title && !taskId) {
        errors.push({ row: rowNum, field: "title", message: "Title is required for new tasks" });
        continue;
      }
      if (taskId && seenIds.has(taskId)) {
        skipped.push({ row: rowNum, task_id: taskId, title, reason: "Duplicate task_id in upload" });
        continue;
      }
      if (taskId) seenIds.add(taskId);

      if (status && !VALID_STATUSES.includes(status)) {
        rowErrors.push(`Invalid status "${status}". Use: ${VALID_STATUSES.join(", ")}`);
      }
      if (priority && !VALID_PRIORITIES.includes(priority)) {
        rowErrors.push(`Invalid priority "${priority}". Use: ${VALID_PRIORITIES.join(", ")}`);
      }
      if (type && !VALID_TYPES.includes(type)) {
        rowErrors.push(`Invalid type "${type}". Use: ${VALID_TYPES.join(", ")}`);
      }

      let assigneeId = null;
      if (assigneeEmail) {
        const member = membersByEmail[assigneeEmail];
        if (!member) {
          rowErrors.push(`Assignee email "${assigneeEmail}" is not a workspace member`);
        } else {
          assigneeId = member.id;
        }
      }

      let teamId = null;
      if (teamName) {
        const team = teamsByName[teamName.toLowerCase()];
        if (!team) {
          rowErrors.push(`Team "${teamName}" not found in this workspace`);
        } else {
          teamId = team.id;
        }
      }

      const parsedDue   = dueDate   ? new Date(dueDate)   : null;
      const parsedStart = startDate ? new Date(startDate) : null;

      if (dueDate && parsedDue && isNaN(parsedDue.getTime())) {
        rowErrors.push(`Invalid due_date "${dueDate}". Use YYYY-MM-DD format`);
      }
      if (startDate && parsedStart && isNaN(parsedStart.getTime())) {
        rowErrors.push(`Invalid start_date "${startDate}". Use YYYY-MM-DD format`);
      }

      if (rowErrors.length) {
        errors.push({ row: rowNum, task_id: taskId || null, title, errors: rowErrors });
        continue;
      }

      const taskData = {
        title,
        description,
        status: status || "todo",
        priority: priority || "medium",
        type: type || "task",
        due_date: parsedDue && !isNaN(parsedDue.getTime()) ? parsedDue.toISOString().split("T")[0] : null,
        start_date: parsedStart && !isNaN(parsedStart.getTime()) ? parsedStart.toISOString().split("T")[0] : null,
        assignee_id: assigneeId,
        assignee_email: assigneeEmail || null,
        estimated_hours: isNaN(estimatedHours) ? null : estimatedHours,
        team_id: teamId,
        team_name: teamName || null,
        workspace_id: parseInt(workspaceId),
      };

      if (taskId && existingById[taskId]) {
        updated.push({ row: rowNum, task_id: taskId, ...taskData, action: "update" });
      } else if (taskId && !existingById[taskId]) {
        skipped.push({ row: rowNum, task_id: taskId, title, reason: `Task ID ${taskId} not found in this workspace` });
      } else {
        created.push({ row: rowNum, ...taskData, action: "create" });
      }
    }

    res.json({
      summary: {
        total: rows.length,
        to_create: created.length,
        to_update: updated.length,
        to_skip: skipped.length,
        errors: errors.length,
      },
      created,
      updated,
      skipped,
      errors,
      filename: req.file.originalname,
    });
  } catch (err) {
    console.error("Import parse error:", err);
    res.status(500).json({ message: `Failed to parse file: ${err.message}` });
  }
});

// ── POST /api/import/tasks/:workspaceId/confirm — UPSERT confirmed rows ───────
router.post("/tasks/:workspaceId/confirm", auth, async (req, res) => {
  const { workspaceId } = req.params;
  const { created = [], updated = [], filename = "import" } = req.body;

  if (!(await canAccess(req.user.id, workspaceId))) {
    return res.status(403).json({ message: "Access denied" });
  }

  let createdCount = 0, updatedCount = 0, errorCount = 0;
  const errors = [];

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // INSERT new tasks
    for (const task of created) {
      try {
        const maxPos = await client.query(
          "SELECT COALESCE(MAX(position),0) AS p FROM tasks WHERE workspace_id=$1 AND status=$2",
          [workspaceId, task.status || "todo"]
        );
        await client.query(
          `INSERT INTO tasks
             (title, description, status, priority, type, due_date, start_date,
              workspace_id, assigned_user_id, estimated_hours, team_id, position)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            task.title, task.description || null,
            task.status || "todo", task.priority || "medium",
            task.type || "task",
            task.due_date || null, task.start_date || null,
            workspaceId, task.assignee_id || null,
            task.estimated_hours || null, task.team_id || null,
            parseInt(maxPos.rows[0].p) + 1,
          ]
        );
        createdCount++;
      } catch (e) {
        errors.push({ title: task.title, error: e.message });
        errorCount++;
      }
    }

    // UPDATE existing tasks
    for (const task of updated) {
      try {
        await client.query(
          `UPDATE tasks SET
             title=$1, description=COALESCE($2,description),
             status=$3, priority=$4, type=$5,
             due_date=$6, start_date=$7,
             assigned_user_id=COALESCE($8,assigned_user_id),
             estimated_hours=COALESCE($9,estimated_hours),
             team_id=COALESCE($10,team_id)
           WHERE id=$11 AND workspace_id=$12`,
          [
            task.title, task.description || null,
            task.status || "todo", task.priority || "medium",
            task.type || "task",
            task.due_date || null, task.start_date || null,
            task.assignee_id || null, task.estimated_hours || null,
            task.team_id || null, task.task_id, workspaceId,
          ]
        );
        updatedCount++;
      } catch (e) {
        errors.push({ task_id: task.task_id, error: e.message });
        errorCount++;
      }
    }

    await client.query("COMMIT");

    // Log the import
    await pool.query(
      `INSERT INTO import_logs
         (workspace_id, user_id, import_type, filename,
          total_rows, created_count, updated_count, error_count, errors, status)
       VALUES ($1,$2,'tasks',$3,$4,$5,$6,$7,$8,$9)`,
      [
        workspaceId, req.user.id, filename,
        created.length + updated.length,
        createdCount, updatedCount, errorCount,
        JSON.stringify(errors),
        errorCount > 0 ? "partial" : "completed",
      ]
    ).catch(() => {});

    res.json({
      message: "Import complete",
      created: createdCount,
      updated: updatedCount,
      errors:  errorCount,
      error_details: errors,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Import confirm error:", err);
    res.status(500).json({ message: "Import failed: " + err.message });
  } finally {
    client.release();
  }
});

// ── GET /api/import/tasks/:workspaceId/export — download tasks as Excel ───────
router.get("/tasks/:workspaceId/export", auth, async (req, res) => {
  const { workspaceId } = req.params;

  if (!(await canAccess(req.user.id, workspaceId))) {
    return res.status(403).json({ message: "Access denied" });
  }

  try {
    const { rows } = await pool.query(
      `SELECT t.id AS task_id, t.title, t.description, t.status, t.priority, t.type,
              t.due_date, t.start_date, u.email AS assignee_email,
              t.estimated_hours, t.actual_hours, t.progress,
              te.name AS team_name, t.created_at
       FROM tasks t
       LEFT JOIN users u  ON u.id = t.assigned_user_id
       LEFT JOIN teams te ON te.id = t.team_id
       WHERE t.workspace_id = $1
       ORDER BY t.created_at ASC`,
      [workspaceId]
    );

    const wsInfo = await pool.query("SELECT name FROM workspaces WHERE id=$1", [workspaceId]);
    const wsName = wsInfo.rows[0]?.name || "workspace";

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows.map(r => ({
      "Task ID":          r.task_id,
      "Title":            r.title,
      "Description":      r.description || "",
      "Status":           r.status,
      "Priority":         r.priority,
      "Type":             r.type,
      "Due Date":         r.due_date ? new Date(r.due_date).toISOString().split("T")[0] : "",
      "Start Date":       r.start_date ? new Date(r.start_date).toISOString().split("T")[0] : "",
      "Assignee Email":   r.assignee_email || "",
      "Estimated Hours":  r.estimated_hours || "",
      "Actual Hours":     r.actual_hours || "",
      "Progress %":       r.progress || 0,
      "Team":             r.team_name || "",
      "Created At":       r.created_at ? new Date(r.created_at).toISOString().split("T")[0] : "",
    })));
    ws["!cols"] = [
      { wch: 10 }, { wch: 35 }, { wch: 40 }, { wch: 15 }, { wch: 12 },
      { wch: 15 }, { wch: 14 }, { wch: 14 }, { wch: 30 }, { wch: 18 },
      { wch: 15 }, { wch: 12 }, { wch: 20 }, { wch: 14 },
    ];

    XLSX.utils.book_append_sheet(wb, ws, "Tasks");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    const filename = `${wsName.replace(/[^a-zA-Z0-9]/g, "-")}-tasks-${new Date().toISOString().split("T")[0]}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buf);
  } catch (err) {
    console.error("Export error:", err);
    res.status(500).json({ message: "Export failed" });
  }
});

// ── POST /api/import/status/:workspaceId — daily status import ────────────────
router.post("/status/:workspaceId", auth, upload.single("file"), async (req, res) => {
  const { workspaceId } = req.params;
  if (!req.file) return res.status(400).json({ message: "No file uploaded" });
  if (!(await canAccess(req.user.id, workspaceId))) {
    return res.status(403).json({ message: "Access denied" });
  }

  try {
    const wb   = XLSX.read(req.file.buffer, { type: "buffer" });
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

    if (!rows.length) return res.status(400).json({ message: "File is empty" });

    let updatedCount = 0, errorCount = 0;
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const taskId  = parseInt(row["task_id"]);
      const status  = String(row["status"] || "").toLowerCase().trim();
      const progress = row["progress_percent"] !== "" ? parseInt(row["progress_percent"]) : null;
      const comment  = String(row["comment"] || "").trim();

      if (!taskId || isNaN(taskId)) {
        errors.push({ row: i + 2, error: "Missing or invalid task_id" });
        errorCount++;
        continue;
      }
      if (status && !VALID_STATUSES.includes(status)) {
        errors.push({ row: i + 2, task_id: taskId, error: `Invalid status "${status}"` });
        errorCount++;
        continue;
      }

      try {
        const setClauses = [];
        const params = [];
        let p = 1;

        if (status) { setClauses.push(`status=$${p++}`); params.push(status); }
        if (progress !== null && !isNaN(progress)) {
          setClauses.push(`progress=$${p++}`);
          params.push(Math.min(100, Math.max(0, progress)));
        }
        if (status === "done") {
          setClauses.push(`completed_at=COALESCE(completed_at,NOW())`);
        }

        if (setClauses.length > 0) {
          params.push(taskId, workspaceId);
          const result = await pool.query(
            `UPDATE tasks SET ${setClauses.join(",")} WHERE id=$${p} AND workspace_id=$${p+1}`,
            params
          );
          if (result.rowCount > 0) {
            updatedCount++;
            // Add comment if provided
            if (comment) {
              await pool.query(
                `INSERT INTO task_comments (task_id, user_id, content) VALUES ($1,$2,$3)`,
                [taskId, req.user.id, `[Status Import] ${comment}`]
              ).catch(() => {});
            }
          } else {
            errors.push({ row: i + 2, task_id: taskId, error: "Task not found in this workspace" });
            errorCount++;
          }
        }
      } catch (e) {
        errors.push({ row: i + 2, task_id: taskId, error: e.message });
        errorCount++;
      }
    }

    // Log
    await pool.query(
      `INSERT INTO import_logs
         (workspace_id, user_id, import_type, filename,
          total_rows, updated_count, error_count, errors, status)
       VALUES ($1,$2,'status',$3,$4,$5,$6,$7,$8)`,
      [workspaceId, req.user.id, req.file.originalname, rows.length,
       updatedCount, errorCount, JSON.stringify(errors),
       errorCount > 0 ? "partial" : "completed"]
    ).catch(() => {});

    res.json({
      message: "Status import complete",
      total: rows.length,
      updated: updatedCount,
      errors:  errorCount,
      error_details: errors,
    });
  } catch (err) {
    console.error("Status import error:", err);
    res.status(500).json({ message: "Failed to process file: " + err.message });
  }
});

// ── GET /api/import/logs/:workspaceId — import history ───────────────────────
router.get("/logs/:workspaceId", auth, async (req, res) => {
  if (!(await canAccess(req.user.id, req.params.workspaceId))) {
    return res.status(403).json({ message: "Access denied" });
  }
  try {
    const { rows } = await pool.query(
      `SELECT il.*, u.name AS imported_by_name
       FROM import_logs il
       LEFT JOIN users u ON u.id = il.user_id
       WHERE il.workspace_id = $1
       ORDER BY il.created_at DESC
       LIMIT 50`,
      [req.params.workspaceId]
    );
    res.json(rows);
  } catch (err) {
    console.error("Import logs error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
