// In-app navigation history for back buttons — "go to the page before this
// one", skipping create/edit form pages (a form you already saved or left
// is never a sensible place to go "back" to). Kept per tab in
// sessionStorage so a reload doesn't forget where you came from.
//
// recordVisit() is fed by NavigationTracker (mounted once in the app
// shell) on every route change; useGoBack() reads it.

const KEY = 'dreda.navHistory';
const MAX = 50;

// Create/edit flows: /tasks/new, /projects/x/edit, /add-transaction,
// /edit-transaction/x, /create-category, /add-bucket-item/x, and the
// action forms /budget/cover, /budget/reallocate, /debts/x/plan,
// /debts/x/repay and /debts/x/wallet.
const FORM_PAGE = /(^|\/)(new|edit)(\/|$)|^\/(add|edit|create)-|^\/budget\/(cover|reallocate)(\/|$)|^\/debts\/[^/]+\/(plan|repay|wallet)(\/|$)/;

export function isFormPage(url: string): boolean {
  return FORM_PAGE.test(url.split('?')[0]);
}

function load(): string[] {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function save(stack: string[]) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(stack.slice(-MAX)));
  } catch {
    // Private mode / storage blocked — history just won't survive a reload.
  }
}

let stack: string[] | null = null;
function getStack(): string[] {
  if (stack === null) stack = typeof window === 'undefined' ? [] : load();
  return stack;
}

/**
 * `traversal` is true when the browser moved through its own history (its
 * back button, a back gesture, router.back()). Only then is arriving at the
 * entry below the top a "back" that pops. A push to that same page — saving
 * a form and going to the page it edits — is a new visit: the form is still
 * in the browser's history behind it, so treating it as a back would later
 * send a real browser back into the form.
 */
export function recordVisit(url: string, traversal = false) {
  const s = getStack();
  if (s[s.length - 1] === url) return;
  if (traversal && s[s.length - 2] === url) s.pop();
  else s.push(url);
  save(s);
}

/** Tests only: forget everything. */
export function resetNavHistory() {
  stack = [];
}

/**
 * Where "back" from `current` should go: the most recent visited page that
 * isn't a form and isn't `current` itself. Returns its url and whether it's
 * the immediately previous history entry (so the caller can use a real
 * browser back). Trims the stack to that entry, so repeated backs keep
 * walking further back instead of bouncing between two pages.
 */
export function takeBackTarget(current: string): { url: string; isImmediate: boolean } | null {
  const s = getStack();
  let top = s.length - 1;
  if (s[top] === current) top -= 1;
  for (let i = top; i >= 0; i--) {
    if (s[i] === current || isFormPage(s[i])) continue;
    const isImmediate = i === s.length - 2 && s[s.length - 1] === current;
    s.length = i + 1;
    save(s);
    return { url: s[i], isImmediate };
  }
  return null;
}
