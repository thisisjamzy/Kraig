// Routes with their own medium-and-up layout (they use the whole content
// width). Every other page renders its phone layout in a centred reading
// column until it gets one — never stretched edge to edge.

const WIDE_ROUTES = ['/projects', '/projects/calendar', '/projects/focus', '/projects/all', '/projects/insights', '/home', '/statistics', '/buckets', '/buckets/items', '/buckets/forecast', '/budget', '/transactions'];
// Drill-downs with a wide layout: a project's page (not its edit form).
const WIDE_PATTERNS = [/^\/projects\/(?!new$|all$|calendar|focus|insights|analytics|control-panel)[^/]+$/];

export function isWideLayoutRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return WIDE_ROUTES.includes(pathname) || WIDE_PATTERNS.some((p) => p.test(pathname));
}
