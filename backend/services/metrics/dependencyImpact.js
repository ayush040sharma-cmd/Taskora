/**
 * Dependency Impact — count of transitive downstream tasks currently
 * blocked-on this task, via task_dependencies.
 *
 * Note: task_dependencies has a write API (POST /api/tasks/:id/dependencies,
 * see backend/routes/tasks.js) but no frontend UI to create a dependency
 * (docs/TASKORA_FULL_AUDIT.md). This will legitimately return 0 for nearly
 * every task in nearly every workspace today — that's expected, not a bug
 * in this function. It becomes meaningful once dependency-creation UI ships.
 */
async function computeDependencyImpact(pool, taskId) {
  const r = await pool.query(
    `WITH RECURSIVE downstream AS (
       SELECT task_id FROM task_dependencies WHERE depends_on_task_id = $1
       UNION
       SELECT td.task_id FROM task_dependencies td
       JOIN downstream d ON td.depends_on_task_id = d.task_id
     )
     SELECT COUNT(DISTINCT task_id)::int AS n FROM downstream`,
    [taskId]
  );
  return r.rows[0]?.n || 0;
}

module.exports = { computeDependencyImpact };
