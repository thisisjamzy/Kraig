'use client';

import { ArrowUpRight, Eye, EyeOff, Undo2 } from 'lucide-react';
import { useLogic } from '@/src/logic/pin/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { Logo } from '@/src/widgets/Logo/Logo';
import styles from './PinScreen.module.css';

export function PinScreen() {
  const {
    pin,
    keypad,
    appendDigit,
    backspace,
    handleContinue,
    canContinue,
    pinLength,
    mode,
    error,
    showPin,
    togglePinVisibility,
  } = useLogic();
  const strings = useStrings();

  return (
    <div className={styles.page}>
      <div className={styles.logoRow}>
        <Logo className={styles.logo} />
      </div>

      <h1 className={styles.title}>{mode === 'set' ? strings.pin.titleCreate : strings.pin.title}</h1>

      <div className={styles.pinRow}>
        {Array.from({ length: pinLength }).map((_, index) => (
          <div key={index} className={styles.pinBox}>
            {pin[index] ? (showPin ? pin[index] : <span className={styles.pinDot} aria-hidden="true" />) : ''}
          </div>
        ))}
      </div>

      {error && (
        <p className={styles.errorText} role="alert">
          {error}
        </p>
      )}

      <div className={styles.bottomSection}>
        <div className={styles.keypad}>
          {keypad.map((key) => {
            if (key === 'back') {
              return (
                <button
                  key="back"
                  type="button"
                  className={styles.key}
                  onClick={backspace}
                  aria-label="Delete digit"
                >
                  <Undo2 size={20} strokeWidth={2} />
                </button>
              );
            }
            if (key === '') {
              return (
                <button
                  key="toggle-visibility"
                  type="button"
                  className={styles.key}
                  onClick={togglePinVisibility}
                  aria-label={showPin ? 'Hide PIN' : 'Show PIN'}
                  aria-pressed={showPin}
                >
                  {showPin ? <EyeOff size={20} strokeWidth={2} /> : <Eye size={20} strokeWidth={2} />}
                </button>
              );
            }
            return (
              <button
                key={key}
                type="button"
                className={styles.key}
                onClick={() => appendDigit(key)}
              >
                {key}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          className={styles.continueButton}
          disabled={!canContinue}
          onClick={handleContinue}
        >
          {strings.pin.continueLabel}
          <ArrowUpRight size={18} strokeWidth={2.5} />
        </button>

        <p className={styles.footerNote}>
          {strings.pin.footerNotePrefix}{' '}
          <span className={styles.footerLink}>{strings.pin.footerLink}</span> {strings.pin.footerNoteSuffix}
        </p>
      </div>
    </div>
  );
}
