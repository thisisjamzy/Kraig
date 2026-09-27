'use client';

// A brief bottom toast ("added as free, sharing time with 2 tasks"). The
// message is parked in sessionStorage first, so a toast fired right before
// navigating away (save → router.push) still shows on the page that opens.
// One ToastHost is mounted in the app shell.

import { useEffect, useState } from 'react';
import styles from './Toast.module.css';

const KEY = 'dreda.toast';
const EVENT = 'dreda:toast';
const DURATION_MS = 3200;

export function showToast(message: string) {
  try {
    sessionStorage.setItem(KEY, message);
  } catch {
    // Storage blocked — the in-page event below still shows it.
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: message }));
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
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    const show = (text: string) => {
      setMessage(text);
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => setMessage(null), DURATION_MS);
    };
    // A toast parked by the page we just left.
    const parked = takeParked();
    const frame = parked ? requestAnimationFrame(() => show(parked)) : 0;
    const onToast = (event: Event) => {
      takeParked();
      show((event as CustomEvent<string>).detail);
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
      {message && (
        <div key={message} className={styles.toast}>
          {message}
        </div>
      )}
    </div>
  );
}
