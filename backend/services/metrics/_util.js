/**
 * Shared helpers for services/metrics/*. Not part of the public metrics API.
 */

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function sameDay(dateVal, localDate) {
  if (!dateVal) return false;
  const d = new Date(dateVal).toISOString().slice(0, 10);
  const l = new Date(localDate).toISOString().slice(0, 10);
  return d === l;
}

function businessDaysBetween(from, to) {
  const start = new Date(from);
  const end   = new Date(to);
  if (isNaN(start) || isNaN(end) || end <= start) return 0;

  let count = 0;
  const cur = new Date(start);
  cur.setHours(0, 0, 0, 0);
  const endDay = new Date(end);
  endDay.setHours(0, 0, 0, 0);

  while (cur < endDay) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

module.exports = { round2, clamp, sameDay, businessDaysBetween, todayISODate };
