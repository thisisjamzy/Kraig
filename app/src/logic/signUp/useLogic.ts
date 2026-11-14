'use client';

import { useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { getFirebaseAuth } from '@/src/shared/config/firebaseClient';
import { markSignedIn } from '@/src/shared/config/authSession';
import { firebaseErrorMessage } from '@/src/shared/config/firebaseErrors';
import { ensureUserDoc } from '@/src/shared/firestore/ensureUserDoc';

// Invite codes read DRD-XXXX-XX. Only the shape is checked here: there is no
// invite store yet, so a spent code cannot be told apart from a fresh one.
const INVITE_SHAPE = /^DRD-[A-Z0-9]{4}-[A-Z0-9]{2}$/;

export type InviteError = 'missing' | 'invalid' | null;

export function normaliseInvite(raw: string) {
  return raw.toUpperCase().replace(/\s+/g, '');
}

export function useLogic() {
  const router = useRouter();
  const params = useSearchParams();
  const [invite, setInviteRaw] = useState(() => normaliseInvite(params.get('code') ?? ''));
  const [inviteError, setInviteError] = useState<InviteError>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    const code = normaliseInvite(invite);
    const codeError: InviteError = !code ? 'missing' : INVITE_SHAPE.test(code) ? null : 'invalid';
    setInviteError(codeError);
    if (codeError) return;
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
    invite,
    setInvite: (value: string) => {
      setInviteRaw(normaliseInvite(value));
      setInviteError(null);
    },
    inviteError,
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
