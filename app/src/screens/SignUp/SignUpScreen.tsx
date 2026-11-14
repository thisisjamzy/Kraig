'use client';

// Sign up (Dreda.figcraft `Sign up / Web` and `Sign up / Phone`): invite
// code, email and password on AuthLayout. A code from the invite link
// (?code=) fills the first field.

import { useId } from 'react';
import Link from 'next/link';
import { BadgeCheck, Eye, EyeOff, LoaderCircle, Lock, Mail } from 'lucide-react';
import { useLogic } from '@/src/logic/signUp/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { AuthLayout } from '@/src/widgets/Auth/AuthLayout';
import f from '@/src/widgets/Auth/AuthForm.module.css';

export function SignUpScreen() {
  const strings = useStrings();
  const inviteId = useId();
  const emailId = useId();
  const passwordId = useId();
  const { invite, setInvite, inviteError, email, setEmail, password, setPassword, showPassword, setShowPassword, error, submitting, handleSubmit } = useLogic();

  return (
    <AuthLayout>
      <div className={f.heading}>
        <h1 className={f.title}>{strings.signUp.title}</h1>
        <p className={f.subtitle}>{strings.signUp.tagline}</p>
      </div>

      <form className={f.form} onSubmit={handleSubmit} noValidate>
        <div className={f.field}>
          <label htmlFor={inviteId} className={f.label}>
            {strings.signUp.inviteLabel}
          </label>
          <div className={f.input} data-invalid={inviteError ? '' : undefined}>
            <BadgeCheck size={20} strokeWidth={2} aria-hidden className={f.icon} />
            <input
              id={inviteId}
              type="text"
              autoComplete="one-time-code"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder={strings.signUp.invitePlaceholder}
              value={invite}
              onChange={(event) => setInvite(event.target.value)}
              aria-invalid={inviteError ? true : undefined}
              aria-describedby={inviteError ? `${inviteId}-error` : undefined}
            />
          </div>
          {inviteError && (
            <p id={`${inviteId}-error`} className={f.error} role="alert">
              {inviteError === 'missing' ? strings.signUp.inviteMissing : strings.signUp.inviteInvalid}
            </p>
          )}
        </div>

        <div className={f.field}>
          <label htmlFor={emailId} className={f.label}>
            {strings.signUp.emailLabel}
          </label>
          <div className={f.input}>
            <Mail size={20} strokeWidth={2} aria-hidden className={f.icon} />
            <input id={emailId} type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
          </div>
        </div>

        <div className={f.field}>
          <div className={f.labelRow}>
            <label htmlFor={passwordId} className={f.label}>
              {strings.signUp.passwordLabel}
            </label>
            <span className={f.link}>{strings.signUp.passwordHint}</span>
          </div>
          <div className={f.input}>
            <Lock size={20} strokeWidth={2} aria-hidden className={f.icon} />
            <input
              id={passwordId}
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
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
        </div>

        <button type="submit" className={f.primary} disabled={submitting}>
          {submitting && <LoaderCircle size={18} className={f.spin} aria-hidden="true" />}
          {submitting ? strings.signUp.submitting : strings.signUp.submit}
        </button>

        <p className={f.footer}>
          {strings.signUp.footerPrompt}
          <Link href="/sign-in">{strings.signUp.footerLink}</Link>
        </p>
      </form>
    </AuthLayout>
  );
}
