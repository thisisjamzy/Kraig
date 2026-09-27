'use client';

// "How long did it take?" — the optional quick prompt after a timed task is
// ticked done (TaskCheckRow calls askActualTime). Defaults to the estimate;
// Save stores it (taskWrites.ts's setActualMinutes), Skip or doing nothing
// leaves the estimate standing — Insights' estimate accuracy uses both.

import { useEffect, useState } from 'react';
import { Minus, Plus, Timer, X } from 'lucide-react';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { setActualMinutes } from '@/src/shared/firestore/taskWrites';
import styles from './ActualTimePrompt.module.css';

const EVENT = 'dreda:actual-time';
const AUTO_HIDE_MS = 15000;

interface Ask {
  taskId: string;
  title: string;
  estimateMinutes: number;
}

export function askActualTime(ask: Ask) {
  window.dispatchEvent(new CustomEvent<Ask>(EVENT, { detail: ask }));
}

function label(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function ActualTimePrompt() {
  const { user } = useFirebaseUser();
  const [ask, setAsk] = useState<Ask | null>(null);
  const [minutes, setMinutes] = useState(0);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    function onAsk(event: Event) {
      const detail = (event as CustomEvent<Ask>).detail;
      setAsk(detail);
      setMinutes(Math.round(detail.estimateMinutes));
      setTouched(false);
    }
    window.addEventListener(EVENT, onAsk);
    return () => window.removeEventListener(EVENT, onAsk);
  }, []);

  // Gone after a while unless the user started adjusting it.
  useEffect(() => {
    if (!ask || touched) return;
    const id = window.setTimeout(() => setAsk(null), AUTO_HIDE_MS);
    return () => window.clearTimeout(id);
  }, [ask, touched]);

  if (!ask) return null;
  const step = minutes >= 120 ? 15 : 5;

  async function save() {
    if (user && ask) await setActualMinutes(user.uid, ask.taskId, minutes);
    setAsk(null);
  }

  return (
    <div className={styles.prompt} role="dialog" aria-label="How long did it take?">
      <span className={styles.icon} aria-hidden>
        <Timer size={18} strokeWidth={2.25} />
      </span>
      <div className={styles.body}>
        <p className={styles.question}>
          How long did <strong>{ask.title}</strong> take?
        </p>
        <div className={styles.row}>
          <button
            type="button"
            className={styles.step}
            onClick={() => {
              setTouched(true);
              setMinutes((m) => Math.max(5, m - step));
            }}
            aria-label="Less time"
          >
            <Minus size={14} strokeWidth={2.5} />
          </button>
          <span className={styles.value}>{label(minutes)}</span>
          <button
            type="button"
            className={styles.step}
            onClick={() => {
              setTouched(true);
              setMinutes((m) => Math.min(24 * 60, m + step));
            }}
            aria-label="More time"
          >
            <Plus size={14} strokeWidth={2.5} />
          </button>
          <button type="button" className={styles.save} onClick={save}>
            Save
          </button>
        </div>
      </div>
      <button type="button" className={styles.close} onClick={() => setAsk(null)} aria-label="Skip">
        <X size={16} strokeWidth={2.25} />
      </button>
    </div>
  );
}
