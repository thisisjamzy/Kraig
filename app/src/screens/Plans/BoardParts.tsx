'use client';

// The month board's columns, the backlog, and the plan's dialogs: the
// friction popover (a drop that takes a month below the cushion or zero),
// splitting into payments, "This month only" or "This and future months",
// and "Want to buy".

import { useMemo, useState, type ReactNode } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { AlertTriangle, Check, ChevronDown, ChevronRight, CircleAlert, CircleCheck } from 'lucide-react';
import type { PlanLine } from '@/src/viewmodels/plans/planDraft';
import type { EngineMonth } from '@/src/viewmodels/plans/engine';
import { monthWord, shiftMonth } from '@/src/viewmodels/plans/allocate';
import type { DropEffect } from '@/src/viewmodels/plans/allocate';
import { Modal } from '@/src/widgets/Modal/Modal';
import { Tag } from '@/src/widgets/TaskDb/Tag';
import { formatMoney } from '@/src/widgets/Money/Money';
import styles from './PlanBoard.module.css';

const short = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

export function StateIcon({ state }: { state: 'below' | 'close' | 'comfortable' }) {
  if (state === 'below') return <CircleAlert size={14} strokeWidth={2.25} className={styles.stateIcon} data-state={state} aria-label="Below the cushion" />;
  if (state === 'close') return <AlertTriangle size={14} strokeWidth={2.25} className={styles.stateIcon} data-state={state} aria-label="Close to the cushion" />;
  return <CircleCheck size={14} strokeWidth={2.25} className={styles.stateIcon} data-state={state} aria-label="Comfortable" />;
}

export interface ColumnData {
  month: string;
  engine: EngineMonth;
  open: PlanLine[];
  paid: PlanLine[];
  must: number;
  nice: number;
  income: { key: string; name: string; amount: number; date: Date; received: boolean }[];
  state: 'below' | 'close' | 'comfortable';
}

export function MonthColumn({
  col,
  isCurrent,
  blocked,
  renderCard,
  innerRef,
}: {
  col: ColumnData;
  isCurrent: boolean;
  /** Why the dragged card can't come here, or null. */
  blocked: string | null;
  renderCard: (line: PlanLine) => ReactNode;
  innerRef?: (el: HTMLElement | null) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `month:${col.month}`, data: { month: col.month } });
  const [paidOpen, setPaidOpen] = useState(false);
  const e = col.engine;
  const scheduled = e.fixed + e.flexible + e.savings + e.fees;
  return (
    <section
      ref={(el) => {
        setNodeRef(el);
        innerRef?.(el);
      }}
      className={styles.column}
      data-over={isOver || undefined}
      data-blocked={isOver && blocked ? true : undefined}
      aria-label={monthWord(col.month)}
    >
      <header className={styles.columnHead}>
        <h3>{monthWord(col.month)}</h3>
        <div className={styles.columnChips}>
          <Tag color="red">Must have {formatMoney(col.must)}</Tag>
          <Tag color="gray">Nice to have {formatMoney(col.nice)}</Tag>
        </div>
        <ul className={styles.incomeRows}>
          {col.income.map((i) => (
            <li key={i.key}>
              <span>{i.name}</span>
              <span className={styles.muted}>{short(i.date)}</span>
              <strong>{formatMoney(i.amount)}</strong>
              {i.received && <Check size={13} strokeWidth={2.5} aria-label="Received" className={styles.received} />}
            </li>
          ))}
        </ul>
      </header>
      {isOver && blocked && <p className={styles.blocked}>{blocked}</p>}
      <div className={styles.cards}>
        {col.open.map(renderCard)}
        {!col.open.length && <p className={styles.empty}>Nothing planned.</p>}
        {isCurrent && col.paid.length > 0 && (
          <div className={styles.paidGroup}>
            <button type="button" className={styles.textButton} onClick={() => setPaidOpen((o) => !o)} aria-expanded={paidOpen}>
              {paidOpen ? <ChevronDown size={13} aria-hidden /> : <ChevronRight size={13} aria-hidden />} Paid ({col.paid.length})
            </button>
            {paidOpen && col.paid.map(renderCard)}
          </div>
        )}
      </div>
      <footer className={styles.columnFoot}>
        <p>
          {formatMoney(e.income)} {'−'} {formatMoney(scheduled)} = <strong data-tone={e.free < 0 ? 'bad' : undefined}>{formatMoney(e.free)} free</strong>
        </p>
        <p className={styles.footLowest} data-state={col.state}>
          <StateIcon state={col.state} /> Lowest balance this month: {formatMoney(e.lowest)} on {short(e.lowestDate)}
        </p>
        <p className={styles.muted}>Daily for flexible spending: {formatMoney(e.dailyFlexible)}</p>
      </footer>
    </section>
  );
}

export type BacklogSort = 'priority' | 'amount' | 'neededBy' | 'oldest';

export function BacklogPanel({
  lines,
  renderCard,
  onWantToBuy,
  collapsed,
  onCollapse,
}: {
  lines: PlanLine[];
  renderCard: (line: PlanLine) => ReactNode;
  onWantToBuy: () => void;
  collapsed: boolean;
  onCollapse: (collapsed: boolean) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: 'backlog', data: { month: null } });
  const [sort, setSort] = useState<BacklogSort>('priority');
  const [need, setNeed] = useState<'all' | 'must' | 'nice'>('all');
  const [search, setSearch] = useState('');
  const total = lines.reduce((s, l) => s + l.amount, 0);
  const shown = useMemo(() => {
    const rank = { must: 0, nice: 1 } as const;
    const prank = { High: 0, Medium: 1, Low: 2 } as const;
    const q = search.trim().toLowerCase();
    return lines
      .filter((l) => (need === 'all' || l.need === need) && (!q || l.name.toLowerCase().includes(q)))
      .sort((a, b) =>
        sort === 'amount'
          ? b.amount - a.amount
          : sort === 'neededBy'
            ? (a.neededBy ?? '9999').localeCompare(b.neededBy ?? '9999')
            : sort === 'oldest'
              ? (a.waitingSince?.getTime() ?? Infinity) - (b.waitingSince?.getTime() ?? Infinity)
              : rank[a.need] - rank[b.need] || prank[a.priority] - prank[b.priority]
      );
  }, [lines, sort, need, search]);

  if (collapsed) {
    return (
      <button ref={setNodeRef} type="button" className={styles.backlogStrip} data-over={isOver || undefined} onClick={() => onCollapse(false)}>
        Backlog ({lines.length})
      </button>
    );
  }
  return (
    <section ref={setNodeRef} className={styles.backlog} data-over={isOver || undefined} aria-label="Backlog">
      <header className={styles.backlogHead}>
        <h2>
          Backlog <span className={styles.muted}>{lines.length} · {formatMoney(total)}</span>
        </h2>
        <button type="button" className={styles.textButton} onClick={() => onCollapse(true)} aria-label="Collapse the backlog">
          Collapse
        </button>
      </header>
      <div className={styles.backlogTools}>
        <input type="search" placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search the backlog" />
        <select value={sort} onChange={(e) => setSort(e.target.value as BacklogSort)} aria-label="Sort">
          <option value="priority">Priority</option>
          <option value="amount">Amount</option>
          <option value="neededBy">Needed by</option>
          <option value="oldest">Oldest</option>
        </select>
        <select value={need} onChange={(e) => setNeed(e.target.value as 'all' | 'must' | 'nice')} aria-label="Filter">
          <option value="all">All</option>
          <option value="must">Must have</option>
          <option value="nice">Nice to have</option>
        </select>
      </div>
      <button type="button" className={styles.addWant} onClick={onWantToBuy}>
        + Want to buy
      </button>
      <div className={styles.cards}>
        {shown.map(renderCard)}
        {!shown.length && <p className={styles.empty}>{lines.length ? 'Nothing matches.' : 'Nothing waiting. Drag a card here to take it out of a month.'}</p>}
      </div>
    </section>
  );
}

/** A drop that takes a month below the cushion or zero. */
export function FrictionDialog({
  effect,
  splitPreview,
  bestMonth,
  onPlace,
  onSplit,
  onBest,
  onCancel,
}: {
  effect: DropEffect;
  splitPreview: { parts: { month: string; amount: number }[]; lowestAfter: number } | null;
  bestMonth: string;
  onPlace: () => void;
  onSplit: () => void;
  onBest: () => void;
  onCancel: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <Modal title={effect.belowZero ? 'Below zero' : 'Below your cushion'} onClose={onCancel}>
      <div className={styles.dialog}>
        <p>{effect.message}</p>
        {confirming ? (
          <>
            <p className={styles.warnText}>Your balance would go below zero on {short(effect.date)}. Place it anyway?</p>
            <div className={styles.dialogButtons}>
              <button type="button" className={styles.primary} onClick={onPlace}>
                Yes, place it
              </button>
              <button type="button" className={styles.secondary} onClick={onCancel}>
                Cancel
              </button>
            </div>
          </>
        ) : (
          <div className={styles.dialogChoices}>
            <button type="button" className={styles.secondary} onClick={() => (effect.belowZero ? setConfirming(true) : onPlace())}>
              Place anyway
            </button>
            {splitPreview && (
              <button type="button" className={styles.secondary} onClick={onSplit}>
                Split into 3 payments
                <span className={styles.choiceHint}>
                  {splitPreview.parts.map((p) => `${formatMoney(p.amount)} in ${monthWord(p.month)}`).join(', ')}. Lowest balance {formatMoney(splitPreview.lowestAfter)}.
                </span>
              </button>
            )}
            <button type="button" className={styles.secondary} onClick={onBest}>
              Find the best month
              <span className={styles.choiceHint}>{monthWord(bestMonth)} keeps the most cushion.</span>
            </button>
            <button type="button" className={styles.textButton} onClick={onCancel}>
              Cancel
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

export function SplitDialog({
  line,
  months,
  preview,
  onSplit,
  onClose,
}: {
  line: PlanLine;
  months: string[];
  preview: (count: number, start: string) => { parts: { month: string; amount: number }[]; lowestAfter: number } | null;
  onSplit: (count: number, start: string) => void;
  onClose: () => void;
}) {
  const [count, setCount] = useState(3);
  const [start, setStart] = useState(line.month ?? months[0]);
  const p = preview(count, start);
  return (
    <Modal title={`Split ${line.name}`} onClose={onClose}>
      <div className={styles.dialog}>
        <div className={styles.dialogFields}>
          <label>
            Payments
            <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
              {Array.from({ length: 11 }, (_, i) => i + 2).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label>
            Starting
            <select value={start} onChange={(e) => setStart(e.target.value)}>
              {months.map((m) => (
                <option key={m} value={m}>
                  {monthWord(m)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {p && (
          <>
            <ul className={styles.splitList}>
              {p.parts.map((part, i) => (
                <li key={part.month}>
                  <span>
                    {line.name}, {i + 1} of {p.parts.length}
                  </span>
                  <span>{monthWord(part.month)}</span>
                  <strong>{formatMoney(part.amount)}</strong>
                </li>
              ))}
            </ul>
            <p className={styles.muted}>Lowest balance over the plan: {formatMoney(p.lowestAfter)}.</p>
            {p.parts[p.parts.length - 1].month > months[months.length - 1] && <p className={styles.warnText}>The last payments fall after the plan&apos;s horizon.</p>}
          </>
        )}
        <div className={styles.dialogButtons}>
          <button type="button" className={styles.primary} onClick={() => onSplit(count, start)}>
            Split into {count} payments
          </button>
          <button type="button" className={styles.secondary} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function ScopeDialog({ line, toMonth, onChoose, onClose }: { line: PlanLine; toMonth: string; onChoose: (scope: 'month' | 'future') => void; onClose: () => void }) {
  return (
    <Modal title={`Move ${line.name} to ${monthWord(toMonth)}`} onClose={onClose}>
      <div className={styles.dialogChoices}>
        <button type="button" className={styles.secondary} onClick={() => onChoose('month')}>
          This month only
          <span className={styles.choiceHint}>{line.month ? monthWord(line.month) : 'This month'} skips it; the others stay as they are.</span>
        </button>
        <button type="button" className={styles.secondary} onClick={() => onChoose('future')}>
          This and future months
          <span className={styles.choiceHint}>The line moves from here on.</span>
        </button>
        <button type="button" className={styles.textButton} onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}

export function WantToBuyDialog({
  months,
  onSave,
  onClose,
}: {
  months: string[];
  onSave: (input: { name: string; amount: number; need: 'must' | 'nice'; neededBy: string | null; splittable: boolean }) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [need, setNeed] = useState<'must' | 'nice'>('nice');
  const [neededBy, setNeededBy] = useState('');
  const [splittable, setSplittable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = name.trim() !== '' && Number(amount) > 0;
  const later = [...months, ...Array.from({ length: 12 }, (_, i) => shiftMonth(months[months.length - 1], i + 1))];
  return (
    <Modal title="Want to buy" onClose={onClose}>
      <form
        className={styles.dialog}
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid || busy) return;
          setBusy(true);
          try {
            await onSave({ name: name.trim(), amount: Number(amount), need, neededBy: neededBy || null, splittable });
            onClose();
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Could not add it.');
            setBusy(false);
          }
        }}
      >
        <div className={styles.dialogFields}>
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Couch" autoFocus />
          </label>
          <label>
            Amount
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} placeholder="0" />
          </label>
          <label>
            Need
            <select value={need} onChange={(e) => setNeed(e.target.value as 'must' | 'nice')}>
              <option value="nice">Nice to have</option>
              <option value="must">Must have</option>
            </select>
          </label>
          <label>
            Needed by
            <select value={neededBy} onChange={(e) => setNeededBy(e.target.value)}>
              <option value="">No date</option>
              {later.map((m) => (
                <option key={m} value={m}>
                  {monthWord(m)} {m.slice(0, 4)}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.checkLabel}>
            <input type="checkbox" checked={splittable} onChange={(e) => setSplittable(e.target.checked)} />
            Can be paid in parts
          </label>
        </div>
        {error && <p className={styles.warnText}>{error}</p>}
        <div className={styles.dialogButtons}>
          <button type="submit" className={styles.primary} disabled={!valid || busy}>
            {busy ? 'Adding…' : 'Add to backlog'}
          </button>
          <button type="button" className={styles.secondary} onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}
