'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirebaseAuth } from '@/src/shared/config/firebaseClient';
import { markSignedIn } from '@/src/shared/config/authSession';
import { firebaseErrorMessage } from '@/src/shared/config/firebaseErrors';
import { ensureUserDoc } from '@/src/shared/firestore/ensureUserDoc';

export function useLogic() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetNotice, setResetNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    setResetNotice(null);

    try {
      // No session route anymore (PRD-FIREBASE.md section 1) — a successful
      // Firebase sign-in is the whole story, Firestore verifies this same
      // ID token itself on every read/write from here on via Security Rules.
      // ensureUserDoc covers an account that signed up before users/{uid}
      // existed, or just bumps lastLoginAt on a normal return visit.
      const credential = await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
      await ensureUserDoc(credential.user);
      markSignedIn();
      router.push('/pin');
    } catch (err) {
      setError(firebaseErrorMessage(err));
      setSubmitting(false);
    }
  }

  async function handleForgotPassword() {
    if (!email) {
      setError('Enter your email above first, then tap "Forgot password?" again.');
      return;
    }
    setError(null);
    setResetNotice(null);
    try {
      await sendPasswordResetEmail(getFirebaseAuth(), email);
      setResetNotice('Password reset email sent — check your inbox.');
    } catch (err) {
      setError(firebaseErrorMessage(err));
    }
  }

  return {
    email,
    setEmail,
    password,
    setPassword,
    showPassword,
    setShowPassword,
    error,
    setError,
    resetNotice,
    submitting,
    handleSubmit,
    handleForgotPassword,
  };
}
