'use client';

import { useCallback, useEffect, useState } from 'react';
import bcrypt from 'bcryptjs';
import {
  PIN_CREATE_HINT_KEY,
  PIN_HASH_CACHE_KEY,
  PIN_LENGTH,
  PIN_VERIFIED_KEY,
} from '@/src/shared/config/pinGate';
import { setClientCookie } from '@/src/shared/config/clientCookies';
import { callSetPin, callVerifyPin } from '@/src/shared/config/pinCallable';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

function shuffledDigits() {
  const digits = [...DIGITS];
  for (let i = digits.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [digits[i], digits[j]] = [digits[j], digits[i]];
  }
  return digits;
}

function unlockAndGoHome() {
  window.sessionStorage.setItem(PIN_VERIFIED_KEY, '1');
  // Plain cookie, not httpOnly — there's no Next.js route left to set one
  // server-side (PRD-FIREBASE.md section 1), proxy.ts's gate is a UX
  // convenience now, not the real security boundary (Firestore Security
  // Rules are, see firestore.rules).
  setClientCookie(PIN_VERIFIED_KEY, '1');
  // /loading decides between /home and /onboarding once its data is
  // actually ready (src/logic/loading/useLogic.ts) — never straight to
  // /home, so nobody is ever looking at a "Loading…" home page. A full
  // navigation (not router.push) so it loads fresh with its own stylesheet,
  // rather than inheriting this client-only (ssr: false) page's client-side
  // transition. When this came from the offline fallback below, the real
  // request never happens either — the service worker serves the fallback
  // page from cache before it would ever reach proxy.ts.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign('/loading');
}

export type PinMode = 'verify' | 'set';

export function useLogic() {
  const [pin, setPin] = useState('');
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
  const [mode, setMode] = useState<PinMode>(() =>
    typeof window !== 'undefined' && window.sessionStorage.getItem(PIN_CREATE_HINT_KEY) === '1'
      ? 'set'
      : 'verify'
  );
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
        unlockAndGoHome();
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
        unlockAndGoHome();
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

  return { pin, keypad, appendDigit, backspace, handleContinue, canContinue, pinLength: PIN_LENGTH, mode, error };
}
