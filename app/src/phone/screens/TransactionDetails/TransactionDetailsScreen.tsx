'use client';

// Transaction details — a full page (not a popup): the amount first, then
// a spec grid (when, what, which wallet, which bucket item and month), the
// note, and "Assign to bucket" for a transaction not tied to one yet.

import Link from 'next/link';
import { ArrowDownLeft, ArrowLeft, ArrowLeftRight, ArrowRight, ArrowUpRight, Pencil } from 'lucide-react';
import { useLogic } from '@/src/logic/transactionDetails/useLogic';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { money, weekdayDayMonth } from '@/src/viewmodels/planning';
import { SpecCell, SpecRow } from '@/src/phone/screens/Planning/PlanningParts';
import { ScreenHeader } from '@/src/widgets/ScreenHeader/ScreenHeader';
import p from '@/src/phone/screens/Planning/Planning.module.css';
import styles from '@/src/phone/screens/TransactionDetails/TransactionDetailsScreen.module.css';

export function TransactionDetailsScreen({ id }: { id: string }) {
  const t = useLogic(id);
  const v = t.view;
  const Icon = v?.flow === 'in' ? ArrowDownLeft : v?.flow === 'out' ? ArrowUpRight : ArrowLeftRight;
  return (
    <div className={`${p.page} ${p.detail} ${styles.page}`}>
      <ScreenHeader
        left={
          <button type="button" className={p.roundButton} onClick={t.goBack} aria-label="Back">
            <ArrowLeft size={20} strokeWidth={2} />
          </button>
        }
        right={
          v && (
            <Link href={v.editHref} className={p.roundButton} aria-label="Edit">
              <Pencil size={17} strokeWidth={2} />
            </Link>
          )
        }
      />

      <ScreenState loading={t.loading} error={t.missing ? 'This transaction could not be found.' : null} />

      {v && (
        <>
          <div className={styles.hero}>
            <span className={p.rowIcon} data-flow={v.flow} aria-hidden>
              <Icon size={20} strokeWidth={2.25} />
            </span>
            <p className={styles.amount} data-flow={v.flow}>
              {v.flow === 'in' ? '+' : v.flow === 'out' ? '-' : ''}
              {money(v.amount)}
              <small> {t.currency}</small>
            </p>
            <h1 className={styles.title}>{v.title}</h1>
          </div>

          <section className={p.spec}>
            <SpecRow>
              <SpecCell label="Date" value={`${weekdayDayMonth(v.date)} ${v.date.getFullYear()}`} />
              <SpecCell label="Time" value={v.timeKnown ? v.date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : 'Not recorded'} />
            </SpecRow>
            <SpecRow>
              <SpecCell label="Type" value={v.type} />
              <SpecCell label={t.isTransfer ? 'Kind' : 'Category'} value={v.category} />
            </SpecRow>
            <SpecRow>
              <SpecCell label={t.isTransfer ? 'From → to' : 'Wallet'} value={v.method} />
            </SpecRow>
            <SpecRow>
              <SpecCell label="Bucket" value={t.linkLabel ?? 'Not in a bucket'} />
              {t.linkMonth && <SpecCell label="Counts toward" value={t.linkMonth} />}
            </SpecRow>
          </section>

          {v.subtype && (
            <section className={p.spec}>
              <SpecRow>
                <SpecCell label="Income" value={v.subtype} />
              </SpecRow>
            </section>
          )}

          {v.note && v.note !== v.title && (
            <>
              <div className={p.sectionHead}>
                <h2>Note</h2>
              </div>
              <p className={styles.note}>{v.note}</p>
            </>
          )}

          {t.link && t.bucketHref && (
            <Link href={t.bucketHref} className={styles.linkCard}>
              Open {t.linkLabel}
              <ArrowRight size={16} strokeWidth={2.25} aria-hidden />
            </Link>
          )}

          {t.canAssign && (
            <>
              <div className={p.sectionHead}>
                <h2>{t.link ? 'Bucket item' : 'Assign to bucket'}</h2>
                {!t.picking && (
                  <button type="button" className={p.textButton} onClick={() => t.setPicking(true)}>
                    {t.link ? 'Change' : 'Choose'}
                  </button>
                )}
              </div>
              {t.picking &&
                (t.options.length === 0 ? (
                  <p className={p.empty}>No bucket item in this category around this month. Add one to a bucket first.</p>
                ) : (
                  <div className={styles.options} role="radiogroup" aria-label="Bucket item">
                    {t.options.map((o) => (
                      <button
                        key={o.key}
                        type="button"
                        role="radio"
                        aria-checked={o.key === t.currentKey}
                        disabled={t.busy}
                        onClick={() => t.assignTo(o.link)}
                      >
                        {o.label}
                      </button>
                    ))}
                    {t.link && (
                      <button type="button" className={styles.unlink} disabled={t.busy} onClick={() => t.assignTo(null)}>
                        Remove from bucket
                      </button>
                    )}
                  </div>
                ))}
              {t.error && <p className={styles.error}>{t.error}</p>}
            </>
          )}
        </>
      )}
    </div>
  );
}
