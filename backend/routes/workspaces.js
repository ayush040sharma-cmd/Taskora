const express = require("express");
const router = express.Router();
const pool = require("../db");
const auth = require("../middleware/auth");

// GET /api/workspaces
router.get("/", auth, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM workspaces WHERE user_id = $1 ORDER BY created_at ASC",
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Get workspaces error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/workspaces
router.post("/", auth, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ message: "Workspace name is required" });

  try {
    const result = await pool.query(
      "INSERT INTO workspaces (name, user_id) VALUES ($1, $2) RETURNING *",
      [name, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Create workspace error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// DELETE /api/workspaces/:id
router.delete("/:id", auth, async (req, res) => {
  try {
    const check = await pool.query(
      "SELECT id FROM workspaces WHERE id = $1 AND user_id = $2",
      [req.params.id, req.user.id]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ message: "Workspace not found" });
    }

    await pool.query("DELETE FROM workspaces WHERE id = $1", [req.params.id]);
    res.json({ message: "Workspace deleted" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
