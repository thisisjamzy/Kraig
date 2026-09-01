// Set once a sign-in/sign-up completes. Persists across app restarts (unlike
// the PIN's per-session verified flag), so the installed PWA can tell "never
// signed in, show the splash screen" apart from "signed in before, prompt for
// the PIN instead" on every relaunch.
export const SIGNED_IN_KEY = 'dreda-signed-in';

// True when the app is running as an installed PWA (added to the home
// screen / installed via the browser), false for a normal browser tab.
export function isStandalonePwa(): boolean {
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
}
