/**
 * Jarvis Voice Command Engine
 * POST /api/jarvis/command  { message, workspace_id }
 *
 * Supports:
 *   create_task   — "Create a task called Fix login bug, high priority, due tomorrow"
 *   mark_done     — "Mark Fix login bug as done"
 *   set_status    — "Move Fix login bug to in progress"
 *   assign_task   — "Assign Fix login bug to Ayush"
 *   set_priority  — "Set Fix login bug to critical"
 *   set_due_date  — "Set due date of Fix login bug to Friday"
 *   delete_task   — "Delete task Fix login bug"
 *   list/query    — "Show my tasks", "What's overdue?", "Summarize workspace"
 */

const express = require("express");
const router  = express.Router();
const pool    = require("../db");
const auth    = require("../middleware/auth");
const { audit }                  = require("../services/auditService");
const { refreshUserWorkloadLog } = require("../services/workloadLogger");

// ── Intent detection ──────────────────────────────────────────────────────────
function detectIntent(msg) {
  // Must check mark_done / set_status before create so "make X done" doesn't become create
  if (/\b(mark|set|move|complete|finish|close)\b.{0,35}\b(done|complete|finished|closed|completed)\b/i.test(msg))
    return "mark_done";
  // "complete/finish the task" as a standalone imperative (no second keyword needed)
  if (/^(complete|finish|close)\b/i.test(msg.trim()))
    return "mark_done";
  if (/\b(mark|move|set|change)\b.{0,35}\b(todo|to-do|in.?progress|inprogress|doing|backlog|review)\b/i.test(msg))
    return "set_status";

  if (/\b(create|add|make|new)\b.{0,25}\b(task|bug|feature|ticket|story|item|issue)\b/i.test(msg))
    return "create_task";

  // "give [something] to [person]" = assign; "give me" = query — require "to" after give
  if (/\b(assign|reassign|delegate)\b/i.test(msg) || /\bgive\b.{1,30}\bto\b/i.test(msg))
    return "assign_task";

  // set_priority: explicit word "priority" + action word, OR "set/change X to <level>"
  if (/\b(set|change|make|update)\b.{0,10}\b(priority)\b/i.test(msg))
    return "set_priority";
  if (/\b(set|change|make)\b.{0,50}\bto\b\s*(critical|urgent|high|medium|low)\b/i.test(msg))
    return "set_priority";
  if (/\bmake it\b.{0,5}\b(critical|urgent|high|medium|low)\b/i.test(msg))
    return "set_priority";

  if (/\b(set|change|update|push)\b.{0,15}\b(due|deadline|date)\b/i.test(msg))
    return "set_due_date";
  if (/\b(delete|remove|cancel|drop|trash)\b/i.test(msg))
    return "delete_task";
  if (/\bmy (tasks?|work|tickets?)\b/i.test(msg) || /\bassigned to me\b/i.test(msg))
    return "my_tasks";
  if (/\boverdue\b/i.test(msg))
    return "overdue";

  // "summarize", "summary", "overview" — remove trailing \b so partial words match
  if (/\bsummar/i.test(msg) || /\b(overview|how many tasks|total tasks|workspace health)\b/i.test(msg))
    return "summary";

  // "high priority tasks", "high-priority", "critical tasks" — remove trailing \b
  if (/\bhigh.{0,5}priorit/i.test(msg) || /\bcritical tasks?\b/i.test(msg))
    return "high_priority";

  if (/\bdue today\b/i.test(msg))
    return "due_today";
  if (/\b(this week|due.?week)\b/i.test(msg))
    return "due_this_week";
  if (/\b(high.?risk|at.?risk|risky)\b/i.test(msg))
    return "high_risk";
  if (/\b(blocked|stuck|depend)\b/i.test(msg))
    return "blocked";
  if (/\bunassign(ed)?\b/i.test(msg))
    return "unassigned";

  return "search";
}

// ── Title extraction ──────────────────────────────────────────────────────────
function extractQuoted(text) {
  const m = /["'""]([^"'""]+)["'""]/.exec(text);
  return m ? m[1].trim() : null;
}

function extractCreateTitle(msg) {
  const quoted = extractQuoted(msg);
  if (quoted) return quoted;

  // "called/named/titled <title>"
  const named = /\b(?:called|named|titled)\s+(.+?)(?:\s+(?:with|due|by|for|assign|high|medium|low|critical|urgent|and|,)\b|$)/i.exec(msg);
  if (named) return named[1].trim();

  // Strip the create verb + object word, keep the rest as the title
  const stripped = msg
    .replace(/\b(?:create|add|make|new)\b\s*/gi, "")
    .replace(/\b(?:a|an|the)\s*/gi, "")
    .replace(/\b(?:task|bug|feature|ticket|story|item|issue)\b\s*/gi, "")
    .replace(/\b(?:with|due|by|for)\b.*/i, "")
    .replace(/\b(?:high|medium|low|critical|urgent)\b.*/i, "")
    .trim();
  return stripped || null;
}

function extractTargetTitle(msg) {
  const quoted = extractQuoted(msg);
  if (quoted) return quoted;

  // "called/named/titled X"
  const named = /\b(?:called|named|titled|task)\s+(.+?)(?:\s+(?:as|to|with|due|assign|high|medium|low|critical|done|,)\b|$)/i.exec(msg);
  if (named) return named[1].trim();

  return null;
}

// Strip common command verbs and filler words to get a search term
function extractSearchTerm(msg, dropWords) {
  let cleaned = msg;
  const allDrop = [
    ...dropWords,
    "a","an","the","it","this","that","my","please","and","or","as",
    "to","for","with","done","complete","finished","in","progress","priority",
    "due","date","deadline","task","tasks","by","on","at","from",
  ];
  for (const w of allDrop) {
    cleaned = cleaned.replace(new RegExp(`\\b${w}\\b`, "gi"), " ");
  }
  return cleaned.replace(/\s+/g, " ").trim() || null;
}

// ── Priority / status / date parsers ─────────────────────────────────────────
function extractPriority(msg) {
  if (/\bcritical\b/i.test(msg)) return "critical";
  if (/\bhigh\b/i.test(msg))     return "high";
  if (/\burgent\b/i.test(msg))   return "high";
  if (/\bmedium\b/i.test(msg))   return "medium";
  if (/\bnormal\b/i.test(msg))   return "medium";
  if (/\blow\b/i.test(msg))      return "low";
  return null;
}

function extractStatus(msg) {
  if (/\b(done|complete|finished|closed|completed)\b/i.test(msg))          return "done";
  if (/\b(in.?progress|inprogress|doing|started|start|wip)\b/i.test(msg))  return "inprogress";
  if (/\b(todo|to.?do|backlog|not started|reopen)\b/i.test(msg))           return "todo";
  return null;
}

const MONTH_NAMES = [
  "january","february","march","april","may","june",
  "july","august","september","october","november","december",
];
const DAY_NAMES = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];

function parseDueDate(msg) {
  const lower = msg.toLowerCase();
  const now = new Date();

  if (/\btoday\b/.test(lower)) {
    return now.toISOString().split("T")[0];
  }
  if (/\btomorrow\b/.test(lower)) {
    const d = new Date(now); d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
  }
  if (/\bnext week\b/.test(lower)) {
    const d = new Date(now); d.setDate(d.getDate() + 7);
    return d.toISOString().split("T")[0];
  }
  if (/\bnext month\b/.test(lower)) {
    const d = new Date(now); d.setMonth(d.getMonth() + 1);
    return d.toISOString().split("T")[0];
  }
  const inDays = /\bin (\d+) days?\b/.exec(lower);
  if (inDays) {
    const d = new Date(now); d.setDate(d.getDate() + parseInt(inDays[1]));
    return d.toISOString().split("T")[0];
  }
  // Weekday name
  for (let i = 0; i < DAY_NAMES.length; i++) {
    if (lower.includes(DAY_NAMES[i])) {
      const d = new Date(now);
      const diff = (i - d.getDay() + 7) % 7 || 7;
      d.setDate(d.getDate() + diff);
      return d.toISOString().split("T")[0];
    }
  }
  // "May 5", "April 30th"
  for (let i = 0; i < MONTH_NAMES.length; i++) {
    const re = new RegExp(`\\b${MONTH_NAMES[i]}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`);
    const m = re.exec(lower);
    if (m) {
      const year = now.getFullYear();
      const d = new Date(year, i, parseInt(m[1]));
      if (d < now) d.setFullYear(year + 1);
      return d.toISOString().split("T")[0];
    }
  }
  // ISO date: 2024-05-10
  const iso = /\b(\d{4}-\d{2}-\d{2})\b/.exec(lower);
  if (iso) return iso[1];

  return null;
}

// Friendly date label for TTS responses
function friendlyDate(iso) {
  if (!iso) return null;
  const d = new Date(iso + "T00:00:00");
  const today = new Date(); today.setHours(0,0,0,0);
  const diff  = Math.round((d - today) / 86400000);
  if (diff === 0)  return "today";
  if (diff === 1)  return "tomorrow";
  if (diff === 7)  return "next week";
  if (diff > 0 && diff < 7) return `this ${DAY_NAMES[d.getDay()]}`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Person name extraction ────────────────────────────────────────────────────
function extractPersonName(msg) {
  const m = /\bassign(?:ed)?\s+(?:it\s+)?to\s+([a-zA-Z][a-zA-Z ]{1,30})(?:\s+(?:and|with|due|for|,)|$)/i.exec(msg)
         || /\bto\s+([a-zA-Z][a-zA-Z ]{1,30})(?:\s+(?:and|with|due|for|,)|$)/i.exec(msg)
         || /\bfor\s+([a-zA-Z][a-zA-Z ]{1,30})(?:\s+(?:and|with|due|,)|$)/i.exec(msg);
  return m ? m[1].trim() : null;
}

// ── DB helpers ────────────────────────────────────────────────────────────────
async function checkAccess(workspaceId, userId) {
  const [owner, member] = await Promise.all([
    pool.query("SELECT id FROM workspaces WHERE id=$1 AND user_id=$2", [workspaceId, userId]),
    pool.query("SELECT user_id FROM workspace_members WHERE workspace_id=$1 AND user_id=$2", [workspaceId, userId]),
  ]);
  return owner.rows.length > 0 || member.rows.length > 0;
}

async function findTask(titleHint, workspaceId) {
  if (!titleHint) return null;
  const r = await pool.query(
    `SELECT t.*, u.name AS assignee_name
     FROM tasks t LEFT JOIN users u ON u.id = t.assigned_user_id
     WHERE t.workspace_id=$1 AND LOWER(t.title) LIKE $2
     ORDER BY
       CASE WHEN LOWER(t.title) = $3 THEN 0
            WHEN LOWER(t.title) LIKE $4 THEN 1
            ELSE 2 END,
       t.updated_at DESC
     LIMIT 1`,
    [workspaceId, `%${titleHint.toLowerCase()}%`,
     titleHint.toLowerCase(), `${titleHint.toLowerCase()}%`]
  );
  return r.rows[0] || null;
}

async function findMember(nameHint, workspaceId) {
  if (!nameHint) return null;
  const r = await pool.query(
    `SELECT u.id, u.name FROM workspace_members wm
     JOIN users u ON u.id = wm.user_id
     WHERE wm.workspace_id=$1 AND LOWER(u.name) LIKE $2
     UNION
     SELECT u.id, u.name FROM workspaces w
     JOIN users u ON u.id = w.user_id
     WHERE w.id=$1 AND LOWER(u.name) LIKE $2
     LIMIT 1`,
    [workspaceId, `%${nameHint.toLowerCase()}%`]
  );
  return r.rows[0] || null;
}

// ── POST /api/jarvis/command ──────────────────────────────────────────────────
router.post("/command", auth, async (req, res) => {
  const { message, workspace_id } = req.body;

  if (!message?.trim()) {
    return res.json({ reply: "I didn't catch that. Please try again." });
  }
  if (!workspace_id) {
    return res.json({ reply: "No workspace is open. Please select a workspace first." });
  }

  try {
    const hasAccess = await checkAccess(workspace_id, req.user.id);
    if (!hasAccess) {
      return res.status(403).json({ reply: "You don't have access to this workspace." });
    }

    const intent = detectIntent(message);
    const io     = req.app.get("io");

    // ── CREATE TASK ───────────────────────────────────────────────────────────
    if (intent === "create_task") {
      const title = extractCreateTitle(message);
      if (!title) {
        return res.json({
          reply: "What should I name the task? Try: \"Create a task called Fix login bug\"",
        });
      }

      const priority = extractPriority(message) || "medium";
      const due_date = parseDueDate(message);

      let assigned_user_id = null;
      let assigneeName = null;
      const personName = extractPersonName(message);
      if (personName) {
        const member = await findMember(personName, workspace_id);
        if (member) { assigned_user_id = member.id; assigneeName = member.name; }
      }

      const maxPos = await pool.query(
        "SELECT COALESCE(MAX(position),0) AS max_pos FROM tasks WHERE workspace_id=$1 AND status='todo'",
        [workspace_id]
      );
      const position = parseInt(maxPos.rows[0].max_pos) + 1;

      const r = await pool.query(
        `INSERT INTO tasks
           (title, status, priority, due_date, workspace_id, assigned_user_id, position,
            estimated_days, estimated_duration, final_duration)
         VALUES ($1,'todo',$2,$3,$4,$5,$6,1,8,8) RETURNING *`,
        [title, priority, due_date || null, workspace_id, assigned_user_id || null, position]
      );
      const task = r.rows[0];

      if (io) io.to(`workspace:${workspace_id}`).emit("task:created", task);
      if (assigned_user_id) refreshUserWorkloadLog(assigned_user_id, workspace_id).catch(() => {});
      audit({
        workspace_id, actor_id: req.user.id, action: "task_created",
        target_type: "task", target_id: task.id,
        meta: { task_title: task.title, source: "jarvis_voice" },
      }).catch(() => {});

      const parts = [`Created task "${title}"`];
      parts.push(`priority: ${priority}`);
      if (due_date) parts.push(`due ${friendlyDate(due_date)}`);
      if (assigneeName) parts.push(`assigned to ${assigneeName}`);
      else parts.push("unassigned");

      return res.json({ reply: `Done! ${parts.join(", ")}.`, action: "create_task", task });
    }

    // ── MARK DONE ─────────────────────────────────────────────────────────────
    if (intent === "mark_done") {
      const titleHint = extractTargetTitle(message)
        || extractSearchTerm(message, ["mark","set","move","complete","finish","close","as","done","task"]);
      const task = await findTask(titleHint, workspace_id);
      if (!task) {
        return res.json({ reply: `I couldn't find a task matching "${titleHint || message}". Try quoting the exact task name.` });
      }

      await pool.query(
        "UPDATE tasks SET status='done', completed_at=NOW() WHERE id=$1",
        [task.id]
      );
      if (io) io.to(`workspace:${workspace_id}`).emit("task:updated", { ...task, status: "done" });
      audit({
        workspace_id, actor_id: req.user.id, action: "task_completed",
        target_type: "task", target_id: task.id,
        meta: { task_title: task.title, source: "jarvis_voice" },
      }).catch(() => {});

      return res.json({ reply: `Marked "${task.title}" as done. ✅`, action: "mark_done", task });
    }

    // ── SET STATUS ────────────────────────────────────────────────────────────
    if (intent === "set_status") {
      const status    = extractStatus(message);
      const titleHint = extractTargetTitle(message)
        || extractSearchTerm(message, ["mark","move","set","change","status","as","to","task"]);
      const task = await findTask(titleHint, workspace_id);

      if (!task)   return res.json({ reply: `I couldn't find a task matching "${titleHint || message}".` });
      if (!status) return res.json({ reply: `What status should I use? Options: todo, in progress, done.` });

      const clearCompleted = status !== "done" ? ", completed_at=NULL" : ", completed_at=NOW()";
      await pool.query(
        `UPDATE tasks SET status=$1${clearCompleted} WHERE id=$2`,
        [status, task.id]
      );
      if (io) io.to(`workspace:${workspace_id}`).emit("task:updated", { ...task, status });
      audit({
        workspace_id, actor_id: req.user.id, action: "task_moved",
        target_type: "task", target_id: task.id,
        meta: { task_title: task.title, to: status, source: "jarvis_voice" },
      }).catch(() => {});

      const label = status === "inprogress" ? "in progress" : status;
      return res.json({ reply: `Moved "${task.title}" to ${label}.`, action: "set_status", task });
    }

    // ── ASSIGN TASK ───────────────────────────────────────────────────────────
    if (intent === "assign_task") {
      const personName = extractPersonName(message);
      const titleHint  = extractTargetTitle(message)
        || extractSearchTerm(message, ["assign","give","reassign","delegate","to","task"]);

      const [task, member] = await Promise.all([
        findTask(titleHint, workspace_id),
        findMember(personName, workspace_id),
      ]);

      if (!task)   return res.json({ reply: `I couldn't find a task matching "${titleHint || message}".` });
      if (!member) return res.json({ reply: `I couldn't find a workspace member matching "${personName || "that person"}".` });

      await pool.query("UPDATE tasks SET assigned_user_id=$1 WHERE id=$2", [member.id, task.id]);
      refreshUserWorkloadLog(member.id, workspace_id).catch(() => {});
      if (io) io.to(`workspace:${workspace_id}`).emit("task:updated", { ...task, assigned_user_id: member.id, assignee_name: member.name });
      audit({
        workspace_id, actor_id: req.user.id, action: "task_assigned",
        target_type: "task", target_id: task.id,
        meta: { task_title: task.title, assignee: member.name, source: "jarvis_voice" },
      }).catch(() => {});

      return res.json({ reply: `Assigned "${task.title}" to ${member.name}.`, action: "assign_task", task });
    }

    // ── SET PRIORITY ──────────────────────────────────────────────────────────
    if (intent === "set_priority") {
      const priority  = extractPriority(message);
      const titleHint = extractTargetTitle(message)
        || extractSearchTerm(message, ["set","change","make","update","priority","to","as","task"]);
      const task = await findTask(titleHint, workspace_id);

      if (!task)     return res.json({ reply: `I couldn't find a task matching "${titleHint || message}".` });
      if (!priority) return res.json({ reply: "What priority? Options: low, medium, high, critical." });

      await pool.query("UPDATE tasks SET priority=$1 WHERE id=$2", [priority, task.id]);
      if (io) io.to(`workspace:${workspace_id}`).emit("task:updated", { ...task, priority });

      return res.json({ reply: `Set "${task.title}" priority to ${priority}.`, action: "set_priority", task });
    }

    // ── SET DUE DATE ──────────────────────────────────────────────────────────
    if (intent === "set_due_date") {
      const dueDate   = parseDueDate(message);
      const titleHint = extractTargetTitle(message)
        || extractSearchTerm(message, ["set","change","update","push","due","deadline","date","to","task"]);
      const task = await findTask(titleHint, workspace_id);

      if (!task)    return res.json({ reply: `I couldn't find a task matching "${titleHint || message}".` });
      if (!dueDate) return res.json({ reply: `When is it due? Try: "today", "tomorrow", "next week", or a day like "Friday".` });

      await pool.query("UPDATE tasks SET due_date=$1 WHERE id=$2", [dueDate, task.id]);
      if (io) io.to(`workspace:${workspace_id}`).emit("task:updated", { ...task, due_date: dueDate });

      return res.json({ reply: `Set "${task.title}" due date to ${friendlyDate(dueDate)}.`, action: "set_due_date", task });
    }

    // ── DELETE TASK ───────────────────────────────────────────────────────────
    if (intent === "delete_task") {
      const titleHint = extractTargetTitle(message)
        || extractSearchTerm(message, ["delete","remove","cancel","drop","trash","task"]);
      const task = await findTask(titleHint, workspace_id);

      if (!task) return res.json({ reply: `I couldn't find a task matching "${titleHint || message}".` });

      await pool.query("DELETE FROM tasks WHERE id=$1", [task.id]);
      if (io) io.to(`workspace:${workspace_id}`).emit("task:deleted", { id: task.id, workspace_id });
      audit({
        workspace_id, actor_id: req.user.id, action: "task_deleted",
        target_type: "task", target_id: task.id,
        meta: { task_title: task.title, source: "jarvis_voice" },
      }).catch(() => {});

      return res.json({ reply: `Deleted task "${task.title}".`, action: "delete_task" });
    }

    // ── QUERY / LIST ──────────────────────────────────────────────────────────
    let tasks = [], answer = "";

    if (intent === "my_tasks") {
      const r = await pool.query(
        `SELECT t.*, u.name AS assignee_name FROM tasks t
         LEFT JOIN users u ON u.id=t.assigned_user_id
         WHERE t.workspace_id=$1 AND t.assigned_user_id=$2 AND t.status!='done'
         ORDER BY t.priority DESC, t.due_date ASC NULLS LAST LIMIT 10`,
        [workspace_id, req.user.id]
      );
      tasks  = r.rows;
      answer = tasks.length === 0
        ? "You have no open tasks — you're all caught up! 🎉"
        : `You have ${tasks.length} open task${tasks.length !== 1 ? "s" : ""}.`;
    }

    else if (intent === "overdue") {
      const r = await pool.query(
        `SELECT t.*, u.name AS assignee_name FROM tasks t
         LEFT JOIN users u ON u.id=t.assigned_user_id
         WHERE t.workspace_id=$1 AND t.due_date < NOW() AND t.status!='done'
         ORDER BY t.due_date ASC LIMIT 10`,
        [workspace_id]
      );
      tasks  = r.rows;
      answer = tasks.length === 0
        ? "No overdue tasks — great work! 🎉"
        : `${tasks.length} overdue task${tasks.length !== 1 ? "s" : ""}.`;
    }

    else if (intent === "summary") {
      const r = await pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE status!='done')                                   AS open,
           COUNT(*) FILTER (WHERE status='done')                                    AS done,
           COUNT(*) FILTER (WHERE due_date<NOW() AND status!='done')                AS overdue,
           COUNT(*) FILTER (WHERE priority IN ('critical','high') AND status!='done') AS high_pri,
           COUNT(*) FILTER (WHERE assigned_user_id IS NULL AND status!='done')      AS unassigned
         FROM tasks WHERE workspace_id=$1`,
        [workspace_id]
      );
      const s = r.rows[0];
      answer = `Workspace summary: ${s.open} open, ${s.done} done, `
             + `${s.overdue} overdue, ${s.high_pri} high priority, ${s.unassigned} unassigned.`;
    }

    else if (intent === "high_priority") {
      const r = await pool.query(
        `SELECT t.*, u.name AS assignee_name FROM tasks t
         LEFT JOIN users u ON u.id=t.assigned_user_id
         WHERE t.workspace_id=$1 AND t.priority IN ('critical','high') AND t.status!='done'
         ORDER BY CASE t.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 END, t.due_date ASC LIMIT 10`,
        [workspace_id]
      );
      tasks  = r.rows;
      answer = tasks.length === 0
        ? "No critical or high-priority open tasks right now."
        : `${tasks.length} high-priority task${tasks.length !== 1 ? "s" : ""}.`;
    }

    else if (intent === "due_today") {
      const r = await pool.query(
        `SELECT t.*, u.name AS assignee_name FROM tasks t
         LEFT JOIN users u ON u.id=t.assigned_user_id
         WHERE t.workspace_id=$1 AND DATE(t.due_date)=CURRENT_DATE AND t.status!='done'
         ORDER BY t.priority DESC LIMIT 10`,
        [workspace_id]
      );
      tasks  = r.rows;
      answer = tasks.length === 0
        ? "Nothing due today."
        : `${tasks.length} task${tasks.length !== 1 ? "s" : ""} due today.`;
    }

    else if (intent === "due_this_week") {
      const r = await pool.query(
        `SELECT t.*, u.name AS assignee_name FROM tasks t
         LEFT JOIN users u ON u.id=t.assigned_user_id
         WHERE t.workspace_id=$1
           AND t.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
           AND t.status!='done'
         ORDER BY t.due_date ASC LIMIT 10`,
        [workspace_id]
      );
      tasks  = r.rows;
      answer = tasks.length === 0
        ? "Nothing due this week."
        : `${tasks.length} task${tasks.length !== 1 ? "s" : ""} due this week.`;
    }

    else if (intent === "high_risk") {
      const ai = require("../services/aiEngine");
      const r  = await pool.query(
        `SELECT t.*,
                (SELECT COUNT(*) FROM task_dependencies td
                 JOIN tasks dep ON td.depends_on_task_id=dep.id
                 WHERE td.task_id=t.id AND dep.status!='done')::int AS blocking_dep_count
         FROM tasks t WHERE t.workspace_id=$1 AND t.status!='done'`,
        [workspace_id]
      );
      tasks  = r.rows.map(t => ({ ...t, _risk: ai.calculateRiskScore(t).risk_score }))
                     .filter(t => t._risk >= 50)
                     .sort((a, b) => b._risk - a._risk)
                     .slice(0, 10);
      answer = tasks.length === 0
        ? "No high-risk tasks detected — project looks healthy!"
        : `${tasks.length} high-risk task${tasks.length !== 1 ? "s" : ""}.`;
    }

    else if (intent === "blocked") {
      const r = await pool.query(
        `SELECT t.*, u.name AS assignee_name FROM tasks t
         LEFT JOIN users u ON u.id=t.assigned_user_id
         WHERE t.workspace_id=$1 AND t.status!='done'
           AND (SELECT COUNT(*) FROM task_dependencies td
                JOIN tasks dep ON td.depends_on_task_id=dep.id
                WHERE td.task_id=t.id AND dep.status!='done') > 0`,
        [workspace_id]
      );
      tasks  = r.rows;
      answer = tasks.length === 0
        ? "No blocked tasks right now."
        : `${tasks.length} blocked task${tasks.length !== 1 ? "s" : ""} with unresolved dependencies.`;
    }

    else if (intent === "unassigned") {
      const r = await pool.query(
        `SELECT t.* FROM tasks t
         WHERE t.workspace_id=$1 AND t.assigned_user_id IS NULL AND t.status!='done'
         ORDER BY t.priority DESC, t.created_at ASC LIMIT 10`,
        [workspace_id]
      );
      tasks  = r.rows;
      answer = tasks.length === 0
        ? "All active tasks are assigned. ✅"
        : `${tasks.length} unassigned task${tasks.length !== 1 ? "s" : ""}.`;
    }

    else { // search / fallback
      const term = message
        .replace(/\b(show|find|list|get|search|look for|tell me|what are|display|are there any)\b/gi, "")
        .replace(/\b(tasks?|please|the|a|an)\b/gi, "")
        .trim();
      const r = await pool.query(
        `SELECT t.*, u.name AS assignee_name FROM tasks t
         LEFT JOIN users u ON u.id=t.assigned_user_id
         WHERE t.workspace_id=$1
           AND (LOWER(t.title) LIKE $2 OR LOWER(COALESCE(t.description,'')) LIKE $2)
           AND t.status!='done'
         ORDER BY t.priority DESC LIMIT 10`,
        [workspace_id, `%${term.toLowerCase()}%`]
      );
      tasks  = r.rows;
      answer = tasks.length === 0
        ? `No open tasks found matching "${term}".`
        : `Found ${tasks.length} task${tasks.length !== 1 ? "s" : ""} matching "${term}".`;
    }

    // Build a spoken-friendly reply (include up to 4 task names)
    let reply = answer;
    if (tasks.length > 0) {
      const names = tasks.slice(0, 4).map(t =>
        t.title + (t.assignee_name ? ` (${t.assignee_name})` : "")
      ).join(", ");
      reply = `${answer} ${names}${tasks.length > 4 ? `, and ${tasks.length - 4} more` : ""}.`;
    }

    return res.json({ reply, action: intent, tasks });

  } catch (err) {
    console.error("Jarvis command error:", err);
    res.status(500).json({ reply: "Something went wrong. Please try again." });
  }
});

module.exports = router;
