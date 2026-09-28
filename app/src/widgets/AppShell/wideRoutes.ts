// Routes with their own medium-and-up layout (they use the whole content
// width). Every other page renders its phone layout in a centred reading
// column until it gets one — never stretched edge to edge.

const WIDE_ROUTES = ['/projects', '/projects/calendar', '/projects/focus', '/home'];

export function isWideLayoutRoute(pathname: string | null): boolean {
  return Boolean(pathname && WIDE_ROUTES.includes(pathname));
}
