'use client';

// Buckets — one month's money plan at a glance. A navy card with the
// month picker and the figures that matter, planned vs actual as a row of
// cards scrolling across, whether the must-haves are covered, what's coming in, then
// every bucket in its section. Trends live on the Analytics tab.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Archive, ChevronDown, ChevronLeft, ChevronRight, MoreHorizontal, Pencil, TrendingUp } from 'lucide-react';
import { useLogic, SECTIONS, type BucketsLogic } from '@/src/logic/buckets/useLogic';
import { useSwipeModeSwitch } from '@/src/shared/hooks/useSwipeModeSwitch';
import { ScreenHeader } from '@/src/widgets/ScreenHeader/ScreenHeader';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { ActionMenu } from '@/src/widgets/ActionMenu/ActionMenu';
import { BucketCardView } from '@/src/screens/Planning/BucketCardView';
import { SECTION_LABEL } from '@/src/viewmodels/plans/overview';
import planning from '@/src/screens/Planning/Planning.module.css';
import { Card, Chip, Figure, full } from '@/src/screens/Plans/parts';
import styles from '@/src/screens/Plans/Plans.module.css';

// Kept here for the screens that already import it from this file.
export { formatAmount } from '@/src/viewmodels/format';

export function BucketsScreen() {
  const v = useLogic();
  const router = useRouter();
  const swipeRef = useSwipeModeSwitch('money');

  return (
    <div className={styles.page} ref={swipeRef}>
      <ScreenHeader
        left={
          <Link href="/home" className={styles.roundButton} aria-label="Back to Home">
            <ArrowLeft size={20} strokeWidth={2} />
          </Link>
        }
        title="Buckets"
        right={
          <ActionMenu
            ariaLabel="More"
            triggerClassName={styles.roundButton}
            triggerIcon={<MoreHorizontal size={18} strokeWidth={2} />}
            items={[
              { key: 'archived', label: 'Archived buckets', icon: <Archive size={14} strokeWidth={2} />, onSelect: () => router.push('/settings/archived-buckets') },
              { key: 'plan', label: 'Edit plan', icon: <Pencil size={14} strokeWidth={2} />, onSelect: () => router.push(`/budget?month=${v.month}`) },
              { key: 'forecast', label: 'Plans forecast', icon: <TrendingUp size={14} strokeWidth={2} />, onSelect: () => router.push('/buckets/forecast') },
            ]}
          />
        }
      />
      <ScreenState loading={v.loading} />
      {!v.loading && (
        <>
          <MoneyPlanCard v={v} />
          <PlanCards v={v} />
          <MustCard v={v} />
          <IncomeCard v={v} />
          {SECTIONS.map((section) => {
              const list = v.cards.filter((c) => c.summary.section === section);
              if (!list.length) return null;
              const planned = list.reduce((s, c) => s + c.summary.planned, 0);
              const spent = list.reduce((s, c) => s + c.summary.spent, 0);
              const open = !v.collapsed.includes(section);
              return (
                <section key={section} className={styles.section} aria-label={SECTION_LABEL[section]}>
                  <button type="button" id={`section-${section}`} className={styles.sectionHead} aria-expanded={open} onClick={() => v.toggleSection(section)}>
                    <span className={styles.sectionTop}>
                      <span>
                        {SECTION_LABEL[section]} · {list.length}
                      </span>
                      <small>
                        {full(spent)} / {full(planned)} {v.currency}
                        <ChevronDown size={14} strokeWidth={2.25} style={{ transform: open ? undefined : 'rotate(-90deg)', verticalAlign: 'middle', marginLeft: 4 }} aria-hidden />
                      </small>
                    </span>
                    <span className={styles.thinBar}>
                      <span style={{ width: `${Math.min(100, planned ? (spent / planned) * 100 : 0)}%` }} data-tone={spent > planned + 0.5 && section !== 'income' ? 'bad' : undefined} />
                    </span>
                  </button>
                  {open && (
                    <div className={planning.tokens} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {list.map(({ card, summary }) => (
                        <BucketCardView
                          key={card.id}
                          card={card}
                          currency={v.currency}
                          month={v.month}
                          extras={{
                            line: summary.line,
                            topNeed: summary.topNeed,
                            overdue: summary.overdue.length
                              ? { count: summary.overdue.length, amount: summary.overdue.reduce((s, o) => s + Math.max(0, o.planned - o.paid), 0), href: '/buckets/items' }
                              : undefined,
                          }}
                        />
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
        </>
      )}
    </div>
  );
}

function MonthPicker({ v }: { v: BucketsLogic }) {
  return (
    <div className={styles.monthPill}>
      <button type="button" onClick={v.previousMonth} aria-label="Previous month">
        <ChevronLeft size={18} strokeWidth={2.25} />
      </button>
      <span aria-live="polite">{v.monthText}</span>
      <button type="button" onClick={v.nextMonth} aria-label="Next month">
        <ChevronRight size={18} strokeWidth={2.25} />
      </button>
    </div>
  );
}

/**
 * The month at a glance: what's expected in against what's planned out,
 * then one bar from 0 to the expected income, filled to what's planned,
 * with the share planned and what's left to plan (or over) above it.
 * The split by kind is the row of cards below.
 */
function MoneyPlanCard({ v }: { v: BucketsLogic }) {
  const plan = v.plan;
  const pct = plan.expectedIn > 0 ? Math.round((plan.plannedOut / plan.expectedIn) * 100) : plan.plannedOut > 0 ? 100 : 0;
  const over = plan.overplanned;
  return (
    <Card navy title="Money plan" chip={<MonthPicker v={v} />}>
      <div className={styles.planFigures}>
        <Figure label="Expected in" value={plan.expectedIn} currency={v.currency} />
        <Figure label="Planned out" value={plan.plannedOut} currency={v.currency} />
      </div>
      <div className={styles.planMeter}>
        <p className={styles.planMeterTop}>
          <span>{pct}% of income planned</span>
          <strong data-tone={over || undefined}>
            {full(Math.abs(plan.unallocated))} {over ? 'over' : 'left'}
          </strong>
        </p>
        <span className={styles.planBar} role="img" aria-label={`${pct}% of expected income planned`}>
          <span style={{ width: `${Math.min(100, pct)}%` }} data-tone={over ? 'bad' : undefined} />
        </span>
        <p className={styles.planMeterEnds} aria-hidden>
          <span>0</span>
          <span>{full(plan.expectedIn)} expected</span>
        </p>
      </div>
    </Card>
  );
}

/**
 * Planned vs actual: one small card per kind, side by side, scrolling
 * across — what's gone (or come) in against the plan, and one line for
 * what's left. A chip only when something's wrong. Tap for the buckets.
 * What's left to plan is on the Money plan card.
 */
function PlanCards({ v }: { v: BucketsLogic }) {
  return (
    <section aria-label="Planned vs actual">
      <h2 className={styles.railTitle}>Planned vs actual</h2>
      <div className={styles.rail}>
        {v.table
          .filter((r) => r.key !== 'unallocated')
          .map((r) => {
            const income = r.key === 'income';
            const over = !income && r.left < -0.5;
            const pct = r.planned > 0 ? Math.min(100, (r.soFar / r.planned) * 100) : 0;
            return (
              <a key={r.key} href={`#section-${r.key}`} className={styles.kindCard}>
                <span className={styles.kindHead}>
                  <span>{r.label}</span>
                  {over && <Chip tone="bad">Over</Chip>}
                </span>
                <strong className={styles.kindValue}>
                  {full(r.soFar)}
                  <small>of {full(r.planned)} planned</small>
                </strong>
                <span className={styles.thinBar}>
                  <span style={{ width: `${pct}%` }} data-tone={over ? 'bad' : undefined} />
                </span>
                <span className={styles.kindFoot} data-tone={over || undefined}>
                  {over ? `${full(-r.left)} over` : `${full(r.left)} ${income ? 'to come' : 'left'}`}
                </span>
              </a>
            );
          })}
      </div>
    </section>
  );
}

function MustCard({ v }: { v: BucketsLogic }) {
  const c = v.cover;
  const chip = c.status === 'short' ? <Chip tone="bad">Short</Chip> : c.status === 'tight' ? <Chip tone="watch">Tight</Chip> : <Chip tone="good">Covered</Chip>;
  return (
    <Card title="Must-haves" chip={chip} action={{ label: 'Open priorities', href: '/buckets/items' }}>
      <div className={styles.figureGrid} data-cols="3">
        <Figure label="Available" value={c.available} />
        <Figure label="Still due" value={c.mustDue} />
        <Figure label={c.spare >= 0 ? 'Spare' : 'Short'} value={Math.abs(c.spare)} tone={c.spare < 0 ? 'bad' : undefined} />
      </div>
      {c.status === 'short' && (
        <div className={styles.strip} role="alert">
          <span>{full(-c.spare, v.currency)} short</span>
          <Link href="/buckets/items">Reallocate →</Link>
        </div>
      )}
    </Card>
  );
}

function IncomeCard({ v }: { v: BucketsLogic }) {
  const expected = v.income.reduce((s, i) => s + i.amount, 0);
  const received = v.income.reduce((s, i) => s + Math.min(i.received, i.amount), 0);
  return (
    <Card title="Coming in" chip={v.income.length ? <span className={styles.headFigure}>{full(received)} / {full(expected)}</span> : undefined}>
      {v.income.length ? (
        <ul className={styles.incomeList}>
          {v.income.map((i) => (
            <li key={i.key}>
              <span>
                <strong>{i.name}</strong>
                <span className={styles.muted}>{i.due ? i.due.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'No date'}</span>
              </span>
              <strong>{full(i.amount)}</strong>
              <Chip tone={i.status === 'received' ? 'good' : i.status === 'late' ? 'bad' : 'neutral'}>
                {i.status === 'received' ? 'Received' : i.status === 'late' ? 'Late' : 'Expected'}
              </Chip>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.muted}>No income planned.</p>
      )}
    </Card>
  );
}
