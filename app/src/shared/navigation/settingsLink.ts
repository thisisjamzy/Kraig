// Settings opens over the current page on wide screens (?settings=<section>,
// the dialog in PanelHost) and as /settings/<section> on a phone.

export const SETTINGS_PARAM = 'settings';

/** The current page with Settings open at `section`. */
export function settingsHref(pathname: string, search: string, section = 'preferences'): string {
  const sp = new URLSearchParams(search.replace(/^\?/, ''));
  sp.set(SETTINGS_PARAM, section);
  return `${pathname}?${sp.toString()}`;
}

/** The current URL without the Settings dialog. */
export function withoutSettings(pathname: string, search: string): string {
  const sp = new URLSearchParams(search.replace(/^\?/, ''));
  sp.delete(SETTINGS_PARAM);
  const s = sp.toString();
  return s ? `${pathname}?${s}` : pathname;
}

/** A section's own page, what a phone opens. Notifications keeps its existing page. */
export function settingsPageHref(section: string): string {
  return `/settings/${section}`;
}
