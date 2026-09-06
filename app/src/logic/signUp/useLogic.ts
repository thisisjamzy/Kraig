'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { getFirebaseAuth } from '@/src/shared/config/firebaseClient';
import { markSignedIn } from '@/src/shared/config/authSession';
import { firebaseErrorMessage } from '@/src/shared/config/firebaseErrors';
import { ensureUserDoc } from '@/src/shared/firestore/ensureUserDoc';

export function useLogic() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      // No session route anymore (PRD-FIREBASE.md section 1) and no
      // onCreate Auth trigger either (Spark plan, no Cloud Functions
      // deployed — see firestore.rules' header) — ensureUserDoc creates
      // users/{uid} itself, awaited here so it exists before onboarding's
      // own Firestore reads ever run.
      const credential = await createUserWithEmailAndPassword(getFirebaseAuth(), email, password);
      await updateProfile(credential.user, { displayName: name.trim() });
      await ensureUserDoc(credential.user);

      markSignedIn();
      router.push('/onboarding');
    } catch (err) {
      setError(firebaseErrorMessage(err));
      setSubmitting(false);
    }
  }

  return {
    name,
    setName,
    email,
    setEmail,
    password,
    setPassword,
    showPassword,
    setShowPassword,
    error,
    setError,
    submitting,
    handleSubmit,
  };
}
