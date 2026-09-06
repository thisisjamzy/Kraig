'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Apple } from 'lucide-react';
import { GoogleAuthProvider, OAuthProvider, getRedirectResult, signInWithRedirect } from 'firebase/auth';
import { getFirebaseAuth } from '@/src/shared/config/firebaseClient';
import { markSignedIn } from '@/src/shared/config/authSession';
import { ensureUserDoc } from '@/src/shared/firestore/ensureUserDoc';
import styles from './OAuthButtons.module.css';

// Shared by Sign in and Sign up (PRD-AUTH-FIREBASE.md section 6, which
// specifically calls out pulling this out of SignUpScreen rather than
// duplicating the SVG and handlers once Sign in gets the same buttons).
// Owns the full round trip, not just the markup: clicking a button starts
// signInWithRedirect — not signInWithPopup, popups are unreliable or
// blocked outright in an installed standalone PWA on iOS Safari specifically
// (section 7) — and this component also picks up getRedirectResult() on
// whichever screen the person lands back on afterward, so neither screen
// needs any OAuth-specific code of its own beyond rendering this.

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.706A5.41 5.41 0 0 1 3.68 9c0-.593.102-1.17.284-1.706V4.962H.957A9 9 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58Z"
      />
    </svg>
  );
}

function appleProvider() {
  const provider = new OAuthProvider('apple.com');
  provider.addScope('email');
  provider.addScope('name');
  return provider;
}

interface OAuthButtonsProps {
  dividerLabel: string;
  googleLabel: string;
  appleLabel: string;
  onError?: (message: string) => void;
}

export function OAuthButtons({ dividerLabel, googleLabel, appleLabel, onError }: OAuthButtonsProps) {
  const router = useRouter();
  const [redirecting, setRedirecting] = useState(false);
  // Avoids double-handling the redirect result under React 18 Strict Mode's
  // dev-only double-invoked effects — getRedirectResult itself is safe to
  // call twice, but routing/marking-signed-in twice is not worth risking.
  const handledRedirect = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await getRedirectResult(getFirebaseAuth());
        if (!result || cancelled || handledRedirect.current) return;
        handledRedirect.current = true;

        const { isNewAccount } = await ensureUserDoc(result.user);

        markSignedIn();
        router.push(isNewAccount ? '/onboarding' : '/loading');
      } catch (error) {
        if (!cancelled) onError?.(error instanceof Error ? error.message : 'Sign-in failed.');
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSelect(id: 'google' | 'apple') {
    setRedirecting(true);
    void signInWithRedirect(getFirebaseAuth(), id === 'google' ? new GoogleAuthProvider() : appleProvider());
  }

  return (
    <>
      <div className={styles.divider}>
        <span>{dividerLabel}</span>
      </div>
      <div className={styles.group}>
        <button
          type="button"
          className={styles.button}
          disabled={redirecting}
          onClick={() => handleSelect('google')}
        >
          <GoogleIcon />
          {googleLabel}
        </button>
        <button
          type="button"
          className={styles.button}
          disabled={redirecting}
          onClick={() => handleSelect('apple')}
        >
          <Apple size={18} strokeWidth={0} fill="currentColor" />
          {appleLabel}
        </button>
      </div>
    </>
  );
}
