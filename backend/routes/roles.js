/**
 * Enterprise Role Management API
 *
 * GET    /api/roles                    — list all roles (system + custom)
 * GET    /api/roles/:id                — get role with its permissions
 * POST   /api/roles                    — create custom role
 * PUT    /api/roles/:id                — update role name/description
 * DELETE /api/roles/:id                — delete custom role (not system roles)
 * GET    /api/roles/permissions/all    — list full permissions catalog
 * PUT    /api/roles/:id/permissions    — set permissions for a role (replaces all)
 * POST   /api/roles/:id/clone          — clone a role into a new custom role
 */

const express = require("express");
const router  = express.Router();
const pool    = require("../db");
const auth    = require("../middleware/auth");
const { requirePerm } = require("../middleware/permission");

const auditLog = async (pool, actorId, action, entityType, entityId, oldVal, newVal, workspaceId) => {
  try {
    await pool.query(
      `INSERT INTO permission_audit_log
         (actor_id, action, entity_type, entity_id, old_value, new_value, workspace_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [actorId, action, entityType, entityId,
       oldVal ? JSON.stringify(oldVal) : null,
       newVal ? JSON.stringify(newVal) : null,
       workspaceId || null]
    );
  } catch {}
};

// GET /api/roles — list all roles
router.get("/", auth, requirePerm("access_control:view"), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.*,
              COUNT(DISTINCT ur.user_id)::int AS assigned_users,
              COUNT(DISTINCT rpm.permission_key)::int AS permission_count
       FROM roles r
       LEFT JOIN user_roles ur ON ur.role_id = r.id
         AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
       LEFT JOIN role_permissions_map rpm ON rpm.role_id = r.id
       GROUP BY r.id
       ORDER BY r.is_system DESC, r.created_at`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/roles/permissions/all — full catalog
router.get("/permissions/all", auth, requirePerm("access_control:view"), async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM permissions_catalog ORDER BY module, action"
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/roles/:id — role with permissions
router.get("/:id", auth, requirePerm("access_control:view"), async (req, res) => {
  try {
    const roleRes = await pool.query("SELECT * FROM roles WHERE id=$1", [req.params.id]);
    if (!roleRes.rows[0]) return res.status(404).json({ message: "Role not found" });

    const permsRes = await pool.query(
      `SELECT rpm.permission_key, rpm.data_scope, pc.module, pc.action, pc.label
       FROM role_permissions_map rpm
       JOIN permissions_catalog pc ON pc.key = rpm.permission_key
       WHERE rpm.role_id = $1
       ORDER BY pc.module, pc.action`,
      [req.params.id]
    );

    res.json({ ...roleRes.rows[0], permissions: permsRes.rows });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/roles — create custom role
router.post("/", auth, requirePerm("access_control:configure"), async (req, res) => {
  const { name, display_name, description, color, parent_role_id } = req.body;
  if (!name || !display_name)
    return res.status(400).json({ message: "name and display_name are required" });

  const slug = name.toLowerCase().replace(/[^a-z0-9_]/g, "_");

  try {
    const { rows } = await pool.query(
      `INSERT INTO roles (name, display_name, description, color, parent_role_id, created_by, is_system)
       VALUES ($1,$2,$3,$4,$5,$6,FALSE) RETURNING *`,
      [slug, display_name, description || null, color || "#6366f1",
       parent_role_id || null, req.user.id]
    );
    const role = rows[0];

    // If parent_role_id given, copy its permissions
    if (parent_role_id) {
      await pool.query(
        `INSERT INTO role_permissions_map (role_id, permission_key, data_scope)
         SELECT $1, permission_key, data_scope FROM role_permissions_map WHERE role_id=$2
         ON CONFLICT DO NOTHING`,
        [role.id, parent_role_id]
      );
    }

    await auditLog(pool, req.user.id, "role_created", "role", role.id, null, { name: slug }, null);
    res.status(201).json(role);
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ message: "Role name already exists" });
    res.status(500).json({ message: "Server error" });
  }
});

// PUT /api/roles/:id — update role metadata
router.put("/:id", auth, requirePerm("access_control:configure"), async (req, res) => {
  const { display_name, description, color } = req.body;
  try {
    const existing = await pool.query("SELECT * FROM roles WHERE id=$1", [req.params.id]);
    if (!existing.rows[0]) return res.status(404).json({ message: "Role not found" });
    if (existing.rows[0].is_system)
      return res.status(403).json({ message: "System roles cannot be renamed" });

    const { rows } = await pool.query(
      `UPDATE roles SET display_name=COALESCE($1,display_name),
              description=COALESCE($2,description),
              color=COALESCE($3,color), updated_at=NOW()
       WHERE id=$4 RETURNING *`,
      [display_name, description, color, req.params.id]
    );
    await auditLog(pool, req.user.id, "role_updated", "role", rows[0].id,
      existing.rows[0], rows[0], null);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// DELETE /api/roles/:id
router.delete("/:id", auth, requirePerm("access_control:configure"), async (req, res) => {
  try {
    const existing = await pool.query("SELECT * FROM roles WHERE id=$1", [req.params.id]);
    if (!existing.rows[0]) return res.status(404).json({ message: "Role not found" });
    if (existing.rows[0].is_system)
      return res.status(403).json({ message: "System roles cannot be deleted" });

    await pool.query("DELETE FROM roles WHERE id=$1", [req.params.id]);
    await auditLog(pool, req.user.id, "role_deleted", "role", req.params.id,
      existing.rows[0], null, null);
    res.json({ message: "Role deleted" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// PUT /api/roles/:id/permissions — replace all permissions for a role
router.put("/:id/permissions", auth, requirePerm("access_control:configure"), async (req, res) => {
  const { permissions } = req.body; // [{ key, data_scope }]
  if (!Array.isArray(permissions))
    return res.status(400).json({ message: "permissions must be an array" });

  try {
    const existing = await pool.query("SELECT * FROM roles WHERE id=$1", [req.params.id]);
    if (!existing.rows[0]) return res.status(404).json({ message: "Role not found" });

    const oldPerms = await pool.query(
      "SELECT permission_key, data_scope FROM role_permissions_map WHERE role_id=$1",
      [req.params.id]
    );

    // Replace all
    await pool.query("DELETE FROM role_permissions_map WHERE role_id=$1", [req.params.id]);

    if (permissions.length > 0) {
      const values = permissions.map((p, i) =>
        `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`
      ).join(",");
      const params = permissions.flatMap(p => [
        req.params.id, p.key, p.data_scope || "self"
      ]);
      await pool.query(
        `INSERT INTO role_permissions_map (role_id, permission_key, data_scope)
         VALUES ${values} ON CONFLICT DO NOTHING`,
        params
      );
    }

    await auditLog(pool, req.user.id, "role_permissions_updated", "role", req.params.id,
      { permissions: oldPerms.rows }, { permissions }, null);
    res.json({ ok: true, count: permissions.length });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/roles/:id/clone
router.post("/:id/clone", auth, requirePerm("access_control:configure"), async (req, res) => {
  const { display_name } = req.body;
  if (!display_name) return res.status(400).json({ message: "display_name required" });
  try {
    const source = await pool.query("SELECT * FROM roles WHERE id=$1", [req.params.id]);
    if (!source.rows[0]) return res.status(404).json({ message: "Role not found" });

    const slug = display_name.toLowerCase().replace(/[^a-z0-9_]/g, "_") + "_" + Date.now();
    const newRole = await pool.query(
      `INSERT INTO roles (name, display_name, description, color, parent_role_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [slug, display_name, `Cloned from ${source.rows[0].display_name}`,
       source.rows[0].color, source.rows[0].id, req.user.id]
    );

    await pool.query(
      `INSERT INTO role_permissions_map (role_id, permission_key, data_scope)
       SELECT $1, permission_key, data_scope FROM role_permissions_map WHERE role_id=$2
       ON CONFLICT DO NOTHING`,
      [newRole.rows[0].id, req.params.id]
    );

    await auditLog(pool, req.user.id, "role_cloned", "role", newRole.rows[0].id,
      { cloned_from: req.params.id }, { name: slug }, null);
    res.status(201).json(newRole.rows[0]);
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ message: "Role name conflict, try different name" });
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
