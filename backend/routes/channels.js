/**
 * Channel / Chat Routes
 * GET  /api/channels/:workspaceId/messages
 * POST /api/channels/:workspaceId/messages
 */

const express = require("express");
const router  = express.Router();
const pool    = require("../db");
const auth    = require("../middleware/auth");

// Ensure table exists on first load
pool.query(`
  CREATE TABLE IF NOT EXISTS channel_messages (
    id           SERIAL PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    sender_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content      TEXT NOT NULL,
    created_at   TIMESTAMPTZ DEFAULT NOW()
  )
`).catch(console.error);

// GET messages (oldest first, paginated)
router.get("/:workspaceId/messages", auth, async (req, res) => {
  const { workspaceId } = req.params;
  const limit  = Math.min(parseInt(req.query.limit)  || 50,  200);
  const offset = parseInt(req.query.offset) || 0;
  try {
    const r = await pool.query(
      `SELECT cm.id, cm.workspace_id, cm.sender_id, cm.content, cm.created_at,
              u.name AS sender_name
       FROM   channel_messages cm
       JOIN   users u ON u.id = cm.sender_id
       WHERE  cm.workspace_id = $1
       ORDER  BY cm.created_at ASC
       LIMIT  $2 OFFSET $3`,
      [workspaceId, limit, offset]
    );
    res.json(r.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// POST a new message
router.post("/:workspaceId/messages", auth, async (req, res) => {
  const { workspaceId } = req.params;
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ message: "content is required" });

  try {
    const r = await pool.query(
      `INSERT INTO channel_messages (workspace_id, sender_id, content)
       VALUES ($1, $2, $3)
       RETURNING id, workspace_id, sender_id, content, created_at`,
      [workspaceId, req.user.id, content.trim()]
    );
    const msg = { ...r.rows[0], sender_name: req.user.name };

    // Broadcast via Socket.io to all workspace members
    req.app.get("io")?.to(`workspace:${workspaceId}`).emit("channel:message", msg);

    res.status(201).json(msg);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
