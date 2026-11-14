'use client';

// A form opened at its own address (/add-transaction, /edit-transaction/x):
// on tablet and web it belongs in the right-hand panel over its page, not on
// a page of its own, so this moves there (the same URL a link inside the app
// would build). Phones render the form as the full screen it already is.

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { formPeekHref, type FormKind } from './formPeek';

export function PeekOnWide({ kind, over, params = {}, children }: { kind: FormKind; over: string; params?: Record<string, string>; children: ReactNode }) {
  const router = useRouter();
  const [wide] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches);
  useEffect(() => {
    if (!wide) return;
    // Query params on the page (?type=income) travel with the form.
    const all: Record<string, string> = { ...params };
    new URLSearchParams(window.location.search).forEach((value, key) => {
      all[key] = value;
    });
    router.replace(formPeekHref(over, '', kind, all), { scroll: false });
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return wide ? null : <>{children}</>;
}
