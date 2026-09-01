'use client';

import { useId } from 'react';
import Link from 'next/link';
import { Eye, EyeOff, LoaderCircle } from 'lucide-react';
import { useLogic } from '@/src/logic/signUp/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { Logo } from '@/src/widgets/Logo/Logo';
import styles from './SignUpScreen.module.css';

export function SignUpScreen() {
  const strings = useStrings();
  const nameId = useId();
  const emailId = useId();
  const passwordId = useId();
  const {
    name,
    setName,
    email,
    setEmail,
    password,
    setPassword,
    showPassword,
    setShowPassword,
    error,
    submitting,
    handleSubmit,
  } = useLogic();

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <div>
          <Logo height={24}  className="mb-6" />
        </div>
        <h1 className={styles.title}>{strings.signUp.title}</h1>
        <p className={styles.tagline}>{strings.signUp.tagline}</p>

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.fieldGroup}>
            <label htmlFor={nameId} className={styles.fieldLabel}>
              {strings.signUp.nameLabel}
            </label>
            <input
              id={nameId}
              type="text"
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={styles.input}
            />
          </div>

          <div className={styles.fieldGroup}>
            <label htmlFor={emailId} className={styles.fieldLabel}>
              {strings.signUp.emailLabel}
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
            <label htmlFor={passwordId} className={styles.fieldLabel}>
              {strings.signUp.passwordLabel}
            </label>
            <div className={styles.passwordField}>
              <input
                id={passwordId}
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
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
          </div>

          <button type="submit" className={styles.primaryButton} disabled={submitting}>
            {submitting && <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />}
            {submitting ? strings.signUp.submitting : strings.signUp.submit}
          </button>
        </form>

        <p className={styles.footerLine}>
          {strings.signUp.footerPrompt} <Link href="/sign-in">{strings.signUp.footerLink}</Link>
        </p>
      </div>
    </div>
  );
}
