'use client';

// Baskets on a phone, minimal: the same month dropdown as the Budget
// section on one row with two filters (the money type, and All / Fixed /
// Variable), a summary card laid out like the Budget card (in its own
// gradient) and the grouped basket list, both for the chosen money type:
// income and expenses are never totalled together. The grouped basket
// list the Budget tab shows (Income, Expenses, Savings, Transfers). The
// "..." menu has Archived baskets, Import and Print. What must be paid
// first lives in Priorities.

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Archive, Check, ChevronDown, MoreHorizontal, Printer, Upload } from 'lucide-react';
import { FLOW_LABEL, FLOW_TYPES, type FlowType } from '@/src/shared/budget/flow';
import { useLogic } from '@/src/logic/buckets/useLogic';
import { basketList, basketsSummary, filterBaskets, type BasketKindFilter } from '@/src/logic/planning/basketList';
import { useSwipeModeSwitch } from '@/src/shared/hooks/useSwipeModeSwitch';
import { ScreenHeader } from '@/src/widgets/ScreenHeader/ScreenHeader';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { ActionMenu } from '@/src/widgets/ActionMenu/ActionMenu';
import { BasketGroups, MoneyCard, MonthPicker } from '@/src/phone/screens/Planning/MinimalParts';
import { monthTitle } from '@/src/viewmodels/planning';
import p from '@/src/phone/screens/Planning/Planning.module.css';
import m from '@/src/phone/screens/Planning/Minimal.module.css';

// Kept here for the screens that already import it from this file.
export { formatAmount } from '@/src/viewmodels/format';

/** How each money type's card reads. */
const FLOW_WORDS: Record<FlowType, { title: string; done: string; left: string }> = {
  Expense: { title: 'Planned expenses', done: 'Used', left: 'Left' },
  Income: { title: 'Expected income', done: 'Received', left: 'To come' },
  Savings: { title: 'Planned savings', done: 'Saved', left: 'To save' },
  Transfer: { title: 'Planned moves', done: 'Moved', left: 'To move' },
};

const FILTERS: { value: BasketKindFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'fixed', label: 'Fixed' },
  { value: 'variable', label: 'Variable' },
];

export function BucketsScreen() {
  const v = useLogic();
  const router = useRouter();
  const swipeRef = useSwipeModeSwitch('money');
  const [filter, setFilter] = useState<BasketKindFilter>('all');
  const all = useMemo(() => basketList(v.budget, v.buckets, v.today, true), [v.budget, v.buckets, v.today]);
  const groups = useMemo(() => filterBaskets(all, filter), [all, filter]);
  // The card totals one money type at a time: income and expenses are never added together.
  const [flow, setFlow] = useState<FlowType>('Expense');
  // The list follows the same choice, so what's listed is what's totalled.
  const shown = groups.filter((g) => g.type === flow);
  const sum = basketsSummary(shown);
  const words = FLOW_WORDS[flow];
  const kindWord = filter === 'all' ? '' : `${filter} `;
  return (
    <div className={p.page} ref={swipeRef}>
      <ScreenHeader
        left={
          <Link href="/home" className={p.roundButton} aria-label="Back to Home">
            <ArrowLeft size={20} strokeWidth={2} />
          </Link>
        }
        title="Baskets"
        right={
          <ActionMenu
            ariaLabel="More"
            triggerClassName={p.roundButton}
            triggerIcon={<MoreHorizontal size={18} strokeWidth={2} />}
            items={[
              { key: 'archived', label: 'Archived baskets', icon: <Archive size={14} strokeWidth={2} />, onSelect: () => router.push('/settings/archived-baskets') },
              { key: 'import', label: 'Import', icon: <Upload size={14} strokeWidth={2} />, onSelect: () => router.push('/settings/import?mode=restore') },
              { key: 'print', label: 'Print', icon: <Printer size={14} strokeWidth={2} />, onSelect: () => window.print() },
            ]}
          />
        }
      />
      {/* One row: the month on the left; the money type and All / Fixed / Variable on the right. */}
      <div className={m.headerRow}>
        <MonthPicker month={v.month} onMonth={v.setMonth} />
        <div className={m.filters}>
          <FilterMenu
            label="Money type"
            value={flow}
            options={FLOW_TYPES.map((type) => ({ value: type, label: FLOW_LABEL[type] }))}
            onChange={setFlow}
          />
          <FilterMenu label="Which baskets" value={filter} options={FILTERS} onChange={setFilter} />
        </div>
      </div>
      <ScreenState loading={v.loading} />
      {!v.loading && (
        <>
          <MoneyCard
            tone="teal"
            amount={sum.planned}
            label={`${words.title} in ${kindWord}baskets · ${monthTitle(v.month).split(' ')[0]}`}
            fill={sum.planned > 0 ? sum.used / sum.planned : 0}
            fillLabel={words.done.toLowerCase()}
            problem={flow !== 'Income' && sum.left < -0.5}
            figures={[
              { label: words.done, value: sum.used },
              flow !== 'Income' && sum.left < -0.5 ? { label: 'Over', value: -sum.left, problem: true } : { label: words.left, value: Math.max(0, sum.left) },
              { label: sum.count === 1 ? 'Basket' : 'Baskets', value: sum.count },
            ]}
          />
          {shown.length === 0 && (
            <div className={`${m.bleed} ${m.section}`}>
              <p className={m.empty}>
                No {kindWord}
                {FLOW_LABEL[flow].toLowerCase()} baskets.
              </p>
            </div>
          )}
          <BasketGroups groups={shown} month={v.month} newHref={`/baskets/new?type=${flow}`} />
        </>
      )}
    </div>
  );
}

/** A compact filter: its current choice with a chevron, opening a menu of choices. */
function FilterMenu<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (next: T) => void }) {
  return (
    <ActionMenu
      ariaLabel={label}
      triggerClassName={m.filterButton}
      triggerIcon={
        <>
          {options.find((o) => o.value === value)?.label ?? label}
          <ChevronDown size={14} strokeWidth={2.5} aria-hidden />
        </>
      }
      items={options.map((o) => ({
        key: o.value,
        label: o.label,
        icon: o.value === value ? <Check size={14} strokeWidth={2.5} /> : <span style={{ width: 14 }} />,
        onSelect: () => onChange(o.value),
      }))}
    />
  );
}
