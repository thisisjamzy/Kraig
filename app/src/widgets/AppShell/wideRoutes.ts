// Routes with their own medium-and-up layout (they use the whole content
// width). Every other page renders its phone layout in a centred reading
// column until it gets one — never stretched edge to edge.

const WIDE_ROUTES = [
  '/projects',
  '/projects/calendar',
  '/projects/calendar/links',
  '/projects/focus',
  '/projects/all',
  '/projects/insights',
  '/projects/analytics',
  '/projects/plan',
  '/home',
  '/statistics',
  '/statistics/breakdown',
  '/baskets',
  '/baskets/items',
  '/budget',
  '/budget/ready',
  '/budget/review',
  '/budget/migration',
  '/budget/item-kinds',
  '/transactions',
  '/payments',
  '/wallets',
  '/debts',
  '/areas',
  '/sections',
  '/tasks',
  '/settings/planning',
  '/projects/calendar/links/new',
  '/work',
  '/people',
  '/library',
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
  // Time: a folder's page and a person's page.
  /^\/sections\/(?!new$)[^/]+$/,
  /^\/people\/(?!new$)[^/]+$/,
  /^\/tasks\/[^/]+\/edit$/,
  /^\/budget\/basket\/[^/]+$/,
  /^\/baskets\/(?!new$|items$|forecast$|analytics$)[^/]+$/,
  // A wallet's page (its edit form stays narrow, or opens as a side peek).
  /^\/wallets\/[^/]+$/,
  /^\/budget\/item\/[^/]+\/[^/]+$/,
  /^\/transactions\/[^/]+$/,
  // A debt's page (its forms stay narrow, or open as a side peek).
  /^\/debts\/(?!new$)[^/]+$/,
];

// Time v1.0 pages are drawn full width (Dreda v1.0 Time page): they ignore
// a saved "standard width" choice. Their forms stay narrow.
const TIME_FULL = /^\/(projects|tasks|areas|sections|people)(\/(?!new$)[^/]+)*$|^\/settings\/planning$/;

export function isAlwaysFullRoute(pathname: string | null): boolean {
  return Boolean(pathname) && isWideLayoutRoute(pathname) && TIME_FULL.test(pathname!) && !/\/(new|edit)$/.test(pathname!);
}

export function isWideLayoutRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return WIDE_ROUTES.includes(pathname) || WIDE_PATTERNS.some((p) => p.test(pathname));
}
