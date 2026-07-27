const express = require("express");
const router = express.Router();
const ExcelJS = require("exceljs");
const pool = require("../db");
const auth = require("../middleware/auth");
const { DEFAULT_DUE_DAYS } = require("../utils/resolveDueDate");

const STATUS_OPTIONS   = ["todo", "inprogress", "review", "done", "pending_approval"];
const PRIORITY_OPTIONS = ["low", "medium", "high"];
const TYPE_OPTIONS     = ["task", "bug", "story", "upgrade", "rfp", "proposal", "presentation", "poc"];

const COLUMNS = [
  { header: "Task ID",       key: "task_id",       width: 10 },
  { header: "Title",         key: "title",         width: 32 },
  { header: "Description",   key: "description",   width: 40 },
  { header: "Status",        key: "status",         width: 16 },
  { header: "Priority",      key: "priority",       width: 12 },
  { header: "Type",          key: "type",           width: 14 },
  { header: "Assignee Email",key: "assignee_email", width: 28 },
  { header: "Start Date",    key: "start_date",     width: 14 },
  { header: "Due Date",      key: "due_date",       width: 14 },
  { header: "Suggested Due Date", key: "suggested_due_date", width: 18 },
  { header: "Estimated Days",key: "estimated_days", width: 14 },
];

async function assertWorkspaceAccess(workspaceId, userId) {
  const owner = await pool.query(
    "SELECT id FROM workspaces WHERE id = $1 AND user_id = $2",
    [workspaceId, userId]
  );
  if (owner.rows.length) return true;
  const member = await pool.query(
    "SELECT user_id FROM workspace_members WHERE workspace_id = $1 AND user_id = $2",
    [workspaceId, userId]
  );
  return !!member.rows.length;
}

// GET /api/tasks/import/template?workspace_id=1&withData=true
router.get("/template", auth, async (req, res) => {
  const workspaceId = parseInt(req.query.workspace_id, 10);
  const withData = req.query.withData === "true";

  if (!workspaceId) {
    return res.status(400).json({ message: "workspace_id is required" });
  }

  try {
    const hasAccess = await assertWorkspaceAccess(workspaceId, req.user.id);
    if (!hasAccess) return res.status(403).json({ message: "Access denied" });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Taskora";
    workbook.created = new Date();

    const tasksSheet = workbook.addWorksheet("Tasks");
    tasksSheet.columns = COLUMNS;
    tasksSheet.getRow(1).font = { bold: true };

    if (withData) {
      const existing = await pool.query(
        `SELECT t.id AS task_id, t.title, t.description, t.status, t.priority, t.type,
                u.email AS assignee_email, t.start_date, t.due_date, t.estimated_days
         FROM tasks t
         LEFT JOIN users u ON t.assigned_user_id = u.id
         WHERE t.workspace_id = $1
         ORDER BY t.position ASC, t.created_at ASC`,
        [workspaceId]
      );
      for (const row of existing.rows) {
        tasksSheet.addRow({
          task_id: row.task_id,
          title: row.title,
          description: row.description || "",
          status: row.status,
          priority: row.priority,
          type: row.type,
          assignee_email: row.assignee_email || "",
          start_date: row.start_date ? row.start_date.toISOString().split("T")[0] : "",
          due_date: row.due_date ? row.due_date.toISOString().split("T")[0] : "",
          estimated_days: row.estimated_days || "",
        });
      }
    } else {
      // A couple of blank starter rows so the dropdowns/formula are visible.
      tasksSheet.addRow({});
      tasksSheet.addRow({});
    }

    // Dropdown validations + Suggested Due Date formula for every data row
    // (leave headroom for rows a user pastes in beyond what was pre-filled).
    const lastRow = Math.max(tasksSheet.rowCount, 1) + 200;
    for (let r = 2; r <= lastRow; r++) {
      tasksSheet.getCell(`D${r}`).dataValidation = {
        type: "list", allowBlank: true, formulae: [`"${STATUS_OPTIONS.join(",")}"`],
      };
      tasksSheet.getCell(`E${r}`).dataValidation = {
        type: "list", allowBlank: true, formulae: [`"${PRIORITY_OPTIONS.join(",")}"`],
      };
      tasksSheet.getCell(`F${r}`).dataValidation = {
        type: "list", allowBlank: true, formulae: [`"${TYPE_OPTIONS.join(",")}"`],
      };
      // Mirrors backend resolveDueDate(): due date if given, else start+7 (or today+7).
      tasksSheet.getCell(`J${r}`).value = {
        formula: `IF(I${r}<>"",I${r},IF(H${r}<>"",H${r}+${DEFAULT_DUE_DAYS},TODAY()+${DEFAULT_DUE_DAYS}))`,
      };
      tasksSheet.getCell(`J${r}`).numFmt = "yyyy-mm-dd";
    }

    const instructions = workbook.addWorksheet("Instructions");
    instructions.columns = [{ width: 100 }];
    instructions.addRows([
      ["Taskora Smart Import — Instructions"],
      [""],
      ["Task ID: leave blank to create a new task. Fill in an existing numeric Task ID to update that task."],
      ["Blank cells on an update row are left unchanged — they do NOT clear the existing value."],
      ["Assignee Email must match a member of this workspace, or the row will be flagged as an error."],
      ["Due Date: if left blank, it defaults to Start Date + " + DEFAULT_DUE_DAYS + " days (see Suggested Due Date column)."],
      ["Status must be one of: " + STATUS_OPTIONS.join(", ")],
      ["Priority must be one of: " + PRIORITY_OPTIONS.join(", ")],
      ["Type must be one of: " + TYPE_OPTIONS.join(", ")],
      [""],
      ["Upload this file back in the Smart Import wizard to preview changes before anything is saved."],
    ]);
    instructions.getRow(1).font = { bold: true, size: 14 };

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="taskora-import-template${withData ? "-with-data" : ""}.xlsx"`
    );
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("Import template error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
