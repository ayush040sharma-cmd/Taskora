/**
 * Notification Service
 * Creates in-app notifications in the notifications table.
 */

const pool = require("../db");

/**
 * Create one or more notifications.
 * @param {Array<{user_id, type, title, body, data}>} items
 */
async function notify(items) {
  if (!items || items.length === 0) return;
  const values = items.map((n, i) => {
    const base = i * 5;
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
  });
  const params = items.flatMap(n => [
    n.user_id,
    n.type  || "info",
    n.title || "",
    n.body  || null,
    JSON.stringify(n.data || {}),
  ]);

  await pool.query(
    `INSERT INTO notifications (user_id, type, title, body, data)
     VALUES ${values.join(", ")}`,
    params
  );
}

/** Single notification shorthand */
async function notifyOne(user_id, type, title, body = null, data = {}) {
  return notify([{ user_id, type, title, body, data }]);
}

module.exports = { notify, notifyOne };
