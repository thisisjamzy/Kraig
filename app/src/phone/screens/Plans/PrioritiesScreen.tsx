'use client';

// Priorities on a phone: "What should I pay next?", minimal
// (src/phone/screens/Planning/Minimal.module.css), top to bottom:
//   - one card like the Budget card: what's still to pay, how much of it
//     the money covers, then Available, Spare (or Gap, in red) and Must
//     haves; its chip switches between money now and by month end;
//   - one row of controls: This month / All open, and the order as a menu;
//   - the filter bar;
//   - the items grouped by when they're due (Overdue in red), as a
//     full-width list: name, one grey line ("House · Due 30 Oct · Must
//     have"), the amount with "Covered" or "Fits in Nov" under it, and a
//     line where the money runs out. Swipe right to mark paid, left to
//     postpone; tap to open; "..." for the rest.
// How the order works is behind the info icon.

import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, ChevronDown, GripVertical, Info, MoreHorizontal } from 'lucide-react';
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useLogic, usePriorityWalk } from '@/src/logic/priorities/useLogic';
import { ScreenHeader } from '@/src/widgets/ScreenHeader/ScreenHeader';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { ActionMenu } from '@/src/widgets/ActionMenu/ActionMenu';
import { Modal } from '@/src/widgets/Modal/Modal';
import { ListQueryBar } from '@/src/widgets/ListQuery/ListQueryBar';
import { URGENCY_LABEL, dueText, monthLabel, remaining, statusOf, urgency, type Occurrence } from '@/src/viewmodels/plans/model';
import { type SortMode, type WalkRow } from '@/src/viewmodels/plans/priorities';
import { full, monthShort } from '@/src/phone/screens/Plans/parts';
import { MoneyCard, NeedsYouRow, Sheet } from '@/src/phone/screens/Planning/MinimalParts';
import planning from '@/src/phone/screens/Planning/Planning.module.css';
import m from '@/src/phone/screens/Planning/Minimal.module.css';
import styles from '@/src/phone/screens/Plans/Plans.module.css';

const SORTS: { value: SortMode; label: string }[] = [
  { value: 'recommended', label: 'Recommended' },
  { value: 'deadline', label: 'Deadline' },
  { value: 'priority', label: 'Priority' },
  { value: 'smallest', label: 'Smallest first' },
  { value: 'mine', label: 'My order' },
];

type PhonePriorities = ReturnType<typeof useLogic> & ReturnType<typeof usePriorityWalk>;

const REASONS = ['No money', 'Not urgent', 'Waiting on someone', 'Price changed'];

export function PrioritiesScreen() {
  const base = useLogic();
  const v = { ...base, ...usePriorityWalk(base) };
  const router = useRouter();
  const [howOpen, setHowOpen] = useState(false);
  const w = v.walk;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const must = w.rows.filter((r) => r.item.need === 'must').reduce((s, r) => s + r.remaining, 0);
  const coveredAmount = w.rows.filter((r) => r.covered).reduce((s, r) => s + r.remaining, 0);
  const sortLabel = SORTS.find((s) => s.value === v.mode)?.label ?? 'Recommended';

  const rowOf = (row: WalkRow, index: number) => (
    <PriorityRow key={row.item.key} row={row} index={index} v={v} draggable={v.mode === 'mine'} onOpen={() => router.push(itemHref(row.item))} />
  );
  // Rows in display order, with the line where the money runs out.
  function renderRows(rows: WalkRow[], offset: number) {
    const out: ReactNode[] = [];
    rows.forEach((row, i) => {
      const index = offset + i;
      if (index === w.divider) {
        out.push(
          <div key="divider" className={m.runsOut} role="separator">
            Money runs out here · {full(Math.max(0, w.spare))} left
          </div>
        );
      }
      out.push(rowOf(row, index));
    });
    return out;
  }

  let offset = 0;
  const groups: { label: string; rows: WalkRow[]; start: number; overdue: boolean }[] = [];
  if (v.mode !== 'mine') {
    for (const row of w.rows) {
      const u = urgency(row.item, v.today);
      const last = groups[groups.length - 1];
      if (last && last.label === URGENCY_LABEL[u]) last.rows.push(row);
      else groups.push({ label: URGENCY_LABEL[u], rows: [row], start: offset, overdue: u === 'overdue' });
      offset++;
    }
  }

  return (
    <div className={planning.page}>
      <ScreenHeader
        left={
          <Link href="/baskets" className={planning.roundButton} aria-label="Back to Baskets">
            <ArrowLeft size={20} strokeWidth={2} />
          </Link>
        }
        title="Priorities"
        right={
          <button type="button" className={planning.roundButton} aria-label="How is this ordered?" onClick={() => setHowOpen(true)}>
            <Info size={18} strokeWidth={2} />
          </button>
        }
      />
      {howOpen && (
        <Sheet title="How this is ordered" onClose={() => setHowOpen(false)}>
          <p className={m.sheetText}>Grouped by when it&apos;s due. Recommended puts overdue first, then must haves, higher priority, a penalty if late, and smaller amounts.</p>
          <p className={m.sheetText}>The line shows where your money runs out, going down the list.</p>
        </Sheet>
      )}

      <ScreenState loading={v.loading} />

      {!v.loading && (
        <>
          <MoneyCard
            amount={w.due}
            label={v.view === 'month' ? 'Still to pay this month' : 'Still to pay, all open'}
            chip={{ label: v.includeExpected ? 'By month end' : 'Money now', onClick: () => v.setIncludeExpected(!v.includeExpected) }}
            fill={w.due > 0 ? coveredAmount / w.due : 1}
            fillLabel="covered"
            problem={w.gap < 0}
            figures={[
              { label: 'Available', value: w.available },
              w.gap < 0 ? { label: 'Gap', value: -w.gap, problem: true } : { label: 'Spare', value: w.spare },
              { label: 'Must haves', value: must },
            ]}
          />

          <div className={m.controlsRow}>
            <div className={m.segment} role="group" aria-label="Which items">
              {(
                [
                  { value: 'month', label: 'This month' },
                  { value: 'open', label: 'All open' },
                ] as const
              ).map((o) => (
                <button key={o.value} type="button" aria-pressed={v.view === o.value} onClick={() => v.setView(o.value)}>
                  {o.label}
                </button>
              ))}
            </div>
            <ActionMenu
              ariaLabel="Order"
              triggerClassName={m.menuButton}
              triggerIcon={
                <>
                  {sortLabel}
                  <ChevronDown size={14} strokeWidth={2.5} aria-hidden />
                </>
              }
              items={SORTS.map((s) => ({
                key: s.value,
                label: s.label,
                icon: s.value === v.mode ? <Check size={14} strokeWidth={2.5} /> : <span style={{ width: 14 }} />,
                onSelect: () => v.setMode(s.value),
              }))}
            />
          </div>

          <ListQueryBar
            fields={v.fields}
            query={v.list.query}
            setQuery={v.list.setQuery}
            onClear={v.list.clear}
            count={w.rows.length}
            noun={['item', 'items']}
            hideSort
            className={styles.staticBar}
          />

          {w.mustShort > 0 && (
            <NeedsYouRow
              text={`${w.mustShort} must ${w.mustShort === 1 ? 'have' : 'haves'} not covered`}
              amount={w.mustShortAmount}
              onOpen={() => document.querySelector(`.${m.runsOut}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
            />
          )}

          <div className={m.bleed}>
            {w.rows.length === 0 ? (
              <div className={m.section}>
                <p className={m.empty}>Nothing left to pay.</p>
              </div>
            ) : v.mode === 'mine' ? (
              <DndContext
                sensors={sensors}
                onDragEnd={(e: DragEndEvent) => {
                  if (!e.over || e.active.id === e.over.id) return;
                  v.move(String(e.active.id), w.rows.findIndex((r) => r.item.key === e.over!.id));
                }}
              >
                <SortableContext items={w.rows.map((r) => r.item.key)} strategy={verticalListSortingStrategy}>
                  <section className={m.section}>
                    <div className={m.list}>{renderRows(w.rows, 0)}</div>
                  </section>
                </SortableContext>
              </DndContext>
            ) : (
              groups.map((g) => (
                <section key={g.label} className={m.section} aria-label={g.label}>
                  <div className={m.sectionHead}>
                    <span className={m.label} style={g.overdue ? { color: 'var(--p-red)' } : undefined}>
                      {g.label} · {g.rows.length}
                    </span>
                    <span className={m.groupTotal}>{full(g.rows.reduce((s, r) => s + r.remaining, 0))}</span>
                  </div>
                  <div className={m.list}>{renderRows(g.rows, g.start)}</div>
                </section>
              ))
            )}
          </div>
        </>
      )}

      {v.paying && <PaySheet v={v} item={v.paying} />}
      {v.postponing && <PostponeSheet v={v} item={v.postponing} />}
    </div>
  );
}

function itemHref(o: Occurrence) {
  return `/budget/item/${o.bucketId}/${o.itemId}?month=${o.month}`;
}

/** One item: swipe right to mark paid, left to postpone; tap to open. */
function PriorityRow({ row, index, v, draggable, onOpen }: { row: WalkRow; index: number; v: PhonePriorities; draggable: boolean; onOpen: () => void }) {
  const o = row.item;
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: o.key, disabled: !draggable });
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number; axis: 'x' | 'y' | null } | null>(null);
  const status = statusOf(o);
  const overdue = urgency(o, v.today) === 'overdue';

  function down(e: ReactPointerEvent) {
    if (draggable || (e.pointerType === 'mouse' && e.button !== 0)) return;
    start.current = { x: e.clientX, y: e.clientY, axis: null };
  }
  function moveHandler(e: ReactPointerEvent) {
    const s = start.current;
    if (!s) return;
    const x = e.clientX - s.x;
    const y = e.clientY - s.y;
    if (!s.axis && Math.hypot(x, y) > 6) s.axis = Math.abs(x) > Math.abs(y) ? 'x' : 'y';
    if (s.axis === 'x') setDx(Math.max(-120, Math.min(120, x)));
  }
  function up() {
    const s = start.current;
    start.current = null;
    if (s?.axis === 'x') {
      if (dx > 70) v.setPaying(o);
      else if (dx < -70) v.setPostponing(o);
    }
    setDx(0);
  }

  // One grey line: basket, when, need (and postponed).
  const line = [o.bucketName, dueText(o.due, v.today), o.need === 'must' ? 'Must have' : null, status === 'postponed' ? 'Postponed' : null].filter(Boolean).join(' · ');

  return (
    <div ref={setNodeRef} className={styles.swipe} data-index={index}>
      {dx > 0 && (
        <span className={styles.swipeAction} data-side="left" aria-hidden>
          Paid
        </span>
      )}
      {dx < 0 && (
        <span className={styles.swipeAction} data-side="right" aria-hidden>
          Postpone
        </span>
      )}
      <div
        className={m.rowWrap}
        data-faded={!row.covered || undefined}
        style={{
          background: 'var(--p-card)',
          transform: dx ? `translateX(${dx}px)` : draggable ? CSS.Transform.toString(transform) : undefined,
          transition: dx ? 'none' : transition,
        }}
        onPointerDown={down}
        onPointerMove={moveHandler}
        onPointerUp={up}
        onPointerCancel={up}
      >
        {draggable && (
          <button type="button" className={styles.dragHandle} aria-label={`Drag ${o.name}`} {...attributes} {...listeners}>
            <GripVertical size={16} strokeWidth={2} />
          </button>
        )}
        <button
          type="button"
          className={m.row}
          onClick={() => {
            if (!dx) onOpen();
          }}
        >
          <span className={m.main}>
            <span className={m.name}>{o.name}</span>
            <span className={m.line} data-tone={overdue ? 'problem' : undefined}>
              {line}
            </span>
          </span>
          <span className={m.side}>
            <span className={m.figure}>{full(row.remaining)}</span>
            <span className={m.line} data-tone={row.covered ? 'good' : undefined}>
              {row.covered ? 'Covered' : row.fitsIn ? `Fits in ${monthShort(row.fitsIn, v.today)}` : 'Not yet covered'}
            </span>
          </span>
        </button>
        <ActionMenu
          ariaLabel={`Actions for ${o.name}`}
          triggerClassName={m.rowMenu}
          triggerIcon={<MoreHorizontal size={16} strokeWidth={2} />}
          items={[
            { key: 'paid', label: 'Mark paid', icon: <Check size={14} strokeWidth={2} />, onSelect: () => v.setPaying(o) },
            { key: 'postpone', label: o.recurring ? 'Skip this month' : 'Postpone', icon: <MoreHorizontal size={14} strokeWidth={2} />, onSelect: () => v.setPostponing(o) },
            { key: 'drop', label: o.recurring ? 'Drop this month' : 'Drop it', icon: <MoreHorizontal size={14} strokeWidth={2} />, onSelect: () => v.drop(o), danger: true },
            { key: 'open', label: 'Open item', icon: <MoreHorizontal size={14} strokeWidth={2} />, onSelect: onOpen },
          ]}
        />
      </div>
    </div>
  );
}

function PaySheet({ v, item }: { v: PhonePriorities; item: Occurrence }) {
  const wallets = v.walletsFor(item);
  const [amount, setAmount] = useState(String(Math.round(remaining(item))));
  const [account, setAccount] = useState(wallets[0]?.id ?? '');
  const value = Number(amount);
  return (
    <Modal title={`Mark “${item.name}” paid`} onClose={() => v.setPaying(null)}>
      <div className={styles.form}>
        <label className={styles.field}>
          Amount ({v.currency}) · {full(remaining(item))} left
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} />
        </label>
        <label className={styles.field}>
          Paid from
          <select value={account} onChange={(e) => setAccount(e.target.value)}>
            {wallets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        {value > 0 && value < remaining(item) - 0.5 && <p className={styles.muted}>Partial: the rest stays open.</p>}
        {v.error && <p className={styles.error}>{v.error}</p>}
        <div className={styles.sheetActions}>
          <button type="button" className={styles.ghost} onClick={() => v.setPaying(null)}>
            Cancel
          </button>
          <button type="button" className={styles.primary} disabled={!(value > 0) || !account || v.busy} onClick={() => v.pay(item, value, account)}>
            {v.busy ? 'Saving…' : 'Record payment'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function PostponeSheet({ v, item }: { v: PhonePriorities; item: Occurrence }) {
  const base = item.due ?? v.today;
  const next = new Date(base.getFullYear(), base.getMonth() + 1, base.getDate());
  const [date, setDate] = useState(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`);
  const [reason, setReason] = useState(REASONS[0]);
  return (
    <Modal title={item.recurring ? `Skip “${item.name}” this month?` : `Postpone “${item.name}”`} onClose={() => v.setPostponing(null)}>
      <div className={styles.form}>
        {item.recurring ? (
          <p className={styles.muted}>Skips {monthLabel(item.month, true)} only.</p>
        ) : (
          <label className={styles.field}>
            New date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        )}
        <div className={styles.reasons} role="group" aria-label="Why">
          {REASONS.map((r) => (
            <button key={r} type="button" aria-pressed={reason === r} onClick={() => setReason(r)}>
              {r}
            </button>
          ))}
        </div>
        {v.error && <p className={styles.error}>{v.error}</p>}
        <div className={styles.sheetActions}>
          <button type="button" className={styles.ghost} onClick={() => v.setPostponing(null)}>
            Cancel
          </button>
          <button type="button" className={styles.primary} disabled={v.busy || (!item.recurring && !date)} onClick={() => v.postpone(item, new Date(`${date}T12:00`), reason)}>
            {v.busy ? 'Saving…' : item.recurring ? 'Skip this month' : 'Postpone'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
