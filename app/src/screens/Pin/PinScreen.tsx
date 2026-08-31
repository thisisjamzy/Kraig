'use client';

import { ArrowUpRight, Undo2 } from 'lucide-react';
import { useLogic } from '@/src/logic/pin/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { Logo } from '@/src/widgets/Logo/Logo';
import styles from './PinScreen.module.css';

export function PinScreen() {
  const { pin, keypad, appendDigit, backspace, handleContinue, canContinue, pinLength, mode, error } =
    useLogic();
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
            {pin[index] ?? ''}
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
          {keypad.map((key, index) => {
            
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
              return <div key={`blank-${index}`} aria-hidden="true" />;
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
