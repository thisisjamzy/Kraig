'use client';

import { useCallback, useEffect, useState } from 'react';
import bcrypt from 'bcryptjs';
import {
  PIN_CREATE_HINT_KEY,
  PIN_DISABLED_KEY,
  PIN_HASH_CACHE_KEY,
  PIN_LENGTH,
  PIN_VERIFIED_KEY,
} from '@/src/shared/config/pinGate';
import { setClientCookie, PERSISTENT_COOKIE_MAX_AGE_SECONDS } from '@/src/shared/config/clientCookies';
import { markSignedIn } from '@/src/shared/config/authSession';
import { callSetPin, callVerifyPin } from '@/src/shared/config/pinCallable';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { useSettings } from '@/src/shared/firestore/queries';

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

function shuffledDigits() {
  const digits = [...DIGITS];
  for (let i = digits.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [digits[i], digits[j]] = [digits[j], digits[i]];
  }
  return digits;
}

function unlockAndGoHome(isNewAccountFlow: boolean) {
  // Re-affirm SIGNED_IN_KEY right here — a successful PIN Callable Function
  // call is the strongest proof available that this user is genuinely
  // signed in (it required a valid Firebase Auth token), so this is exactly
  // the "double check before asking to sign in" moment: it self-heals
  // SIGNED_IN_KEY's cookie if it ever drifted out of sync with its
  // localStorage mirror (see authSession.ts's own header for the bug this
  // fixes), so the hard navigation below never gets bounced to /sign-in by
  // proxy.ts right after a correct PIN.
  markSignedIn();
  window.sessionStorage.setItem(PIN_VERIFIED_KEY, '1');
  // Plain cookie, not httpOnly — there's no Next.js route left to set one
  // server-side (PRD-FIREBASE.md section 1), proxy.ts's gate is a UX
  // convenience now, not the real security boundary (Firestore Security
  // Rules are, see firestore.rules).
  setClientCookie(PIN_VERIFIED_KEY, '1');
  // Onboarding is reached exactly one way: sign-up -> "create your PIN"
  // (isNewAccountFlow, from PIN_CREATE_HINT_KEY below) -> here. There's
  // nothing to warm Firestore's local cache with for a brand new account,
  // so this skips /loading and goes straight there. Every other PIN success
  // — a normal verify, or the NO_PIN fallback below for a pre-PIN-era
  // account that already has data — always lands on /home, never
  // onboarding again, even if that account happens to have zero wallets;
  // /loading decides once its data is actually ready
  // (src/logic/loading/useLogic.ts), so nobody is ever looking at a
  // "Loading…" home page. A full navigation (not router.push) either way so
  // it loads fresh with its own stylesheet, rather than inheriting this
  // client-only (ssr: false) page's client-side transition. When this came
  // from the offline fallback below, the real request never happens either
  // — the service worker serves the fallback page from cache before it
  // would ever reach proxy.ts.
  window.location.assign(isNewAccountFlow ? '/onboarding' : '/loading');
}

export type PinMode = 'verify' | 'set';

export function useLogic() {
  const [pin, setPin] = useState('');
  // Masked (dots) by default, same as every other PIN/password entry in the
  // app — toggled on request via the keypad's own unused blank slot (see
  // PinScreen.tsx), not persisted across mounts.
  const [showPin, setShowPin] = useState(false);
  const togglePinVisibility = useCallback(() => setShowPin((current) => !current), []);
  // Randomized once per mount (each time the page opens), not on every render.
  const [digits] = useState(shuffledDigits);
  // Same 3-column phone-keypad layout as Add Transaction: three rows of
  // digits, then a last row with the leftover digit centered next to
  // backspace. Only the numbers move around on each shuffle.
  const keypad = [...digits.slice(0, 9), '', digits[9], 'back'] as const;
  // Sign-up sets PIN_CREATE_HINT_KEY right before routing here for a brand
  // new account, so this opens straight into "create your PIN" instead of
  // trying — and failing — a verify first. Otherwise starts assuming an
  // existing PIN, and still flips to 'set' if the verifyPin Callable
  // Function ever reports this account has none yet ({code: 'NO_PIN'}), see
  // handleContinue below — the fallback that covers a fresh OAuth account.
  // Captured once at mount, unlike `mode` below — `mode` can also flip to
  // 'set' later via the NO_PIN fallback (an existing, pre-PIN-era account
  // that already has data, just never set a PIN), and that account must
  // still land on /home, not /onboarding. This stays true only when
  // PIN_CREATE_HINT_KEY was actually the reason this screen opened straight
  // into "create" mode — i.e. sign-up just created this account.
  const [isNewAccountFlow] = useState(
    () => typeof window !== 'undefined' && window.sessionStorage.getItem(PIN_CREATE_HINT_KEY) === '1'
  );
  const [mode, setMode] = useState<PinMode>(() => (isNewAccountFlow ? 'set' : 'verify'));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Firebase Auth rehydrates the signed-in session asynchronously on a
  // fresh page load/refresh — currentUser can briefly be null even though
  // the user really is signed in. Blocking submission until this resolves
  // avoids a spurious "not signed in" throw racing that rehydration (it
  // used to get mislabeled as a network failure below).
  const { user, loading: authLoading } = useFirebaseUser();

  useEffect(() => {
    window.sessionStorage.removeItem(PIN_CREATE_HINT_KEY);
  }, []);

  // Settings' "Require PIN" toggle (src/logic/settings/useLogic.ts) is
  // account-wide in Firestore, but this device's own PIN_DISABLED_KEY
  // cookie/localStorage flag — the thing appEntry and proxy.ts actually act
  // on — only gets set the moment the toggle is flipped ON THAT device.
  // Landing here on a device that hasn't seen the toggle yet (PIN was
  // disabled elsewhere) means the account really doesn't want a PIN gate at
  // all: sync the local flag and skip straight past, same as a real PIN
  // success would.
  const { data: settings, loading: settingsLoading } = useSettings();
  useEffect(() => {
    if (settingsLoading || !settings?.pinDisabled) return;
    window.localStorage.setItem(PIN_DISABLED_KEY, '1');
    setClientCookie(PIN_DISABLED_KEY, '1', PERSISTENT_COOKIE_MAX_AGE_SECONDS);
    window.location.assign('/loading');
  }, [settingsLoading, settings?.pinDisabled]);

  const appendDigit = useCallback((digit: string) => {
    setError(null);
    setPin((current) => (current.length < PIN_LENGTH ? current + digit : current));
  }, []);

  const backspace = useCallback(() => {
    setError(null);
    setPin((current) => current.slice(0, -1));
  }, []);

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      if (/^[0-9]$/.test(event.key)) {
        appendDigit(event.key);
      } else if (event.key === 'Backspace') {
        backspace();
      }
    }
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [appendDigit, backspace]);

  /**
   * Only for a 'verify' attempt while genuinely offline (navigator.onLine
   * false — an actual fetch failure while online surfaces as a real error
   * instead, rather than silently unlocking against a possibly-stale cache).
   * Compares against the bcrypt hash cached in localStorage on the last
   * successful online verify/set (PIN_HASH_CACHE_KEY) — safe to keep
   * client-side, it's one-way, this is not the PIN itself. There is nothing
   * to fall back to for 'set': creating a PIN always needs the server.
   */
  async function tryOfflineVerify(pinValue: string): Promise<boolean> {
    if (navigator.onLine) return false;
    const cachedHash = window.localStorage.getItem(PIN_HASH_CACHE_KEY);
    if (!cachedHash) return false;
    return bcrypt.compare(pinValue, cachedHash);
  }

  async function handleContinue() {
    if (pin.length !== PIN_LENGTH || submitting || authLoading) return;
    if (!user) {
      setPin('');
      setError('Not signed in — go back and sign in again.');
      return;
    }
    setSubmitting(true);
    setError(null);
    const attemptedPin = pin;

    try {
      const data = mode === 'verify' ? await callVerifyPin(attemptedPin) : await callSetPin(attemptedPin);

      if (data.ok) {
        if (data.pinHash) window.localStorage.setItem(PIN_HASH_CACHE_KEY, data.pinHash);
        unlockAndGoHome(isNewAccountFlow);
        return;
      }

      if (data.code === 'NO_PIN') {
        setMode('set');
        setPin('');
        return;
      }

      setPin('');
      setError(data.error || 'Something went wrong.');
    } catch (err) {
      if (mode === 'verify' && (await tryOfflineVerify(attemptedPin))) {
        unlockAndGoHome(isNewAccountFlow);
        return;
      }
      setPin('');
      // Check actual connectivity directly rather than inferring it from
      // the error's shape — with Firestore's offline persistence enabled
      // (see firebaseClient.ts), a genuinely offline write usually just
      // queues locally instead of rejecting at all, so a rejection here is
      // far more likely to be a real error (e.g. permission-denied for an
      // archived account's revoked users/{uid}/private/pin access) worth
      // showing directly than an actual network failure.
      if (!navigator.onLine) {
        setError(
          mode === 'verify' && !window.localStorage.getItem(PIN_HASH_CACHE_KEY)
            ? "You're offline and haven't verified your PIN on this device before — reconnect once to enable offline unlock."
            : "You're offline — reconnect to set your PIN."
        );
      } else {
        setError(err instanceof Error ? err.message : 'Something went wrong.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  const canContinue = pin.length === PIN_LENGTH && !submitting && !authLoading;

  return {
    pin,
    keypad,
    appendDigit,
    backspace,
    handleContinue,
    canContinue,
    pinLength: PIN_LENGTH,
    mode,
    error,
    showPin,
    togglePinVisibility,
  };
}
