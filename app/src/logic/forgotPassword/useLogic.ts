'use client';

// Forgot password (Dreda.figcraft `Forgot password / Web` and `/ Phone`):
// the email (prefilled from sign in's ?email=), Send reset link, then the
// "Check your email" state with a resend that waits 45 seconds.

import { useEffect, useState, type FormEvent } from 'react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { getFirebaseAuth } from '@/src/shared/config/firebaseClient';
import { firebaseErrorMessage } from '@/src/shared/config/firebaseErrors';

const WAIT = 45;

function emailFromSearch(): string {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get('email') ?? '';
}

export function useLogic() {
  const [email, setEmail] = useState(emailFromSearch);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = window.setTimeout(() => setWait((w) => w - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [wait]);

  async function send(event?: FormEvent) {
    event?.preventDefault();
    if (submitting || wait > 0) return;
    if (!email.trim()) {
      setError('Enter the email you sign in with.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await sendPasswordResetEmail(getFirebaseAuth(), email.trim());
      setSent(true);
      setWait(WAIT);
    } catch (err) {
      setError(firebaseErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return { email, setEmail, sent, error, submitting, wait, send };
}
