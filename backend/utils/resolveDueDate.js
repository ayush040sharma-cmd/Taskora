const DEFAULT_DUE_DAYS = 7;

// Shared by manual task creation and the Smart Import commit path so both
// apply the same default: no due_date given -> start_date (or today) + 7 days.
function resolveDueDate({ due_date, start_date } = {}, defaultDays = DEFAULT_DUE_DAYS) {
  if (due_date) return due_date;
  const base = start_date ? new Date(start_date) : new Date();
  base.setDate(base.getDate() + defaultDays);
  return base.toISOString().split("T")[0];
}

module.exports = { resolveDueDate, DEFAULT_DUE_DAYS };
