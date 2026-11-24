'use client';

// Small pieces the import flow's screens share: the step indicator, a row's
// status icon, and the row window that keeps a long table light.

import { useEffect, useState, type RefObject } from 'react';
import s from './ImportFlow.module.css';

export type FlowStep = 'upload' | 'columns' | 'review' | 'ready' | 'importing';

const STEPS: { key: FlowStep; label: string }[] = [
  { key: 'upload', label: 'Upload' },
  { key: 'columns', label: 'Columns' },
  { key: 'review', label: 'Review' },
  { key: 'ready', label: 'Ready' },
  { key: 'importing', label: 'Import' },
];

/** Upload, Columns, Review, Ready, Import: the current one highlighted. */
export function StepIndicator({ current, columnsSkipped }: { current: FlowStep; columnsSkipped: boolean }) {
  const at = STEPS.findIndex((x) => x.key === current);
  return (
    <ol className={s.steps} aria-label="Import steps">
      {STEPS.map((step, i) => {
        const state = step.key === 'columns' && columnsSkipped && i < at ? 'skipped' : i < at ? 'done' : i === at ? 'current' : 'next';
        return (
          <li key={step.key} data-state={state} aria-current={i === at ? 'step' : undefined}>
            {step.label}
          </li>
        );
      })}
    </ol>
  );
}

export type RowStatus = 'waiting' | 'importing' | 'imported' | 'failed' | 'removing' | 'removed';

const STATUS_TEXT: Record<RowStatus, string> = {
  waiting: 'Waiting',
  importing: 'Importing',
  imported: 'Imported',
  failed: 'Failed',
  removing: 'Removing',
  removed: 'Removed',
};

/** The icon for a row's status, with its word for screen readers (and beside it from 600px). */
export function StatusIcon({ status, showText = true }: { status: RowStatus; showText?: boolean }) {
  return (
    <span className={s.status}>
      <svg className={`${s.icon} ${status === 'importing' || status === 'removing' ? s.spin : ''}`} viewBox="0 0 20 20" aria-hidden>
        {status === 'waiting' && <circle className={s.ring} cx="10" cy="10" r="7" />}
        {(status === 'importing' || status === 'removing') && <path className={s.arc} d="M10 3 a7 7 0 1 1 -7 7" />}
        {(status === 'imported' || status === 'removed') && <path className={s.tick} d="M5 10.5 l3.2 3.2 L15 7" />}
        {status === 'failed' && <path className={s.cross} d="M6 6 L14 14 M14 6 L6 14" />}
      </svg>
      <span className={showText ? undefined : s.srOnly}>{STATUS_TEXT[status]}</span>
    </span>
  );
}

/** Below 600px the table is a list. */
export function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const q = window.matchMedia('(max-width: 599px)');
    const update = () => setNarrow(q.matches);
    update();
    q.addEventListener('change', update);
    return () => q.removeEventListener('change', update);
  }, []);
  return narrow;
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const q = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(q.matches);
    update();
    q.addEventListener('change', update);
    return () => q.removeEventListener('change', update);
  }, []);
  return reduced;
}

/** Past 200 rows, only the rows in view (and a margin) are drawn; the rest are spacers of the same height. */
export const VIRTUAL_FROM = 200;

export function useRowWindow(count: number, rowHeight: number, ref: RefObject<HTMLElement | null>, headerHeight = 0): { start: number; end: number; virtual: boolean } {
  const virtual = count > VIRTUAL_FROM;
  const [range, setRange] = useState({ start: 0, end: Math.min(count, 80) });
  useEffect(() => {
    const el = ref.current;
    if (!virtual || !el) return;
    const update = () => {
      const top = Math.max(0, el.scrollTop - headerHeight);
      const start = Math.max(0, Math.floor(top / rowHeight) - 15);
      const end = Math.min(count, start + Math.ceil(el.clientHeight / rowHeight) + 30);
      setRange((r) => (r.start === start && r.end === end ? r : { start, end }));
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [virtual, count, rowHeight, headerHeight, ref]);
  return virtual ? { ...range, end: Math.min(range.end, count), virtual } : { start: 0, end: count, virtual };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;
export { plural };

/** "A, B and C" */
export function listWords(parts: string[]): string {
  const p = parts.filter(Boolean);
  return p.length > 1 ? `${p.slice(0, -1).join(', ')} and ${p[p.length - 1]}` : (p[0] ?? '');
}
