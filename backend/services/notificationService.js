/**
 * Notification Service
 * Creates in-app notifications in the notifications table
 * and pushes real-time events to the recipient's personal socket room.
 */

const pool = require("../db");

let _io = null;
function setIO(io) { _io = io; }

async function notify(items) {
  if (!items || items.length === 0) return;
  const valid = items.filter(n => n && n.user_id);
  if (valid.length === 0) return;

  const values = valid.map((n, i) => {
    const base = i * 5;
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
  });
  const params = valid.flatMap(n => [
    n.user_id,
    n.type  || "info",
    n.title || "",
    n.body  || null,
    JSON.stringify(n.data || {}),
  ]);

  const result = await pool.query(
    `INSERT INTO notifications (user_id, type, title, body, data)
     VALUES ${values.join(", ")} RETURNING *`,
    params
  ).catch(err => {
    console.error("[notificationService] Insert failed:", err.message);
    return null;
  });

  // Real-time push to each recipient's personal socket room
  if (_io && result?.rows) {
    result.rows.forEach(row => {
      _io.to(`user:${row.user_id}`).emit("notification", row);
    });
  }
}

async function notifyOne(user_id, type, title, body = null, data = {}) {
  return notify([{ user_id, type, title, body, data }]);
}

module.exports = { notify, notifyOne, setIO };
