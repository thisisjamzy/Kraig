// Plain thousands-separated amounts ("1,013,381"), shared by the bucket screens.
export function formatAmount(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}
