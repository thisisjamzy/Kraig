'use client';

// The month in four blocks, one per flow type: the actual figure, "of"
// what was planned, a thin bar and one line for what's left — then "Left
// to plan · Available now · Estimated by month end". Four across on
// expanded and large screens, 2 by 2 on medium screens and phones (never
// scrolling sideways). Clicking a block opens that type's tab.

import type { FlowType } from '@/src/shared/budget/flow';
import type { MonthTotals } from '@/src/shared/budget/monthTotals';
import styles from '@/src/phone/screens/BudgetMonth/BudgetMonth.module.css';

const money = (n: number) => Math.round(n).toLocaleString('en-US');

function Card({
  type,
  title,
  actual,
  of,
  sub,
  fill,
  over,
  chip,
  onOpen,
  active,
}: {
  type: FlowType;
  title: string;
  actual: number;
  of: string;
  sub: string;
  fill: number;
  over?: boolean;
  chip?: { text: string; tone: 'bad' | 'watch' | 'good' } | null;
  onOpen: (type: FlowType) => void;
  active: boolean;
}) {
  return (
    <button type="button" className={styles.sumCard} data-type={type} aria-pressed={active} onClick={() => onOpen(type)}>
      <span className={styles.sumHead}>
        <span className={styles.sumTitle}>{title}</span>
        {chip && (
          <span className={styles.chip} data-tone={chip.tone}>
            {chip.text}
          </span>
        )}
      </span>
      <span className={styles.sumHeadline}>
        {money(actual)} <span className={styles.sumOf}>{of}</span>
      </span>
      <span className={styles.sumBar}>
        <span style={{ width: `${Math.max(0, Math.min(1, fill)) * 100}%` }} data-over={over || undefined} />
      </span>
      <span className={styles.sumSub}>{sub}</span>
    </button>
  );
}

export function SummaryCards({
  totals,
  currency,
  active,
  onOpen,
  totalSaved,
}: {
  totals: MonthTotals;
  currency: string;
  active: FlowType;
  onOpen: (type: FlowType) => void;
  /** Savings held overall (savings account balances), when known. */
  totalSaved: number | null;
}) {
  const { income, expenses, savings, transfers } = totals;
  const ratio = (a: number, b: number) => (b > 0 ? a / b : a > 0 ? 1 : 0);
  const overdue = (n: number) => (n ? { text: `${n} overdue`, tone: 'bad' as const } : null);
  return (
    <>
      <div className={styles.sumRow}>
        <Card
          type="Income"
          title="Income"
          actual={income.received}
          of={`of ${money(income.expected)} received`}
          sub={`of which ${money(income.borrowed)} borrowed`}
          fill={ratio(income.received, income.expected)}
          chip={income.late ? { text: `${income.late} late`, tone: 'bad' } : null}
          onOpen={onOpen}
          active={active === 'Income'}
        />
        <Card
          type="Expense"
          title="Expenses"
          actual={expenses.spent}
          of={`of ${money(expenses.planned)} spent`}
          sub={expenses.left >= 0 ? `${money(expenses.left)} left` : `${money(-expenses.left)} over plan`}
          fill={ratio(expenses.spent, expenses.planned)}
          over={expenses.left < 0}
          chip={expenses.overPlan ? { text: `${expenses.overPlan} over plan`, tone: 'bad' } : overdue(expenses.overdue)}
          onOpen={onOpen}
          active={active === 'Expense'}
        />
        <Card
          type="Savings"
          title="Savings"
          actual={savings.saved}
          of={`of ${money(savings.planned)} saved`}
          sub={[totalSaved !== null ? `${money(totalSaved)} total saved` : null, savings.withdrawn ? `${money(savings.withdrawn)} withdrawn` : null].filter(Boolean).join(' · ') || `${money(savings.left)} still to save`}
          fill={ratio(savings.saved, savings.planned)}
          chip={overdue(savings.overdue)}
          onOpen={onOpen}
          active={active === 'Savings'}
        />
        <Card
          type="Transfer"
          title="Transfers"
          actual={transfers.moved}
          of={`of ${money(transfers.planned)} moved`}
          sub={transfers.overdue ? `${transfers.overdue} overdue` : `${money(transfers.left)} still to move`}
          fill={ratio(transfers.moved, transfers.planned)}
          chip={overdue(transfers.overdue)}
          onOpen={onOpen}
          active={active === 'Transfer'}
        />
      </div>
      <p className={styles.sumLine}>
        <span>
          Left to plan <strong data-tone={totals.leftToPlan < 0 ? 'bad' : undefined}>{money(totals.leftToPlan)} {currency}</strong>
        </span>
        <span aria-hidden>·</span>
        <span>
          Available now <strong>{money(totals.availableNow)} {currency}</strong>
        </span>
        <span aria-hidden>·</span>
        <span>
          Estimated by month end <strong>{money(totals.availableByMonthEnd)} {currency}</strong>
        </span>
      </p>
    </>
  );
}
