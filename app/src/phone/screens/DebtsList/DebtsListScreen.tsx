'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Plus, Trash2 } from 'lucide-react';
import { useLogic } from '@/src/logic/debtsList/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { TrendChart } from '@/src/widgets/TrendChart/TrendChart';
import { ConfirmDialog } from '@/src/widgets/ConfirmDialog/ConfirmDialog';
import { ActionMenu } from '@/src/widgets/ActionMenu/ActionMenu';
import { ScreenHeader } from '@/src/widgets/ScreenHeader/ScreenHeader';
import { formatAmount } from '@/src/phone/screens/Buckets/BucketsScreen';
import styles from '@/src/phone/screens/DebtsList/DebtsListScreen.module.css';
import { useGoBack } from '@/src/shared/navigation/useGoBack';

const VIEW_KEY = 'dreda.debts.view';
type DebtRow = ReturnType<typeof useLogic>['debts'][number];

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || '?';

/** One debt, the same content in both views: who, direction, due date, what is left and how much is repaid. */
function DebtItem({ debt, view, currency, onOpen, onArchive }: { debt: DebtRow; view: 'list' | 'cards'; currency: string; onOpen: () => void; onArchive: () => void }) {
  const who = debt.lender || debt.name;
  const due = debt.settled
    ? debt.status === 'forgiven'
      ? 'Forgiven'
      : 'Cancelled'
    : debt.nextPaymentDate
      ? `${debt.overdue ? 'Overdue since' : 'Due'} ${debt.nextPaymentDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
      : 'No due date';
  return (
    <div
      role="button"
      tabIndex={0}
      className={view === 'list' ? styles.row : styles.card}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <div className={styles.rowTop}>
        <span className={styles.avatar} aria-hidden>
          {initials(who)}
        </span>
        <span className={styles.rowText}>
          <span className={styles.rowName}>
            {who}
            <span className={styles.tag} data-direction={debt.direction}>
              {debt.direction === 'owed' ? 'Owes you' : 'You owe'}
            </span>
          </span>
          <span className={styles.rowDue} data-overdue={debt.overdue || undefined}>
            {debt.lender && debt.lender !== debt.name ? `${debt.name} · ` : ''}
            {due}
          </span>
        </span>
        <span className={styles.rowAmount}>
          {formatAmount(debt.balance)}
          <span> {currency}</span>
        </span>
        <span onClick={(event) => event.stopPropagation()}>
          <ActionMenu
            title={debt.name}
            ariaLabel={`Actions for ${debt.name}`}
            items={[{ key: 'archive', label: 'Archive', icon: <Trash2 size={16} strokeWidth={1.75} />, onSelect: onArchive, danger: true }]}
          />
        </span>
      </div>
      <div className={styles.thinTrack} role="progressbar" aria-label={`${debt.percent}% repaid`} aria-valuenow={debt.percent} aria-valuemin={0} aria-valuemax={100}>
        <div className={styles.thinFill} style={{ width: `${debt.percent}%` }} />
      </div>
      {view === 'cards' && (
        <div className={styles.amountRow}>
          <span className={styles.amountMuted}>
            {formatAmount(debt.repaid)} of {formatAmount(debt.principal)} repaid
          </span>
          <span className={styles.amountMuted}>{debt.percent}%</span>
        </div>
      )}
    </div>
  );
}

export function DebtsListScreen() {
  const router = useRouter();
  const navigateBack = useGoBack();
  const strings = useStrings();
  const { currency, debts, debtSummary, totalDebtTrend, archiveDebt, loading, error } = useLogic();

  const [confirmDebtId, setConfirmDebtId] = useState<string | null>(null);
  // Cards or List, remembered on this device; List by default (owner, 23 Nov 2026).
  const [view, setViewState] = useState<'list' | 'cards'>('list');
  useEffect(() => {
    try {
      // Read after mount, so the server render and the first client render agree.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (window.localStorage.getItem(VIEW_KEY) === 'cards') setViewState('cards');
    } catch {
      // No storage: List.
    }
  }, []);
  function setView(next: 'list' | 'cards') {
    setViewState(next);
    try {
      window.localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Private mode: the choice lasts for this visit.
    }
  }
  const [filter, setFilter] = useState<'open' | 'settled'>('open');
  const settledCount = debts.filter((d) => d.settled).length;
  const shown = debts.filter((d) => (filter === 'settled' ? d.settled : !d.settled));
  const groups = (
    [
      { key: 'owe', label: 'You owe', rows: shown.filter((d) => d.direction !== 'owed') },
      { key: 'owed', label: 'Owed to you', rows: shown.filter((d) => d.direction === 'owed') },
    ] as const
  ).filter((g) => g.rows.length > 0);

  return (
    <div className={styles.page}>
      <ScreenHeader
        left={
          <button type="button" className={styles.backButton} onClick={() => navigateBack('/home')} aria-label="Back">
            <ChevronLeft size={18} strokeWidth={2} />
          </button>
        }
        title={strings.buckets.tabDebt}
      />

      <ScreenState loading={loading} error={error} />

      {!loading && !error && (
        <>
          <section className={styles.oweCard} aria-label="Summary">
            <div>
              <span className={styles.oweLabel}>You owe · {debtSummary.oweCount}</span>
              <strong className={styles.oweValue}>
                {formatAmount(debtSummary.owe)} <span>{currency}</span>
              </strong>
            </div>
            <div>
              <span className={styles.oweLabel}>Owed to you · {debtSummary.owedCount}</span>
              <strong className={styles.oweValue}>
                {formatAmount(debtSummary.owed)} <span>{currency}</span>
              </strong>
            </div>
          </section>

          <div className={styles.toolbar}>
            <div className={styles.seg} role="tablist" aria-label="Which debts">
              {(['open', 'settled'] as const).map((f) => (
                <button key={f} type="button" role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}>
                  {f === 'open' ? 'Open' : `Settled${settledCount ? ` · ${settledCount}` : ''}`}
                </button>
              ))}
            </div>
            <div className={styles.seg} role="group" aria-label="View">
              {(['list', 'cards'] as const).map((m) => (
                <button key={m} type="button" aria-pressed={view === m} onClick={() => setView(m)}>
                  {m === 'list' ? 'List' : 'Cards'}
                </button>
              ))}
            </div>
            <button type="button" className={styles.addIcon} onClick={() => router.push('/debts/new')} aria-label={strings.buckets.addDebt}>
              <Plus size={18} strokeWidth={2.25} />
            </button>
          </div>

          {shown.length === 0 ? (
            <p className={styles.emptyText}>{filter === 'settled' ? 'No forgiven or cancelled debts.' : strings.buckets.emptyDebt}</p>
          ) : (
            groups.map((g) => (
              <section key={g.key} className={styles.group} aria-label={g.label}>
                <h2 className={styles.groupHead}>
                  {g.label} <span>{g.rows.length}</span>
                </h2>
                <div className={view === 'list' ? styles.rows : styles.list}>
                  {g.rows.map((debt) => (
                    <DebtItem key={debt.id} debt={debt} view={view} currency={currency} onOpen={() => router.push(`/debts/${debt.id}`)} onArchive={() => setConfirmDebtId(debt.id)} />
                  ))}
                </div>
              </section>
            ))
          )}

          {totalDebtTrend.length > 0 && filter === 'open' && (
            <div className={styles.chartCard}>
              <p className={styles.chartTitle}>{strings.buckets.totalDebtTrendTitle}</p>
              <TrendChart points={totalDebtTrend.map((point) => ({ label: point.label, value: point.total }))} color="var(--color-danger)" />
            </div>
          )}
        </>
      )}

      {confirmDebtId && (
        <ConfirmDialog
          title={strings.buckets.archiveDebtConfirmTitle}
          message={strings.buckets.archiveDebtConfirmMessage}
          confirmLabel={strings.buckets.archiveAction}
          cancelLabel={strings.common.cancel}
          onConfirm={() => {
            archiveDebt(confirmDebtId);
            setConfirmDebtId(null);
          }}
          onCancel={() => setConfirmDebtId(null)}
        />
      )}
    </div>
  );
}
