'use client';

// Ready to pay — the whole queue of payments the app prepared, on its own
// page (the side nav's "Ready to pay (4)" on wide screens; Home and the
// Budget page show the same card at their top).

import { Clock } from 'lucide-react';
import { ResponsivePage } from '@/src/phone/widgets/Layout/ResponsivePage';
import { ReadyToPayCard } from '@/src/widgets/ReadyToPay/ReadyToPayCard';

export function ReadyToPayScreen() {
  return (
    <ResponsivePage
      title="Ready to pay"
      kind="Payments prepared when their income arrived or their date came"
      icon={<Clock size={24} strokeWidth={2} />}
      crumbs={[{ label: 'Money', href: '/home' }, { label: 'Budget', href: '/budget' }, { label: 'Ready to pay' }]}
      back="/budget"
    >
      <ReadyToPayCard page />
    </ResponsivePage>
  );
}
