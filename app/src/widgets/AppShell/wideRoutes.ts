// Routes with their own medium-and-up layout (they use the whole content
// width). Every other page renders its phone layout in a centred reading
// column until it gets one — never stretched edge to edge.

const WIDE_ROUTES = [
  '/projects',
  '/projects/calendar',
  '/projects/focus',
  '/projects/all',
  '/projects/insights',
  '/projects/analytics',
  '/home',
  '/statistics',
  '/baskets',
  '/baskets/items',
  '/baskets/forecast',
  '/budget',
  '/budget/ready',
  '/budget/review',
  '/budget/migration',
  '/transactions',
  '/debts',
  '/areas',
  '/resources',
  '/notifications',
  '/settings/notifications',
];
// Drill-downs with a wide layout: a project's page (not its edit form).
// Money: a bucket's page, a budget line's page and a transaction's page.
const WIDE_PATTERNS = [
  /^\/projects\/(?!new$|all$|calendar|focus|insights|analytics)[^/]+$/,
  // Time: an area's page and a task's page (its form stays narrow).
  /^\/areas\/(?!new$)[^/]+$/,
  /^\/tasks\/[^/]+\/edit$/,
  /^\/budget\/bucket\/[^/]+$/,
  /^\/budget\/item\/[^/]+\/[^/]+$/,
  /^\/transactions\/[^/]+$/,
  // A debt's page (its forms stay narrow, or open as a side peek).
  /^\/debts\/(?!new$)[^/]+$/,
];

export function isWideLayoutRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return WIDE_ROUTES.includes(pathname) || WIDE_PATTERNS.some((p) => p.test(pathname));
}
