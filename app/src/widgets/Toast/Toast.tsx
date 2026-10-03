'use client';

// A brief bottom toast ("added as free, sharing time with 2 tasks"). The
// message is parked in sessionStorage first, so a toast fired right before
// navigating away (save → router.push) still shows on the page that opens.
// One ToastHost is mounted in the app shell. A toast can carry one action
// ("Undo"); actions only run on the page that fired them, so an action
// toast is never parked for the next page.

import { useEffect, useState } from 'react';
import styles from './Toast.module.css';

const KEY = 'dreda.toast';
const EVENT = 'dreda:toast';
const DURATION_MS = 4000;

interface ToastDetail {
  message: string;
  action?: { label: string; onClick: () => void };
  duration?: number;
}

export function showToast(message: string, options: { action?: ToastDetail['action']; duration?: number } = {}) {
  if (!options.action) {
    try {
      sessionStorage.setItem(KEY, message);
    } catch {
      // Storage blocked — the in-page event below still shows it.
    }
  }
  window.dispatchEvent(new CustomEvent<ToastDetail>(EVENT, { detail: { message, ...options } }));
}

function takeParked(): string | null {
  try {
    const message = sessionStorage.getItem(KEY);
    if (message) sessionStorage.removeItem(KEY);
    return message;
  } catch {
    return null;
  }
}

export function ToastHost() {
  const [toast, setToast] = useState<ToastDetail | null>(null);

  useEffect(() => {
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    const show = (detail: ToastDetail) => {
      setToast(detail);
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => setToast(null), detail.duration ?? DURATION_MS);
    };
    // A toast parked by the page we just left.
    const parked = takeParked();
    const frame = parked ? requestAnimationFrame(() => show({ message: parked })) : 0;
    const onToast = (event: Event) => {
      takeParked();
      show((event as CustomEvent<ToastDetail>).detail);
    };
    window.addEventListener(EVENT, onToast);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(hideTimer);
      window.removeEventListener(EVENT, onToast);
    };
  }, []);

  return (
    <div className={styles.region} role="status" aria-live="polite">
      {toast && (
        <div key={toast.message} className={styles.toast} data-action={toast.action ? true : undefined}>
          <span>{toast.message}</span>
          {toast.action && (
            <button
              type="button"
              className={styles.action}
              onClick={() => {
                toast.action!.onClick();
                setToast(null);
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
