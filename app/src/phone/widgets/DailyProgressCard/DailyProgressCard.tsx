'use client';

// Today's progress at a glance — its own card on the Time hub, above the
// Today's Tasks section. Uses the app's theme (brand blue for done). A large percentage (completed today / total today) and a dot grid,
// one dot per task in rows of 5: deep green for done, light grey for not.
// Up to 10 tasks use full-size dots, up to 15 shrink to fit three rows, and
// beyond that 15 dots stand in for the whole day proportionally.
//
// Live: checking a task off below pops the newly-green dot and counts the
// percentage up. Both run from effects on a change — never on first paint —
// and are skipped entirely under prefers-reduced-motion.

import { useEffect, useRef, useState } from 'react';
import styles from '@/src/phone/widgets/DailyProgressCard/DailyProgressCard.module.css';

const MAX_DOTS = 15;

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function DailyProgressCard({ done, total }: { done: number; total: number }) {
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  const dotCount = Math.min(total, MAX_DOTS);
  const filled = total > MAX_DOTS ? Math.round((done / total) * MAX_DOTS) : done;
  const size = total <= 10 ? 'large' : 'small';

  // Count the percentage up (or down) from what was showing to the new value.
  const [shownPercent, setShownPercent] = useState(percent);
  const shownRef = useRef(percent);
  useEffect(() => {
    const from = shownRef.current;
    if (from === percent) return;
    if (prefersReducedMotion()) {
      shownRef.current = percent;
      const id = requestAnimationFrame(() => setShownPercent(percent));
      return () => cancelAnimationFrame(id);
    }
    const started = performance.now();
    const duration = 450;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const value = Math.round(from + (percent - from) * eased);
      shownRef.current = value;
      setShownPercent(value);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [percent]);

  // Pop each dot that just turned green.
  const gridRef = useRef<HTMLDivElement>(null);
  const prevFilledRef = useRef(filled);
  useEffect(() => {
    const prev = prevFilledRef.current;
    prevFilledRef.current = filled;
    if (filled <= prev || prefersReducedMotion()) return;
    const dots = gridRef.current?.children;
    if (!dots) return;
    for (let i = prev; i < filled; i++) {
      (dots[i] as HTMLElement | undefined)?.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(1.35)' }, { transform: 'scale(1)' }],
        { duration: 320, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', delay: (i - prev) * 60 }
      );
    }
  }, [filled]);

  return (
    <section className={styles.card} aria-label="Today's progress">
      <div className={styles.top}>
        <p className={styles.label}>
          Today&apos;s tasks
          <br />
          {total > 0 ? 'Target' : 'No tasks yet'}
        </p>
        {total > 0 && (
          <p className={styles.count}>
            {done}/{total} completed
          </p>
        )}
      </div>
      <div className={styles.bottom}>
        <p className={styles.percent} data-complete={total > 0 && percent === 100 ? true : undefined} aria-live="polite">
          {shownPercent}%
        </p>
        {dotCount > 0 && (
          <div
            ref={gridRef}
            className={styles.dots}
            data-size={size}
            role="img"
            aria-label={`${done} of ${total} tasks done`}
          >
            {Array.from({ length: dotCount }, (_, i) => (
              <span key={i} className={styles.dot} data-done={i < filled ? true : undefined} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
