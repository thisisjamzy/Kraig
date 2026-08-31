'use client';

import { useId } from 'react';
import Link from 'next/link';
import { Eye, EyeOff, LoaderCircle } from 'lucide-react';
import { useLogic } from '@/src/logic/signIn/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { Logo } from '@/src/widgets/Logo/Logo';
import styles from './SignInScreen.module.css';

export function SignInScreen() {
  const strings = useStrings();
  const emailId = useId();
  const passwordId = useId();
  const {
    email,
    setEmail,
    password,
    setPassword,
    showPassword,
    setShowPassword,
    error,
    resetNotice,
    submitting,
    handleSubmit,
    handleForgotPassword,
  } = useLogic();

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <div>
          <Logo height={24}  className="mb-6" />
        </div>
        <h1 className={styles.title}>{strings.signIn.title}</h1>
        <p className={styles.tagline}>{strings.signIn.tagline}</p>

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.fieldGroup}>
            <label htmlFor={emailId} className={styles.fieldLabel}>
              {strings.signIn.emailLabel}
            </label>
            <input
              id={emailId}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={styles.input}
            />
          </div>

          <div className={styles.fieldGroup}>
            <div className={styles.passwordLabelRow}>
              <label htmlFor={passwordId} className={styles.fieldLabel}>
                {strings.signIn.passwordLabel}
              </label>
              <button type="button" className={styles.forgotPasswordLink} onClick={handleForgotPassword}>
                {strings.signIn.forgotPassword}
              </button>
            </div>
            <div className={styles.passwordField}>
              <input
                id={passwordId}
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={styles.input}
              />
              <button
                type="button"
                className={styles.togglePassword}
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {error && (
              <p className={styles.errorText} role="alert">
                {error}
              </p>
            )}
            {resetNotice && (
              <p className={styles.noticeText} role="status">
                {resetNotice}
              </p>
            )}
          </div>

          <button type="submit" className={styles.primaryButton} disabled={submitting}>
            {submitting && <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />}
            {submitting ? strings.signIn.submitting : strings.signIn.submit}
          </button>
        </form>

        <p className={styles.footerLine}>
          {strings.signIn.footerPrompt} <Link href="/sign-up">{strings.signIn.footerLink}</Link>
        </p>
      </div>
    </div>
  );
}
