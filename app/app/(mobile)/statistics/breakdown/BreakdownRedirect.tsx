'use client';

import { useEffect } from 'react';

/** Client side, because the server never sees the #hash. */
export function BreakdownRedirect() {
  useEffect(() => {
    window.location.replace(`/statistics${window.location.hash}`);
  }, []);
  return null;
}
