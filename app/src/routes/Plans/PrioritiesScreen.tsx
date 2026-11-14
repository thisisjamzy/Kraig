'use client';

// Two UI lines for this screen (docs/UI-LINES.md): the phone version under
// 768px, the web version from 768px up, loaded only on wide screens.

// Priorities lives on Payments on every screen size (its one Calendar view
// shows the payments calendar and the priorities): this address moves
// there, keeping ?month=.

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

function ToPayments() {
  const router = useRouter();
  useEffect(() => {
    router.replace(`/payments${window.location.search}`);
  }, [router]);
  return null;
}

export function PrioritiesScreen() {
  return <ToPayments />;
}
