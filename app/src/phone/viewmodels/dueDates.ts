// Due-date wording for upcoming payments ("Due in 3d", "12 Sep") — shared
// by Home's payment list and anywhere else a "YYYY-MM-DD" due date shows.

function dayDiff(iso: string) {
  const due = new Date(`${iso}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}

export function dueLabel(iso: string) {
  const diff = dayDiff(iso);
  if (diff < 0) return `Overdue by ${Math.abs(diff)}d`;
  if (diff === 0) return 'Due today';
  if (diff === 1) return 'Due tomorrow';
  return `Due in ${diff}d`;
}

export function formatDueDate(iso: string) {
  const parsed = new Date(`${iso}T00:00:00`);
  const day = String(parsed.getDate()).padStart(2, '0');
  const month = parsed.toLocaleString('en-US', { month: 'short' });
  return `${day} ${month}`;
}
