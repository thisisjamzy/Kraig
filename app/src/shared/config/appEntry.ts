// Set once a sign-in/sign-up completes. Persists across app restarts, so the
// installed PWA can tell "never signed in, show the splash screen" apart
// from "signed in before, skip splash and force a fresh sign-in instead" on
// every relaunch — src/logic/appEntry/useLogic.ts always requires real
// re-authentication on a standalone relaunch either way, this flag only
// picks which screen greets a fresh app-open.
export const SIGNED_IN_KEY = 'dreda-signed-in';

// True when the app is running as an installed PWA (added to the home
// screen / installed via the browser), false for a normal browser tab.
export function isStandalonePwa(): boolean {
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
}
