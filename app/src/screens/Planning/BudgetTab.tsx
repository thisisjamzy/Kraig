'use client';

// Planning > Budget — "am I on track this month?": the black summary card
// (income, expenses, savings: actual / planned; what's left to budget),
// then the buckets, each with the one prompt it needs (cover or justify an
// overspend, reallocate a leftover), needing-action first.

import Link from 'next/link';
import { Check, Layers, Plus } from 'lucide-react';
import { useBudgetTab } from '@/src/logic/planning/useBudgetTab';
import type { PlanningData } from '@/src/logic/planning/useLogic';
import { ActionMenu } from '@/src/widgets/ActionMenu/ActionMenu';
import { money, signedMoney, type BucketCard } from '@/src/viewmodels/planning';
import { Bar, IconCircle, Pair, PromptStrip } from './PlanningParts';
import styles from './Planning.module.css';
import tab from './PlanningTabs.module.css';

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

function BucketCardView({ card, currency, month }: { card: BucketCard; currency: string; month: string }) {
  const over = card.overflow > 0;
  const plannedMark = over && card.spent > 0 ? (card.planned / card.spent) * 100 : null;
  return (
    <article className={tab.bucketCard}>
      <Link href={`/budget/bucket/${card.id}?month=${month}`} className={tab.bucketBody}>
        <div className={tab.bucketTop}>
          <IconCircle type={card.income ? 'Income' : undefined} />
          <span className={tab.bucketName}>
            <span>{card.name}</span>
            <span className={tab.bucketMeta}>
              {card.itemCount} {card.itemCount === 1 ? 'item' : 'items'}
            </span>
          </span>
          <Pair spent={card.spent} planned={card.planned} />
        </div>
        <div className={tab.bucketBar}>
          <Bar spent={card.spent} planned={card.planned} over={over} />
          {plannedMark !== null && <span className={tab.planMark} style={{ left: `${plannedMark}%` }} aria-hidden />}
        </div>
        {!over && (
          <span className={tab.bucketAvailable}>
            {card.income
              ? card.available > 0
                ? `${money(card.available)} ${currency} still expected`
                : 'All received'
              : `Available ${money(card.available)} ${currency}`}
          </span>
        )}
      </Link>
      {card.prompt && <PromptStrip prompt={card.prompt} currency={currency} month={month} bucketId={card.id} />}
    </article>
  );
}

export function BudgetTab({ month, data }: { month: string; data: PlanningData }) {
  const { currency, currencyOptions, setCurrency, summary, view, setView, cards, categories } = useBudgetTab(month, data);
  const [y, m] = month.split('-').map(Number);
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

  return (
    <>
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
              label: `${o.code} — ${o.name}`,
              icon: o.code === currency ? <Check size={14} strokeWidth={2.5} /> : <span style={{ width: 14 }} />,
              onSelect: () => setCurrency(o.code),
            }))}
          />
        </div>
        <SummaryRow label="Income" actual={summary.income.actual} planned={summary.income.planned} chip={incomeChip} />
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
          note={`Total saved ${money(summary.savings.totalSaved)}`}
        />
        <div className={tab.leftRow}>
          <span className={tab.sumLabel}>{overPlanned ? 'Planned beyond income' : 'Left to budget'}</span>
          <span className={tab.leftValue} data-tone={overPlanned ? 'over' : undefined}>
            {money(Math.abs(summary.leftToBudget))}
            <small> {currency}</small>
          </span>
        </div>
        <Link href="/buckets" className={tab.summaryButton}>
          <Layers size={16} strokeWidth={2.25} aria-hidden />
          Plan in buckets
        </Link>
      </section>

      <div className={tab.sectionHead}>
        <h2 className={tab.sectionTitle}>{view === 'bucket' ? 'Buckets' : 'Categories'}</h2>
        <div className={tab.sectionTools}>
          <div className={tab.miniToggle} role="radiogroup" aria-label="Group by">
            <button type="button" role="radio" aria-checked={view === 'category'} onClick={() => setView('category')}>
              By category
            </button>
            <button type="button" role="radio" aria-checked={view === 'bucket'} onClick={() => setView('bucket')}>
              By bucket
            </button>
          </div>
          <Link href="/buckets/new" className={tab.addCircle} aria-label="Add a bucket">
            <Plus size={18} strokeWidth={2.5} />
          </Link>
        </div>
      </div>

      {view === 'bucket' ? (
        cards.length === 0 ? (
          <p className={styles.empty}>Nothing planned for this month yet. Add items to a bucket to build the budget.</p>
        ) : (
          <div className={tab.cardList}>
            {cards.map((card) => (
              <BucketCardView key={card.id} card={card} currency={currency} month={month} />
            ))}
          </div>
        )
      ) : categories.length === 0 ? (
        <p className={styles.empty}>No spending by category this month yet.</p>
      ) : (
        <div className={tab.cardList}>
          {categories.map((c) => (
            <article key={c.id} className={tab.bucketCard}>
              <Link href={`/budget/category/${encodeURIComponent(c.id)}?month=${m - 1}&year=${y}`} className={tab.bucketBody}>
                <div className={tab.bucketTop}>
                  <IconCircle category />
                  <span className={tab.bucketName}>
                    <span>{c.name}</span>
                    <span className={tab.bucketMeta}>
                      {c.itemCount} {c.itemCount === 1 ? 'item' : 'items'}
                      {c.unplanned !== 0 ? ` · ${money(c.unplanned)} unplanned` : ''}
                    </span>
                  </span>
                  <Pair spent={c.spent} planned={c.planned} />
                </div>
                <div className={tab.bucketBar}>
                  <Bar spent={c.spent} planned={c.planned} over={c.overflow > 0} />
                </div>
                <span className={tab.bucketAvailable} data-tone={c.overflow > 0 ? 'over' : undefined}>
                  {c.overflow > 0 ? `Over by ${money(c.overflow)} ${currency}` : `Available ${money(c.available)} ${currency}`}
                </span>
              </Link>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
