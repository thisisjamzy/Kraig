'use client';

// A save button's states: idle → saving (locked, "Saving…") → saved
// (a short "Saved" before the form closes or resets) → idle. The lock is a
// ref, set before React re-renders, so a double click or Enter plus a click
// in the same frame starts one request, never two.

import { useCallback, useEffect, useRef, useState } from 'react';

export type SubmitPhase = 'idle' | 'saving' | 'saved';

const SAVED_MS = 1500;

export function useSubmitState() {
  const locked = useRef(false);
  const mounted = useRef(true);
  const [phase, setPhase] = useState<SubmitPhase>('idle');

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async (submit: () => unknown) => {
    if (locked.current) return;
    locked.current = true;
    setPhase('saving');
    try {
      await submit();
      if (!mounted.current) return;
      setPhase('saved');
      window.setTimeout(() => {
        locked.current = false;
        if (mounted.current) setPhase('idle');
      }, SAVED_MS);
    } catch (error) {
      locked.current = false;
      if (mounted.current) setPhase('idle');
      throw error;
    }
  }, []);

  /** Back to idle at once (the save reported an error: let the user retry). */
  const reset = useCallback(() => {
    locked.current = false;
    setPhase('idle');
  }, []);

  return { phase, run, reset };
}
