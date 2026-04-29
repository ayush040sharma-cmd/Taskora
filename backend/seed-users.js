/**
 * Seed script — creates 4 users and adds them to a shared workspace.
 * Run: node seed-users.js
 *
 * Users:
 *  1. Nishanth Shetty  (nishanth.shetty@subex.com)  — manager
 *  2. Ayush Sharma      (ayush.sharma@subex.com)      — analyst/member
 *  3. Rohith Kumar      (rohith.kumar@subex.com)      — analyst/member
 *  4. Harish GD         (harish.gd@subex.com)         — analyst/member
 *
 * All 3 analysts work under Nishanth (manager of the shared workspace).
 */

require("dotenv").config();
const bcrypt = require("bcryptjs");
const pool   = require("./db");

const USERS = [
  {
    name:     "Nishanth Shetty",
    email:    "nishanth.shetty@subex.com",
    password: "Subex@2024!",
    role:     "manager",
    wsRole:   "manager",
  },
  {
    name:     "Ayush Sharma",
    email:    "ayush.sharma@subex.com",
    password: "Subex@2024!",
    role:     "member",
    wsRole:   "member",
  },
  {
    name:     "Rohith Kumar",
    email:    "rohith.kumar@subex.com",
    password: "Subex@2024!",
    role:     "member",
    wsRole:   "member",
  },
  {
    name:     "Harish GD",
    email:    "harish.gd@subex.com",
    password: "Subex@2024!",
    role:     "member",
    wsRole:   "member",
  },
];

const WORKSPACE_NAME = "Subex Team Workspace";

async function seed() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const createdUsers = [];

    for (const u of USERS) {
      // Check if user already exists
      const existing = await client.query(
        "SELECT id, name, email, role FROM users WHERE email = $1",
        [u.email]
      );

      let userId;
      if (existing.rows.length > 0) {
        userId = existing.rows[0].id;
        console.log(`  ✓ User already exists: ${u.email} (id=${userId})`);
      } else {
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(u.password, salt);
        const r = await client.query(
          `INSERT INTO users (name, email, password_hash, role, onboarding_completed)
           VALUES ($1, $2, $3, $4, true)
           RETURNING id`,
          [u.name, u.email, hash, u.role]
        );
        userId = r.rows[0].id;
        console.log(`  ✓ Created user: ${u.email} (id=${userId})`);

        // Create user_capacity row
        await client.query(
          `INSERT INTO user_capacity (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
          [userId]
        ).catch(() => {/* ignore if table not ready */});
      }

      createdUsers.push({ ...u, id: userId });
    }

    // ── Create shared workspace owned by Nishanth ────────────────────────────
    const manager = createdUsers.find(u => u.role === "manager");

    let workspaceId;
    const existingWs = await client.query(
      "SELECT id FROM workspaces WHERE name = $1 AND user_id = $2",
      [WORKSPACE_NAME, manager.id]
    );

    if (existingWs.rows.length > 0) {
      workspaceId = existingWs.rows[0].id;
      console.log(`  ✓ Workspace already exists: "${WORKSPACE_NAME}" (id=${workspaceId})`);
    } else {
      const wsR = await client.query(
        "INSERT INTO workspaces (name, user_id) VALUES ($1, $2) RETURNING id",
        [WORKSPACE_NAME, manager.id]
      );
      workspaceId = wsR.rows[0].id;
      console.log(`  ✓ Created workspace: "${WORKSPACE_NAME}" (id=${workspaceId})`);
    }

    // ── Add all users as workspace members ───────────────────────────────────
    for (const u of createdUsers) {
      await client.query(
        `INSERT INTO workspace_members (workspace_id, user_id, role, invited_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
        [workspaceId, u.id, u.wsRole, manager.id]
      );
      console.log(`  ✓ Added ${u.email} to workspace as ${u.wsRole}`);
    }

    await client.query("COMMIT");

    console.log("\n✅ Seeding complete!\n");
    console.log("┌─────────────────────────────────────────────────────┐");
    console.log("│  User Credentials                                   │");
    console.log("├─────────────────────────────────────────────────────┤");
    for (const u of createdUsers) {
      const roleLabel = u.role === "manager" ? "Manager" : "Analyst";
      console.log(`│  ${roleLabel.padEnd(9)}  ${u.email.padEnd(32)} │`);
      console.log(`│            Password: ${u.password.padEnd(28)} │`);
      console.log("├─────────────────────────────────────────────────────┤");
    }
    console.log("│  Workspace: " + WORKSPACE_NAME.padEnd(39) + "│");
    console.log("└─────────────────────────────────────────────────────┘\n");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Seeding failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    pool.end();
  }
}

seed();
