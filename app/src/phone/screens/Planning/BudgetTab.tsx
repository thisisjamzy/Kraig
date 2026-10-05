'use client';

// Planning > Budget on a phone — "am I on track this month?": the month's
// notices (setup, income prompts, Ready to pay), the black summary card
// (income with its borrowed part, expenses, savings, transfers: actual /
// planned; left to plan; available now), then the buckets of ONE flow type
// at a time under four type tabs, each card with the one prompt it needs.
// Wide screens get the Budget page instead (src/screens/BudgetMonth).

import Link from 'next/link';
import { Check, Layers, Plus } from 'lucide-react';
import { useBudgetTab } from '@/src/logic/planning/useBudgetTab';
import { useBudgetMonth } from '@/src/logic/budgetMonth/useLogic';
import { FLOW_LABEL, FLOW_TYPES } from '@/src/shared/budget/flow';
import { BUDGET_TYPES, NotificationsLink } from '@/src/widgets/Notifications/NotificationsLink';
import type { PlanningData } from '@/src/logic/planning/useLogic';
import { ActionMenu } from '@/src/widgets/ActionMenu/ActionMenu';
import { money, signedMoney } from '@/src/viewmodels/planning';
import { BucketCardView } from '@/src/phone/screens/Planning/BucketCardView';
import styles from '@/src/phone/screens/Planning/Planning.module.css';
import tab from '@/src/phone/screens/Planning/PlanningTabs.module.css';

function SummaryRow({
  label,
  actual,
  planned,
  over,
  chip,
  note,
}: {
  label: string;
  actual: number;
  planned: number;
  over?: boolean;
  chip?: { text: string; tone: 'blue' | 'grey' | 'red' } | null;
  note?: string;
}) {
  const fill = planned > 0 ? Math.min(1, actual / planned) : actual > 0 ? 1 : 0;
  return (
    <div className={tab.sumRow}>
      <div className={tab.sumTop}>
        <span className={tab.sumLabel}>{label}</span>
        <span className={tab.sumPair}>
          <strong>{money(actual)}</strong>
          <span> / {money(planned)}</span>
        </span>
      </div>
      <div className={tab.sumBar}>
        <div className={tab.sumFill} data-tone={over ? 'over' : undefined} style={{ width: `${fill * 100}%` }} />
      </div>
      {(chip || note) && (
        <div className={tab.sumMeta}>
          {note && <span className={tab.sumNote}>{note}</span>}
          {chip && (
            <span className={tab.sumChip} data-tone={chip.tone}>
              {chip.text}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function BudgetTab({ month, data }: { month: string; data: PlanningData }) {
  const { currency, currencyOptions, setCurrency, summary, flow, setFlow, cardsOf } = useBudgetTab(month, data);
  // Banners and income prompts, shared with the wide Budget page.
  const v = useBudgetMonth(month, data);
  const incomeChip =
    summary.income.actual > 0 && summary.income.variance !== 0
      ? summary.income.variance > 0
        ? { text: signedMoney(summary.income.variance), tone: 'blue' as const }
        : { text: `${money(summary.income.variance)} short`, tone: 'grey' as const }
      : null;
  const expenseChip =
    summary.expenses.actual > 0 && summary.expenses.variance !== 0
      ? summary.expenses.variance > 0
        ? { text: `${signedMoney(summary.expenses.variance)} over`, tone: 'red' as const }
        : { text: `${money(summary.expenses.variance)} under`, tone: 'grey' as const }
      : null;
  const overPlanned = summary.leftToBudget < 0;
  const cards = cardsOf(flow);

  return (
    <>
      {/* The month's state in one sentence; what needs doing is in Notifications. */}
      {v.isCurrent && (
        <p className={styles.neutral}>
          {v.summary}
          {v.migrationPending && (
            <>
              {' '}
              <Link href="/budget/migration">See what changed in your budget</Link>.
            </>
          )}
          <NotificationsLink types={BUDGET_TYPES} about="this month" />
        </p>
      )}

      <p className={styles.label}>Total budget</p>
      <section className={tab.summary} aria-label="This month's budget">
        <div className={tab.summaryHead}>
          <span className={tab.sumLabel}>Actual / planned</span>
          <ActionMenu
            ariaLabel="Change currency"
            triggerClassName={tab.currencyChip}
            triggerIcon={currency}
            items={currencyOptions.map((o) => ({
              key: o.code,
              label: `${o.code} · ${o.name}`,
              icon: o.code === currency ? <Check size={14} strokeWidth={2.5} /> : <span style={{ width: 14 }} />,
              onSelect: () => setCurrency(o.code),
            }))}
          />
        </div>
        <SummaryRow
          label="Income"
          actual={summary.income.actual}
          planned={summary.income.planned}
          chip={incomeChip}
          note={`of which ${money(summary.income.borrowed)} borrowed`}
        />
        <SummaryRow
          label="Expenses"
          actual={summary.expenses.actual}
          planned={summary.expenses.planned}
          over={summary.expenses.actual > summary.expenses.planned}
          chip={expenseChip}
        />
        <SummaryRow
          label="Savings"
          actual={summary.savings.actual}
          planned={summary.savings.planned}
          note={[`Total saved ${money(summary.savings.totalSaved)}`, summary.savings.withdrawn ? `${money(summary.savings.withdrawn)} withdrawn` : null].filter(Boolean).join(' · ')}
        />
        <SummaryRow label="Transfers" actual={summary.transfers.actual} planned={summary.transfers.planned} note="Between your own accounts" />
        <div className={tab.leftRow}>
          <span className={tab.sumLabel}>{overPlanned ? 'Planned beyond income' : 'Left to plan'}</span>
          <span className={tab.leftValue} data-tone={overPlanned ? 'over' : undefined}>
            {money(Math.abs(summary.leftToBudget))}
            <small> {currency}</small>
          </span>
        </div>
        <p className={tab.availableLine}>
          Available now {money(summary.availableNow)} · by month end {money(summary.availableByMonthEnd)} (estimate)
        </p>
        <Link href="/baskets" className={tab.summaryButton}>
          <Layers size={16} strokeWidth={2.25} aria-hidden />
          Plan in baskets
        </Link>
      </section>

      <div className={tab.sectionHead}>
        <h2 className={tab.sectionTitle}>{FLOW_LABEL[flow]}</h2>
        <Link href={`/baskets/new?type=${flow}`} className={tab.addCircle} aria-label={`Add a ${FLOW_LABEL[flow].toLowerCase()} basket`}>
          <Plus size={18} strokeWidth={2.5} />
        </Link>
      </div>
      <div className={tab.typeTabs} role="tablist" aria-label="Money type">
        {FLOW_TYPES.map((type) => (
          <button key={type} type="button" role="tab" aria-selected={flow === type} onClick={() => setFlow(type)}>
            {FLOW_LABEL[type]}
          </button>
        ))}
      </div>

      {cards.length === 0 ? (
        <p className={styles.empty}>No {FLOW_LABEL[flow].toLowerCase()} planned for this month. Add items to a basket to build the budget.</p>
      ) : (
        <div className={tab.cardList} role="tabpanel" aria-label={FLOW_LABEL[flow]}>
          {cards.map((card) => (
            <BucketCardView key={card.id} card={card} currency={currency} month={month} flow={flow} />
          ))}
        </div>
      )}
    </>
  );
}
