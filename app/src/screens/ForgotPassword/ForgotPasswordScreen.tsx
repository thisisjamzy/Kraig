'use client';

// Forgot password (Dreda.figcraft `Forgot password / Web`, `/ Web / Email
// sent` and the phone pair), on AuthLayout like sign in.

import { useId } from 'react';
import Link from 'next/link';
import { LoaderCircle, Mail } from 'lucide-react';
import { useLogic } from '@/src/logic/forgotPassword/useLogic';
import { AuthLayout } from '@/src/widgets/Auth/AuthLayout';
import f from '@/src/widgets/Auth/AuthForm.module.css';

export function ForgotPasswordScreen() {
  const emailId = useId();
  const v = useLogic();

  if (v.sent) {
    return (
      <AuthLayout>
        <div className={f.heading}>
          <h1 className={f.title}>Check your email</h1>
          <p className={f.subtitle}>We sent a reset link to {v.email.trim()}. Open it to choose a new password, then come back and sign in.</p>
        </div>
        <p className={f.infoBox}>
          <Mail size={18} strokeWidth={2} aria-hidden />
          Can&apos;t see it? Check your spam or promotions folder. The link expires after a while, so use it soon.
        </p>
        <Link href="/sign-in" className={f.primary}>
          Back to sign in
        </Link>
        <p className={f.footer}>
          Didn&apos;t get it?
          {v.wait > 0 ? (
            <span className={f.muted}> Resend in 0:{String(v.wait).padStart(2, '0')}</span>
          ) : (
            <button type="button" className={f.link} onClick={() => void v.send()}>
              Resend
            </button>
          )}
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className={f.heading}>
        <h1 className={f.title}>Reset your password</h1>
        <p className={f.subtitle}>Enter the email you sign in with. We will send you a link to choose a new password.</p>
      </div>
      <form className={f.form} onSubmit={v.send} noValidate>
        <div className={f.field}>
          <label htmlFor={emailId} className={f.label}>
            Email
          </label>
          <div className={f.input}>
            <Mail size={20} strokeWidth={2} aria-hidden className={f.icon} />
            <input id={emailId} type="email" autoComplete="email" value={v.email} onChange={(e) => v.setEmail(e.target.value)} placeholder="you@example.com" />
          </div>
          {v.error && (
            <p className={f.error} role="alert">
              {v.error}
            </p>
          )}
        </div>
        <button type="submit" className={f.primary} disabled={v.submitting}>
          {v.submitting && <LoaderCircle size={18} className={f.spin} aria-hidden="true" />}
          {v.submitting ? 'Sending…' : 'Send reset link'}
        </button>
        <p className={f.footer}>
          <Link href="/sign-in">Back to sign in</Link>
        </p>
      </form>
    </AuthLayout>
  );
}
