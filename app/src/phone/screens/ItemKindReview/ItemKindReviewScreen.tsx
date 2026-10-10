'use client';

// "Check your items" on a phone: each basket's items with the kind they
// were given (Payment, Allowance, Set aside) and a one-tap change.

import { ArrowLeft } from 'lucide-react';
import { useLogic } from '@/src/logic/itemKindReview/useLogic';
import type { ItemKind } from '@/src/shared/budget/itemKinds';
import { ScreenHeader } from '@/src/widgets/ScreenHeader/ScreenHeader';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import p from '@/src/phone/screens/Planning/Planning.module.css';
import m from '@/src/phone/screens/Planning/Minimal.module.css';

export function ItemKindReviewScreen() {
  const v = useLogic();
  return (
    <div className={`${p.page} ${p.detail}`}>
      <ScreenHeader
        left={
          <button type="button" className={p.roundButton} onClick={v.goBack} aria-label="Back">
            <ArrowLeft size={20} strokeWidth={2} />
          </button>
        }
        title="Check your items"
      />
      <ScreenState loading={v.loading} />
      {!v.loading && <p className={m.subtitle}>Each item now has a kind. Change any that look wrong.</p>}
      {!v.loading && v.count === 0 && <p className={m.oneLine}>Nothing to check.</p>}
      {v.error && <p className={m.error}>{v.error}</p>}
      <div className={m.bleed}>
        {v.byBasket.map((group) => (
          <section key={group.bucketId} className={m.section} aria-label={group.bucketName}>
            <div className={m.sectionHead}>
              <span className={m.label}>{group.bucketName}</span>
            </div>
            <div className={m.list}>
              {group.entries.map((entry) => (
                <label key={entry.itemId} className={m.row}>
                  <span className={m.main}>
                    <span className={m.name}>{entry.name}</span>
                    <span className={m.line}>{entry.why}</span>
                  </span>
                  <select
                    className={m.action}
                    value={v.kindOf(entry.bucketId, entry.itemId, entry.kind)}
                    onChange={(e) => void v.choose(entry.bucketId, entry.itemId, e.target.value as ItemKind)}
                    aria-label={`Kind of ${entry.name}`}
                  >
                    {v.kindOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </section>
        ))}
      </div>
      {!v.loading && (
        <div className={m.bottomAction}>
          <button type="button" className={m.primary} disabled={v.busy} onClick={() => void v.done()}>
            {v.busy ? 'Saving…' : 'Done'}
          </button>
        </div>
      )}
    </div>
  );
}
