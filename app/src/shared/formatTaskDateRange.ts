// Shared by every place a task's schedule is displayed (TaskCard,
// ProjectDetail's task rows, the Calendar agenda) — a task now always has
// both a start and an end time going forward (see taskWrites.ts), but older
// docs may still carry only one or the other, so every shape is handled.

function formatDate(date: Date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
}
function formatTime(date: Date) {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
function sameDay(a: Date, b: Date) {
  return a.toDateString() === b.toDateString();
}

/** "Sep 03, 9:00 AM – 5:00 PM" for a same-day range, "Sep 03, 9:00 AM – Sep
 * 04, 5:00 PM" spanning two days, or a single timestamp's own format when
 * there's only a start or only a due date on hand. */
export function formatTaskDateRange(startTime: Date | null, dueDate: Date | null): string | null {
  if (startTime && dueDate) {
    return sameDay(startTime, dueDate)
      ? `${formatDate(startTime)}, ${formatTime(startTime)} – ${formatTime(dueDate)}`
      : `${formatDate(startTime)}, ${formatTime(startTime)} – ${formatDate(dueDate)}, ${formatTime(dueDate)}`;
  }
  if (startTime) return `${formatDate(startTime)}, ${formatTime(startTime)}`;
  if (dueDate) return `${formatDate(dueDate)} · ${formatTime(dueDate)}`;
  return null;
}
