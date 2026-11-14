'use client';

// Sign in (Dreda.figcraft `Login / Web` and `Login / Phone`): the form on
// AuthLayout. Dreda is invite only, so the footer leads to the landing
// page's invite request instead of sign up.

import { useId } from 'react';
import Link from 'next/link';
import { Eye, EyeOff, LoaderCircle, Lock, Mail } from 'lucide-react';
import { useLogic } from '@/src/logic/signIn/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { AuthLayout } from '@/src/widgets/Auth/AuthLayout';
import f from '@/src/widgets/Auth/AuthForm.module.css';

export function SignInScreen() {
  const strings = useStrings();
  const emailId = useId();
  const passwordId = useId();
  const { email, setEmail, password, setPassword, showPassword, setShowPassword, error, resetNotice, submitting, handleSubmit } = useLogic();

  return (
    <AuthLayout>
      <div className={f.heading}>
        <h1 className={f.title}>{strings.signIn.title}</h1>
        <p className={f.subtitle}>{strings.signIn.tagline}</p>
      </div>

      <form className={f.form} onSubmit={handleSubmit}>
        <div className={f.field}>
          <label htmlFor={emailId} className={f.label}>
            {strings.signIn.emailLabel}
          </label>
          <div className={f.input}>
            <Mail size={20} strokeWidth={2} aria-hidden className={f.icon} />
            <input id={emailId} type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
          </div>
        </div>

        <div className={f.field}>
          <div className={f.labelRow}>
            <label htmlFor={passwordId} className={f.label}>
              {strings.signIn.passwordLabel}
            </label>
            <Link href={email ? `/forgot-password?email=${encodeURIComponent(email)}` : '/forgot-password'} className={f.link}>
              {strings.signIn.forgotPassword}
            </Link>
          </div>
          <div className={f.input}>
            <Lock size={20} strokeWidth={2} aria-hidden className={f.icon} />
            <input
              id={passwordId}
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <button type="button" className={f.toggle} onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
              {showPassword ? <EyeOff size={20} strokeWidth={2} /> : <Eye size={20} strokeWidth={2} />}
            </button>
          </div>
          {error && (
            <p className={f.error} role="alert">
              {error}
            </p>
          )}
          {resetNotice && (
            <p className={f.notice} role="status">
              {resetNotice}
            </p>
          )}
        </div>

        <button type="submit" className={f.primary} disabled={submitting}>
          {submitting && <LoaderCircle size={18} className={f.spin} aria-hidden="true" />}
          {submitting ? strings.signIn.submitting : strings.signIn.submit}
        </button>

        <p className={f.footer}>
          {strings.signIn.footerPrompt}
          <Link href="/#invite">{strings.signIn.footerLink}</Link>
        </p>
      </form>
    </AuthLayout>
  );
}
