// Default month/year the Budget screen opens on — just which plan you're
// viewing, independent of the app's real current date.
export function currentMonthIndex() {
  return new Date().getMonth();
}
export function currentYear() {
  return new Date().getFullYear();
}
