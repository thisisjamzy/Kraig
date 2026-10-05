'use client';

// Transaction details — a full page (not a popup): the amount first, then
// a spec grid (when, what, which wallet, which bucket item and month), the
// note, and "Assign to bucket" for a transaction not tied to one yet.

import Link from 'next/link';
import { ArrowDownLeft, ArrowLeft, ArrowLeftRight, ArrowRight, ArrowUpRight, Pencil } from 'lucide-react';
import { useLogic } from '@/src/logic/transactionDetails/useLogic';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { money, weekdayDayMonth } from '@/src/viewmodels/planning';
import { SpecCell, SpecRow } from '@/src/screens/Planning/PlanningParts';
import { ScreenHeader } from '@/src/widgets/ScreenHeader/ScreenHeader';
import p from '@/src/screens/Planning/Planning.module.css';
import styles from './TransactionDetailsScreen.module.css';
import { useHasTopBar } from '@/src/widgets/AppShell/TopBarSlot';
import { useBreadcrumb, usePageMenu } from '@/src/widgets/AppShell/breadcrumb';
import { Block, Callout, NotionPageHeader } from '@/src/widgets/Database/NotionPage';
import { PropertiesBlock } from '@/src/widgets/Database/PropertiesBlock';
import bm from '@/src/screens/BudgetMonth/BudgetMonth.module.css';

export function TransactionDetailsScreen({ id }: { id: string }) {
  const t = useLogic(id);
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
  useBreadcrumb(inPeek ? null : [{ label: 'Money', href: '/home' }, { label: 'Transactions', href: '/transactions' }, { label: v?.title ?? 'Transaction' }]);
  // As a page, Edit lives in the top bar's "..." menu; a peek keeps its button.
  // An excluded transaction changes through its debt, never directly.
  usePageMenu(!inPeek && v && !v.excluded ? [{ label: 'Edit transaction', href: v.editHref }] : undefined);
  if (!v) return <ScreenState loading={t.loading} error={t.missing ? 'This transaction could not be found.' : null} />;
  const Icon = v.flow === 'in' ? ArrowDownLeft : v.flow === 'out' ? ArrowUpRight : ArrowLeftRight;
  const sign = v.flow === 'in' ? '+' : v.flow === 'out' ? '-' : '';
  return (
    <div className={inPeek ? undefined : bm.page}>
      <NotionPageHeader
        icon={<Icon size={24} strokeWidth={2} />}
        title={v.title}
        kind={`${v.type} · ${sign}${money(v.amount)} ${t.currency}`}
        actions={
          inPeek && !v.excluded ? (
            <Link href={v.editHref} className={bm.ghostButton}>
              <Pencil size={14} strokeWidth={2.25} aria-hidden /> Edit
            </Link>
          ) : undefined
        }
      >
        <PropertiesBlock
          properties={[
            { id: 'amount', label: 'Amount', display: `${sign}${money(v.amount)} ${t.currency}` },
            { id: 'date', label: 'Date', display: `${weekdayDayMonth(v.date)} ${v.date.getFullYear()}` },
            { id: 'time', label: 'Time', display: v.timeKnown ? v.date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : null },
            { id: 'type', label: 'Type', display: v.type },
            ...(v.subtype ? [{ id: 'subtype', label: 'Income subtype', display: v.subtype }] : []),
            { id: 'category', label: t.isTransfer ? 'Kind' : 'Category', display: v.category === '' ? null : v.category },
            { id: 'account', label: t.isTransfer ? 'From and to' : 'Account', display: v.method },
            {
              id: 'bucket',
              label: 'Basket',
              display: t.link && t.bucketHref ? <Link href={t.bucketHref} className={bm.relation}>{t.linkLabel}</Link> : null,
            },
            ...(t.linkMonth ? [{ id: 'month', label: 'Counts toward', display: t.linkMonth }] : []),
            ...(v.debtHref ? [{ id: 'debt', label: 'Debt', display: <Link href={v.debtHref} className={bm.relation}>Open the debt</Link> }] : []),
          ]}
        />
      </NotionPageHeader>

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
