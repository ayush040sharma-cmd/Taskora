const { round2 } = require("./_util");

const ADMIN_OVERHEAD_HOURS = 1;

/**
 * Focus Time — minutes available for deep work, per user per day.
 *
 *   contracted_hours − meeting_hours − admin_overhead(1h default)
 *
 * meeting_hours is a proxy: sum of calendar_events on localDate for this
 * user/workspace where type = 'meeting'. All-day meeting events count as
 * consuming the full contracted day (conservative — better to undercount
 * focus time than promise a heads-down day that doesn't exist).
 */
async function computeFocusTime(pool, { userId, workspaceId, localDate }) {
  const capR = await pool.query(
    `SELECT daily_hours FROM user_capacity WHERE user_id = $1`,
    [userId]
  );
  const contractedHours = parseFloat(capR.rows[0]?.daily_hours) || 8;

  const evR = await pool.query(
    `SELECT start_time, end_time, all_day FROM calendar_events
     WHERE workspace_id = $1 AND user_id = $2 AND type = 'meeting'
       AND start_date::date <= $3::date AND end_date::date >= $3::date`,
    [workspaceId, userId, localDate]
  );

  let meetingHours = 0;
  for (const ev of evR.rows) {
    if (ev.all_day || !ev.start_time || !ev.end_time) {
      meetingHours += ev.all_day ? contractedHours : 1; // unknown duration: 1h default
      continue;
    }
    meetingHours += timeDiffHours(ev.start_time, ev.end_time);
  }

  const focusHours = Math.max(0, contractedHours - meetingHours - ADMIN_OVERHEAD_HOURS);

  return {
    value: Math.round(focusHours * 60),
    inputs: {
      contracted_hours: contractedHours,
      meeting_hours: round2(meetingHours),
      admin_overhead_hours: ADMIN_OVERHEAD_HOURS,
      meeting_count: evR.rows.length,
    },
  };
}

// pg returns TIME columns as "HH:MM:SS" strings.
function timeDiffHours(startStr, endStr) {
  const toMinutes = s => {
    const [h, m] = s.split(":").map(Number);
    return h * 60 + m;
  };
  const diff = toMinutes(endStr) - toMinutes(startStr);
  return diff > 0 ? diff / 60 : 0;
}

module.exports = { computeFocusTime };
