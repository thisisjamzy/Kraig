'use client';

// Transaction details — a full page (not a popup): the amount first, then
// a spec grid (when, what, which wallet, which bucket item and month), the
// note, and "Assign to bucket" for a transaction not tied to one yet.

import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowDownLeft, ArrowLeft, ArrowLeftRight, ArrowRight, ArrowUpRight, CalendarDays, HandCoins, LayoutGrid, ListChecks, Pencil, Tag, Wallet, type LucideIcon } from 'lucide-react';
import { useLogic } from '@/src/logic/transactionDetails/useLogic';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { money, weekdayDayMonth } from '@/src/viewmodels/planning';
import { timeWords } from '@/src/viewmodels/transactionTime';
import { SpecCell, SpecRow } from '@/src/screens/Planning/PlanningParts';
import { ScreenHeader } from '@/src/widgets/ScreenHeader/ScreenHeader';
import p from '@/src/screens/Planning/Planning.module.css';
import styles from './TransactionDetailsScreen.module.css';
import { useFormLink } from '@/src/shared/navigation/useFormLink';
import { TopBarTitle, useHasTopBar } from '@/src/widgets/AppShell/TopBarSlot';
import { useBreadcrumb, usePageMenu } from '@/src/widgets/AppShell/breadcrumb';
import { Block, Callout } from '@/src/widgets/Database/NotionPage';
import bm from '@/src/screens/BudgetMonth/BudgetMonth.module.css';

export function TransactionDetailsScreen({ id, transfer = false, assign = false }: { id: string; transfer?: boolean; assign?: boolean }) {
  const t = useLogic(id, { transfer, assign });
  const v = t.view;
  const Icon = v?.flow === 'in' ? ArrowDownLeft : v?.flow === 'out' ? ArrowUpRight : ArrowLeftRight;
  // Medium screens and up: a Notion-style page (breadcrumb, title,
  // properties). Phones keep the page below.
  const inShell = useHasTopBar();
  if (inShell) return <TransactionPage t={t} />;

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
              <SpecCell label="Time" value={v.date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} />
            </SpecRow>
            <SpecRow>
              <SpecCell label="Type" value={v.type} />
              <SpecCell label={t.isTransfer ? 'Kind' : 'Category'} value={v.category} />
            </SpecRow>
            <SpecRow>
              <SpecCell label={t.isTransfer ? 'From → to' : 'Wallet'} value={v.method} />
            </SpecRow>
            <SpecRow>
              <SpecCell label="Basket" value={t.linkLabel ?? 'Not in a basket'} />
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

type TxLogic = ReturnType<typeof useLogic>;

/** The transaction as a page; `inPeek` when it's shown in a side peek
 * over the Transactions page (no breadcrumb of its own then). */
export function TransactionPage({ t, inPeek = false }: { t: TxLogic; inPeek?: boolean }) {
  const v = t.view;
  const formLink = useFormLink();
  useBreadcrumb(inPeek ? null : [{ label: 'Money', href: '/home' }, { label: 'Transactions', href: '/transactions' }, { label: v?.title ?? 'Transaction' }]);
  // As a page, Edit lives in the top bar's "..." menu; a peek keeps its button.
  // An excluded transaction changes through its debt, never directly.
  usePageMenu(!inPeek && v && !v.excluded ? [{ label: 'Edit transaction', href: v.editHref }] : undefined);
  if (!v) return <ScreenState loading={t.loading} error={t.missing ? 'This transaction could not be found.' : null} />;
  const Icon = v.flow === 'in' ? ArrowDownLeft : v.flow === 'out' ? ArrowUpRight : ArrowLeftRight;
  const sign = v.flow === 'in' ? '+' : v.flow === 'out' ? '-' : '';
  const when = timeWords(v.date, Intl.DateTimeFormat().resolvedOptions().timeZone).long;
  const rows: { id: string; icon: LucideIcon; label: string; value: ReactNode }[] = [
    { id: 'type', icon: ArrowLeftRight, label: 'Type', value: v.subtype ? `${v.type} · ${v.subtype}` : v.type },
    { id: 'wallet', icon: Wallet, label: t.isTransfer ? 'From and to' : 'Wallet', value: v.method || null },
    { id: 'category', icon: Tag, label: t.isTransfer ? 'Kind' : 'Category', value: v.category || null },
    { id: 'date', icon: CalendarDays, label: 'Date', value: when },
    { id: 'basket', icon: LayoutGrid, label: 'Basket', value: t.link && t.bucketHref ? <Link href={t.bucketHref} className={styles.rowLink}>{t.linkLabel}</Link> : null },
    ...(t.linkMonth ? [{ id: 'month', icon: ListChecks, label: 'Counts toward', value: t.linkMonth }] : []),
    ...(v.debtHref ? [{ id: 'debt', icon: HandCoins, label: 'Debt', value: <Link href={v.debtHref} className={styles.rowLink}>Open the debt</Link> }] : []),
  ];
  return (
    <div className={inPeek ? styles.sheet : `${bm.page} ${styles.sheet}`}>
      {!inPeek && (
        <TopBarTitle>
          <div>
            <h1>{v.title}</h1>
            <p>{when}</p>
          </div>
        </TopBarTitle>
      )}
      <section className={styles.top}>
        <span className={styles.typeChip} data-flow={v.flow}>
          <Icon size={14} strokeWidth={2.25} aria-hidden /> {v.type}
        </span>
        {inPeek && <h2 className={styles.topTitle}>{v.title}</h2>}
        <p className={styles.topAmount} data-flow={v.flow}>
          {sign}
          {money(v.amount)} {t.currency}
        </p>
        {!v.excluded && (
          <div className={styles.topActions}>
            <Link href={v.editHref} className={styles.editButton}>
              Edit transaction
            </Link>
            <Link href={formLink('transaction', t.isTransfer ? { duplicateTransfer: t.id } : { duplicate: t.id })} scroll={false} className={styles.outlineButton}>
              Duplicate
            </Link>
            <Link href={`/transaction-templates/new?${t.isTransfer ? 'fromTransfer' : 'fromTransaction'}=${encodeURIComponent(t.id)}`} scroll={false} className={styles.outlineButton}>
              Save as template
            </Link>
          </div>
        )}
      </section>

      <dl className={styles.rows}>
        {rows.map((r) => {
          const RowIcon = r.icon;
          return (
            <div key={r.id} className={styles.row}>
              <dt>
                <RowIcon size={16} strokeWidth={2} aria-hidden />
                {r.label}
              </dt>
              <dd>{r.value ?? <span className={styles.none}>None</span>}</dd>
            </div>
          );
        })}
      </dl>

      {v.excluded && (
        <Callout tone="watch">
          <p>
            Excluded from your balances and figures{v.excludedReason ? `: ${v.excludedReason}` : ''}. It stays here for the record and changes through{' '}
            {v.debtHref ? (
              <Link href={v.debtHref} className={bm.relation}>
                its debt
              </Link>
            ) : (
              'its debt'
            )}
            .
          </p>
        </Callout>
      )}

      {t.canAssign && (
        <Block
          title={t.link ? 'Basket item' : 'Assign to basket'}
          actions={
            !t.picking ? (
              <button type="button" className={bm.inlineAction} onClick={() => t.setPicking(true)}>
                {t.link ? 'Change' : 'Choose'}
              </button>
            ) : null
          }
        >
          {t.picking &&
            (t.options.length === 0 ? (
              <p className={p.empty}>No basket item in this category around this month. Add one to a basket first.</p>
            ) : (
              <div className={styles.options} role="radiogroup" aria-label="Basket item">
                {t.options.map((o) => (
                  <button key={o.key} type="button" role="radio" aria-checked={o.key === t.currentKey} disabled={t.busy} onClick={() => t.assignTo(o.link)}>
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
        </Block>
      )}

      <Block title="Note">
        {v.note ? <p className={styles.note}>{v.note}</p> : <p className={p.empty}>No note.</p>}
      </Block>
    </div>
  );
}


/** A transaction in a side peek. */
export function TransactionPeekContent({ id, transfer }: { id: string; transfer: boolean }) {
  const t = useLogic(id, { transfer });
  return <TransactionPage t={t} inPeek />;
}
