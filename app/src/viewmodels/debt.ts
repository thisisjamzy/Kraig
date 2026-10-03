// The Debt page's sentence. Pure, tested in test/homeDebt.test.ts.

const DAY = 86_400_000;

/**
 * "You owe 3,971,122. The next payment is 50,000 to Momokash on 28 Sep, now 5 days late."
 */
export function debtSentence(
  total: number,
  next: { name: string; amount: number | null; date: Date } | null,
  today: Date,
  format: (n: number) => string
): string {
  if (total <= 0) return 'You have no debt.';
  const first = `You owe ${format(total)}.`;
  if (!next) return `${first} No payment plan is set yet.`;
  const day = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const due = new Date(next.date.getFullYear(), next.date.getMonth(), next.date.getDate()).getTime();
  const days = Math.round((due - day) / DAY);
  const when = next.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const what = next.amount ? `${format(next.amount)} to ${next.name}` : `to ${next.name}`;
  const tail = days < 0 ? `, now ${-days} ${days === -1 ? 'day' : 'days'} late` : days === 0 ? ', today' : days === 1 ? ', tomorrow' : '';
  return `${first} The next payment is ${what} on ${when}${tail}.`;
}
