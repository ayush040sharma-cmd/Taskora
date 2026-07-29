/**
 * Enterprise User Management API
 *
 * GET    /api/user-mgmt/users                   — list all users (with roles, dept, team)
 * GET    /api/user-mgmt/users/:id               — user detail + roles + permission overrides
 * POST   /api/user-mgmt/users                   — create user (admin only)
 * PUT    /api/user-mgmt/users/:id               — update user profile / status
 * POST   /api/user-mgmt/users/:id/roles         — assign role to user
 * DELETE /api/user-mgmt/users/:id/roles/:roleId — remove role from user
 * PUT    /api/user-mgmt/users/:id/permissions   — set user permission overrides
 * GET    /api/user-mgmt/audit                   — permission audit log
 * GET    /api/user-mgmt/departments             — list departments
 * POST   /api/user-mgmt/departments             — create department
 * GET    /api/user-mgmt/teams                   — list teams
 * POST   /api/user-mgmt/teams                   — create team
 * PUT    /api/user-mgmt/teams/:id/members       — set team members
 */

const express = require("express");
const router  = express.Router();
const bcrypt  = require("bcryptjs");
const pool    = require("../db");
const auth    = require("../middleware/auth");
const { requirePerm } = require("../middleware/permission");

// requirePerm alone doesn't scope to a specific workspace, so an omitted
// workspace_id was returning every workspace's departments/teams, and even
// a supplied workspace_id was never checked against the caller's own
// membership -- either way, any user with the generic view permission could
// read another workspace's org data.
async function canAccessWorkspace(userId, workspaceId) {
  const { rows } = await pool.query(
    `SELECT 1 WHERE EXISTS (SELECT 1 FROM workspaces WHERE id=$1 AND user_id=$2)
        OR EXISTS (SELECT 1 FROM workspace_members WHERE workspace_id=$1 AND user_id=$2)`,
    [workspaceId, userId]
  );
  return rows.length > 0;
}

const auditLog = async (actorId, action, entityType, entityId, oldVal, newVal, targetUserId, workspaceId) => {
  try {
    await pool.query(
      `INSERT INTO permission_audit_log
         (actor_id, action, entity_type, entity_id, old_value, new_value, target_user_id, workspace_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [actorId, action, entityType, entityId,
       oldVal ? JSON.stringify(oldVal) : null,
       newVal ? JSON.stringify(newVal) : null,
       targetUserId || null, workspaceId || null]
    );
  } catch {}
};

// ── USERS ────────────────────────────────────────────────────────

// GET /api/user-mgmt/users
router.get("/users", auth, requirePerm("user_management:view"), async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        u.id, u.name, u.email, u.role, u.status, u.job_title, u.employee_id,
        u.is_admin, u.created_at, u.last_login_at, u.avatar_url,
        d.name AS department_name,
        ot.name AS team_name,
        mu.name AS manager_name,
        COALESCE(
          json_agg(DISTINCT jsonb_build_object('id', r.id, 'name', r.name,
            'display_name', r.display_name, 'color', r.color))
          FILTER (WHERE r.id IS NOT NULL), '[]'
        ) AS roles
      FROM users u
      LEFT JOIN departments d   ON d.id = u.department_id
      LEFT JOIN org_teams ot    ON ot.id = u.org_team_id
      LEFT JOIN users mu        ON mu.id = u.manager_id
      LEFT JOIN user_roles ur   ON ur.user_id = u.id
        AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
      LEFT JOIN roles r         ON r.id = ur.role_id
      GROUP BY u.id, d.name, ot.name, mu.name
      ORDER BY u.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/user-mgmt/users/:id
router.get("/users/:id", auth, requirePerm("user_management:view"), async (req, res) => {
  try {
    const userRes = await pool.query(`
      SELECT u.*, d.name AS department_name, ot.name AS team_name, mu.name AS manager_name
      FROM users u
      LEFT JOIN departments d ON d.id = u.department_id
      LEFT JOIN org_teams ot  ON ot.id = u.org_team_id
      LEFT JOIN users mu      ON mu.id = u.manager_id
      WHERE u.id = $1
    `, [req.params.id]);
    if (!userRes.rows[0]) return res.status(404).json({ message: "User not found" });

    const rolesRes = await pool.query(`
      SELECT r.id, r.name, r.display_name, r.color, ur.expires_at, ur.created_at,
             au.name AS assigned_by_name
      FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      LEFT JOIN users au ON au.id = ur.assigned_by
      WHERE ur.user_id = $1 AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
    `, [req.params.id]);

    const overridesRes = await pool.query(`
      SELECT upo.*, pc.label, pc.module, gu.name AS granted_by_name
      FROM user_permission_overrides upo
      JOIN permissions_catalog pc ON pc.key = upo.permission_key
      LEFT JOIN users gu ON gu.id = upo.granted_by
      WHERE upo.user_id = $1 AND (upo.expires_at IS NULL OR upo.expires_at > NOW())
      ORDER BY pc.module, pc.action
    `, [req.params.id]);

    const auditRes = await pool.query(`
      SELECT pal.*, au.name AS actor_name
      FROM permission_audit_log pal
      LEFT JOIN users au ON au.id = pal.actor_id
      WHERE pal.target_user_id = $1
      ORDER BY pal.created_at DESC LIMIT 50
    `, [req.params.id]);

    res.json({
      ...userRes.rows[0],
      password_hash: undefined,
      roles: rolesRes.rows,
      permission_overrides: overridesRes.rows,
      audit_log: auditRes.rows,
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/user-mgmt/users — create user
router.post("/users", auth, requirePerm("user_management:create"), async (req, res) => {
  const { name, email, password, role = "employee", job_title,
          employee_id, department_id, org_team_id, manager_id } = req.body;
  if (!name || !email) return res.status(400).json({ message: "name and email are required" });

  try {
    const existing = await pool.query("SELECT id FROM users WHERE email=$1", [email]);
    if (existing.rows.length > 0) return res.status(409).json({ message: "Email already registered" });

    const rawPassword = password || Math.random().toString(36).slice(-10) + "Aa1!";
    const hash = await bcrypt.hash(rawPassword, 10);

    const legacyRole = role === "admin" || role === "super_admin" ? "manager"
                     : role === "manager" || role === "team_lead"  ? "manager"
                     : "team_member";

    const userRes = await pool.query(`
      INSERT INTO users
        (name, email, password_hash, role, job_title, employee_id,
         department_id, org_team_id, manager_id, status, onboarding_complete)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'active',TRUE)
      RETURNING id, name, email, role, job_title, employee_id, status, created_at
    `, [name, email, hash, legacyRole, job_title || null, employee_id || null,
        department_id || null, org_team_id || null, manager_id || null]);

    const newUser = userRes.rows[0];

    // Assign enterprise role
    const roleRow = await pool.query("SELECT id FROM roles WHERE name=$1", [role]);
    if (roleRow.rows[0]) {
      await pool.query(
        "INSERT INTO user_roles (user_id, role_id, assigned_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
        [newUser.id, roleRow.rows[0].id, req.user.id]
      );
    }

    await auditLog(req.user.id, "user_created", "user", newUser.id,
      null, { name, email, role }, newUser.id, null);

    res.status(201).json({ ...newUser, temp_password: !password ? rawPassword : undefined });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// PUT /api/user-mgmt/users/:id — update profile / status
router.put("/users/:id", auth, requirePerm("user_management:edit"), async (req, res) => {
  const { name, job_title, employee_id, department_id, org_team_id,
          manager_id, status, avatar_url } = req.body;
  try {
    const existing = await pool.query("SELECT * FROM users WHERE id=$1", [req.params.id]);
    if (!existing.rows[0]) return res.status(404).json({ message: "User not found" });

    const { rows } = await pool.query(`
      UPDATE users SET
        name          = COALESCE($1, name),
        job_title     = COALESCE($2, job_title),
        employee_id   = COALESCE($3, employee_id),
        department_id = COALESCE($4, department_id),
        org_team_id   = COALESCE($5, org_team_id),
        manager_id    = COALESCE($6, manager_id),
        status        = COALESCE($7, status),
        avatar_url    = COALESCE($8, avatar_url)
      WHERE id = $9
      RETURNING id, name, email, role, job_title, employee_id, status, department_id, org_team_id, manager_id
    `, [name, job_title, employee_id, department_id, org_team_id,
        manager_id, status, avatar_url, req.params.id]);

    await auditLog(req.user.id, "user_updated", "user", req.params.id,
      existing.rows[0], rows[0], req.params.id, null);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/user-mgmt/users/:id/roles — assign role
router.post("/users/:id/roles", auth, requirePerm("user_management:assign_roles"), async (req, res) => {
  const { role_id, workspace_id, expires_at } = req.body;
  if (!role_id) return res.status(400).json({ message: "role_id required" });
  try {
    const roleRow = await pool.query("SELECT * FROM roles WHERE id=$1", [role_id]);
    if (!roleRow.rows[0]) return res.status(404).json({ message: "Role not found" });

    await pool.query(
      `INSERT INTO user_roles (user_id, role_id, workspace_id, assigned_by, expires_at)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (user_id, role_id, workspace_id) DO UPDATE
         SET expires_at=$5, assigned_by=$4`,
      [req.params.id, role_id, workspace_id || null, req.user.id, expires_at || null]
    );

    await auditLog(req.user.id, "role_assigned", "role", role_id,
      null, { role: roleRow.rows[0].name, expires_at }, req.params.id, workspace_id || null);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// DELETE /api/user-mgmt/users/:id/roles/:roleId
router.delete("/users/:id/roles/:roleId", auth, requirePerm("user_management:assign_roles"), async (req, res) => {
  try {
    const roleRow = await pool.query("SELECT name FROM roles WHERE id=$1", [req.params.roleId]);
    await pool.query(
      "DELETE FROM user_roles WHERE user_id=$1 AND role_id=$2",
      [req.params.id, req.params.roleId]
    );
    await auditLog(req.user.id, "role_removed", "role", req.params.roleId,
      { role: roleRow.rows[0]?.name }, null, req.params.id, null);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// PUT /api/user-mgmt/users/:id/permissions — set overrides
router.put("/users/:id/permissions", auth, requirePerm("access_control:configure"), async (req, res) => {
  const { overrides, workspace_id } = req.body;
  // overrides: [{ permission_key, granted, data_scope, reason, expires_at }]
  if (!Array.isArray(overrides)) return res.status(400).json({ message: "overrides must be array" });
  try {
    // Remove existing overrides for this workspace
    await pool.query(
      "DELETE FROM user_permission_overrides WHERE user_id=$1 AND (workspace_id=$2 OR workspace_id IS NULL)",
      [req.params.id, workspace_id || null]
    );

    for (const o of overrides) {
      await pool.query(
        `INSERT INTO user_permission_overrides
           (user_id, permission_key, granted, data_scope, workspace_id, granted_by, reason, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (user_id, permission_key, workspace_id) DO UPDATE
           SET granted=$3, data_scope=$4, granted_by=$6, reason=$7, expires_at=$8`,
        [req.params.id, o.permission_key, o.granted, o.data_scope || "self",
         workspace_id || null, req.user.id, o.reason || null, o.expires_at || null]
      );
    }

    await auditLog(req.user.id, "permissions_overridden", "user", req.params.id,
      null, { overrides }, req.params.id, workspace_id || null);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ── AUDIT LOG ──────────────────────────────────────────────────

router.get("/audit", auth, requirePerm("audit_logs:view"), async (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = parseInt(req.query.offset) || 0;
  const userId = req.query.user_id;
  try {
    const conditions = userId ? "WHERE pal.target_user_id=$3" : "";
    const params = userId ? [limit, offset, userId] : [limit, offset];
    const { rows } = await pool.query(`
      SELECT pal.*, au.name AS actor_name, au.email AS actor_email,
             tu.name AS target_name, tu.email AS target_email
      FROM permission_audit_log pal
      LEFT JOIN users au ON au.id = pal.actor_id
      LEFT JOIN users tu ON tu.id = pal.target_user_id
      ${conditions}
      ORDER BY pal.created_at DESC LIMIT $1 OFFSET $2
    `, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ── DEPARTMENTS ──────────────────────────────────────────────────

router.get("/departments", auth, requirePerm("user_management:view"), async (req, res) => {
  const wsId = req.query.workspace_id;
  if (!wsId) return res.status(400).json({ message: "workspace_id required" });
  try {
    if (!(await canAccessWorkspace(req.user.id, wsId))) {
      return res.status(403).json({ message: "Access denied" });
    }
    const { rows } = await pool.query(
      `SELECT d.*, u.name AS head_name,
              COUNT(DISTINCT us.id)::int AS member_count
       FROM departments d
       LEFT JOIN users u  ON u.id = d.head_user_id
       LEFT JOIN users us ON us.department_id = d.id
       WHERE d.workspace_id=$1
       GROUP BY d.id, u.name
       ORDER BY d.name`,
      [wsId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/departments", auth, requirePerm("user_management:create"), async (req, res) => {
  const { workspace_id, name, head_user_id } = req.body;
  if (!workspace_id || !name) return res.status(400).json({ message: "workspace_id and name required" });
  try {
    if (!(await canAccessWorkspace(req.user.id, workspace_id))) {
      return res.status(403).json({ message: "Access denied" });
    }
    const { rows } = await pool.query(
      "INSERT INTO departments (workspace_id, name, head_user_id) VALUES ($1,$2,$3) RETURNING *",
      [workspace_id, name, head_user_id || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ── TEAMS ────────────────────────────────────────────────────────

router.get("/teams", auth, requirePerm("user_management:view"), async (req, res) => {
  const wsId = req.query.workspace_id;
  if (!wsId) return res.status(400).json({ message: "workspace_id required" });
  try {
    if (!(await canAccessWorkspace(req.user.id, wsId))) {
      return res.status(403).json({ message: "Access denied" });
    }
    const { rows } = await pool.query(
      `SELECT ot.*, d.name AS department_name, mu.name AS manager_name,
              COUNT(DISTINCT otm.user_id)::int AS member_count
       FROM org_teams ot
       LEFT JOIN departments d ON d.id = ot.department_id
       LEFT JOIN users mu      ON mu.id = ot.manager_id
       LEFT JOIN org_team_members otm ON otm.team_id = ot.id
       WHERE ot.workspace_id=$1
       GROUP BY ot.id, d.name, mu.name
       ORDER BY ot.name`,
      [wsId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/teams", auth, requirePerm("user_management:create"), async (req, res) => {
  const { workspace_id, department_id, name, manager_id } = req.body;
  if (!workspace_id || !name) return res.status(400).json({ message: "workspace_id and name required" });
  try {
    if (!(await canAccessWorkspace(req.user.id, workspace_id))) {
      return res.status(403).json({ message: "Access denied" });
    }
    const { rows } = await pool.query(
      "INSERT INTO org_teams (workspace_id, department_id, name, manager_id) VALUES ($1,$2,$3,$4) RETURNING *",
      [workspace_id, department_id || null, name, manager_id || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.put("/teams/:id/members", auth, requirePerm("team_management:assign"), async (req, res) => {
  const { user_ids } = req.body; // [{ user_id, role }]
  if (!Array.isArray(user_ids)) return res.status(400).json({ message: "user_ids array required" });
  try {
    await pool.query("DELETE FROM org_team_members WHERE team_id=$1", [req.params.id]);
    for (const m of user_ids) {
      await pool.query(
        "INSERT INTO org_team_members (team_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
        [req.params.id, m.user_id, m.role || "member"]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
