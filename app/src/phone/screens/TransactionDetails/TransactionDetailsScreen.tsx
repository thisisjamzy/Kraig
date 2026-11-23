'use client';

// Transaction details — a full page (not a popup): the amount first, then
// a spec grid (when, what, which wallet, which bucket item and month), the
// note, and "Assign to bucket" for a transaction not tied to one yet.

import { timeWords } from '@/src/viewmodels/transactionTime';
import Link from 'next/link';
import { ArrowDownLeft, ArrowLeft, ArrowLeftRight, ArrowRight, ArrowUpRight, LayoutGrid, ListChecks, Pencil, Tag, Wallet } from 'lucide-react';
import { useLogic } from '@/src/logic/transactionDetails/useLogic';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { money } from '@/src/viewmodels/planning';
import { SpecCell, SpecRow } from '@/src/phone/screens/Planning/PlanningParts';
import { ScreenHeader } from '@/src/widgets/ScreenHeader/ScreenHeader';
import p from '@/src/phone/screens/Planning/Planning.module.css';
import styles from '@/src/phone/screens/TransactionDetails/TransactionDetailsScreen.module.css';
import { useFormLink } from '@/src/shared/navigation/useFormLink';

export function TransactionDetailsScreen({ id, transfer = false, assign = false }: { id: string; transfer?: boolean; assign?: boolean }) {
  const t = useLogic(id, { transfer, assign });
  const formLink = useFormLink();
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
          <div className={styles.topCard}>
            <span className={styles.typeChip} data-flow={v.flow}>
              <Icon size={14} strokeWidth={2.25} aria-hidden /> {v.type}
            </span>
            <h1 className={styles.topTitle}>{v.title}</h1>
            <p className={styles.amount} data-flow={v.flow}>
              {v.flow === 'in' ? '+' : v.flow === 'out' ? '-' : ''}
              {money(v.amount)} {t.currency}
            </p>
            <p className={styles.when}>
              {timeWords(v.date, Intl.DateTimeFormat().resolvedOptions().timeZone).long}
            </p>
          </div>

          <ul className={styles.rowsCard}>
            {[
              { id: 'wallet', icon: Wallet, label: t.isTransfer ? 'From and to' : 'Wallet', value: v.method },
              { id: 'category', icon: Tag, label: t.isTransfer ? 'Kind' : 'Category', value: v.category },
              { id: 'basket', icon: LayoutGrid, label: 'Basket', value: t.linkLabel ?? 'Not in a basket' },
              ...(t.linkMonth ? [{ id: 'month', icon: ListChecks, label: 'Counts toward', value: t.linkMonth }] : []),
            ].map((r) => {
              const RowIcon = r.icon;
              return (
                <li key={r.id} className={styles.infoRow}>
                  <span className={styles.infoIcon} aria-hidden>
                    <RowIcon size={20} strokeWidth={2} />
                  </span>
                  <span className={styles.infoText}>
                    <span>{r.label}</span>
                    <strong>{r.value || 'None'}</strong>
                  </span>
                </li>
              );
            })}
          </ul>

          {!v.excluded && (
            <div className={styles.actionsRow}>
              <Link href={v.editHref} className={styles.editPill}>
                Edit
              </Link>
              <Link href={formLink('transaction', t.isTransfer ? { duplicateTransfer: t.id } : { duplicate: t.id })} className={styles.outlinePill}>
                Duplicate
              </Link>
              <Link href={`/transaction-templates/new?${t.isTransfer ? 'fromTransfer' : 'fromTransaction'}=${encodeURIComponent(t.id)}`} className={styles.outlinePill}>
                Save as template
              </Link>
            </div>
          )}

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
                <h2>{t.link ? 'Basket item' : 'Assign to basket'}</h2>
                {!t.picking && (
                  <button type="button" className={p.textButton} onClick={() => t.setPicking(true)}>
                    {t.link ? 'Change' : 'Choose'}
                  </button>
                )}
              </div>
              {t.picking &&
                (t.options.length === 0 ? (
                  <p className={p.empty}>No basket item in this category around this month. Add one to a basket first.</p>
                ) : (
                  <div className={styles.options} role="radiogroup" aria-label="Basket item">
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
                        Remove from basket
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
