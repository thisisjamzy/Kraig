'use client';

// Priorities — "What should I pay next?". The open items in a reasoned
// order, grouped by urgency, with a clear line where the money runs out:
// items above it are covered, items below say when they'd fit. Swipe right
// to mark paid, left to postpone; tap for the item.

import { Fragment, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, GripVertical, Info, MoreHorizontal, AlertCircle } from 'lucide-react';
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
import { Card, Figure, Segmented, full, monthShort } from '@/src/phone/screens/Plans/parts';
import styles from '@/src/phone/screens/Plans/Plans.module.css';
import { NotificationsLink } from '@/src/widgets/Notifications/NotificationsLink';

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
  const c = v.currency;
  const w = v.walk;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const scrollToDivider = () => document.getElementById('money-divider')?.scrollIntoView({ behavior: 'smooth', block: 'center' });

  // The due total split by need, and where the available money reaches.
  const must = w.rows.filter((r) => r.item.need === 'must').reduce((s, r) => s + r.remaining, 0);
  const nice = w.due - must;
  const scale = Math.max(w.due, w.available, 1);
  const rowOf = (row: WalkRow, index: number) => (
    <PriorityRow key={row.item.key} row={row} index={index} v={v} draggable={v.mode === 'mine'} onOpen={() => router.push(itemHref(row.item))} />
  );

  // Rows in display order, with the divider where the money runs out.
  function renderRows(rows: WalkRow[], offset: number) {
    const out: ReactNode[] = [];
    rows.forEach((row, i) => {
      const index = offset + i;
      if (index === w.divider) {
        out.push(
          <div key="divider" id="money-divider" className={styles.divider} role="separator">
            Money runs out · {full(Math.max(0, w.spare), c)} left
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

  // Medium screens and up: "Can I cover it?" and the order controls in a
  // sticky left column, the list beside it. Fragments on a phone.

  return (
    <div className={styles.page}>
      <ScreenHeader
        left={
          <Link href="/baskets" className={styles.roundButton} aria-label="Back to Baskets">
            <ArrowLeft size={20} strokeWidth={2} />
          </Link>
        }
        title="Priorities"
        right={
          <button type="button" className={styles.roundButton} aria-label="How is this ordered?" aria-expanded={howOpen} onClick={() => setHowOpen((o) => !o)}>
            <Info size={18} strokeWidth={2} />
          </button>
        }
      />

      <div className={styles.controls}>
        <Segmented
          label="Which items"
          value={v.view}
          onChange={v.setView}
          options={[
            { value: 'month', label: 'This month' },
            { value: 'open', label: 'All open' },
          ]}
        />
      </div>
      {howOpen && (
        <div className={styles.infoBox}>
          Items are grouped by when they&apos;re due. Inside each group, Recommended ranks:
          <ol>
            <li>Overdue first.</li>
            <li>Must have before Nice to have.</li>
            <li>Priority: High, Medium, Low.</li>
            <li>Items with a penalty if late.</li>
            <li>Smaller amounts first, then earlier dates.</li>
          </ol>
          The line shows where the money you have runs out, walking down the list in this order.
        </div>
      )}

      <ScreenState loading={v.loading} />

      {!v.loading && (
        <>
          <>
          <Card
            navy
            title="Can I cover it?"
            chip={
              <Segmented
                dark
                label="Money to use"
                value={v.includeExpected ? 'expected' : 'now'}
                onChange={(x) => v.setIncludeExpected(x === 'expected')}
                options={[
                  { value: 'now', label: 'Now' },
                  { value: 'expected', label: 'Month end' },
                ]}
              />
            }
            action={{ label: 'Forecast', href: '/baskets/forecast' }}
          >
            <div className={styles.figureGrid} data-cols="3">
              <Figure label="Due" value={w.due} />
              <Figure label="Available" value={w.available} />
              <Figure label={w.gap < 0 ? 'Gap' : 'Spare'} value={Math.abs(w.gap)} tone={w.gap < 0 ? 'bad' : undefined} />
            </div>
            {w.due > 0 && (
              <>
                <div className={styles.stack} role="img" aria-label={`Must haves ${full(must)}, nice to haves ${full(nice)}, available ${full(w.available)}`}>
                  <span style={{ width: `${(must / scale) * 100}%`, background: '#ffffff' }} />
                  <span style={{ width: `${(nice / scale) * 100}%`, background: '#b9c9fb' }} />
                  <i className={styles.stackMarker} style={{ left: `${Math.min(100, (Math.max(0, w.available) / scale) * 100)}%` }} aria-hidden />
                </div>
                <ul className={styles.legend}>
                  <li>
                    <span className={styles.swatch} style={{ '--c': '#ffffff' } as React.CSSProperties} aria-hidden />
                    Must have {full(must)}
                  </li>
                  <li>
                    <span className={styles.swatch} style={{ '--c': '#b9c9fb' } as React.CSSProperties} aria-hidden />
                    Nice to have {full(nice)}
                  </li>
                  <li>
                    <span className={styles.swatch} data-style="marker" aria-hidden />
                    Available
                  </li>
                </ul>
              </>
            )}
            <p className={styles.coverageLine}>{v.summary}</p>
          </Card>

          <div className={styles.sticky}>
            <div className={styles.sortChips} role="group" aria-label="Order">
              {SORTS.map((s) => (
                <button key={s.value} type="button" aria-pressed={v.mode === s.value} onClick={() => v.setMode(s.value)}>
                  {s.label}
                </button>
              ))}
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
          </div>
          </>

          <>
          {w.mustShort > 0 && (
            <p className={styles.quietLine} data-tone="bad">
              <AlertCircle size={14} strokeWidth={2.5} aria-hidden />
              <span>
                {w.mustShort} must-{w.mustShort === 1 ? 'have' : 'haves'} short · {full(w.mustShortAmount, c)}
                <NotificationsLink types={['must_haves_short', 'payment_overdue']} about="payments" />
              </span>
            </p>
          )}

          {w.rows.length === 0 ? (
            <p className={styles.muted}>Nothing left to pay.</p>
          ) : v.mode === 'mine' ? (
            <DndContext
              sensors={sensors}
              onDragEnd={(e: DragEndEvent) => {
                if (!e.over || e.active.id === e.over.id) return;
                v.move(String(e.active.id), w.rows.findIndex((r) => r.item.key === e.over!.id));
              }}
            >
              <SortableContext items={w.rows.map((r) => r.item.key)} strategy={verticalListSortingStrategy}>
                <div className={styles.list}>{renderRows(w.rows, 0)}</div>
              </SortableContext>
            </DndContext>
          ) : (
            groups.map((g) => (
              <section key={g.label} className={styles.group} aria-label={g.label}>
                <h2 className={styles.groupHead} data-overdue={g.overdue || undefined}>
                  {g.label} · {g.rows.length}
                  <span>{full(g.rows.reduce((s, r) => s + r.remaining, 0), c)}</span>
                </h2>
                <div className={styles.list}>{renderRows(g.rows, g.start)}</div>
              </section>
            ))
          )}

          {w.rows.length > 0 && (
            <div className={styles.footer}>
              <button type="button" data-tone={w.gap < 0 ? 'bad' : undefined} onClick={scrollToDivider}>
                {w.coveredCount}/{w.rows.length} covered · {w.gap < 0 ? `${full(-w.gap)} short` : `${full(w.spare)} spare`}
              </button>
            </div>
          )}
          </>
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
  const faded = !row.covered;

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

  const body = (
    <div
      className={styles.row}
      data-need={o.need}
      data-faded={faded || undefined}
      style={{ transform: dx ? `translateX(${dx}px)` : draggable ? CSS.Transform.toString(transform) : undefined, transition: dx ? 'none' : transition }}
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
        className={`${styles.rowMain} ${styles.rowButton}`}
        onClick={() => {
          if (!dx) onOpen();
        }}
      >
        <span className={styles.rowPlan}>{o.bucketName}</span>
        <span className={styles.rowName}>{o.name}</span>
        <span className={styles.rowChips}>
          <span data-need={o.need}>{o.need === 'must' ? 'Must have' : 'Nice to have'}</span>
          <span data-priority={o.priority}>{o.priority}</span>
          {status === 'postponed' && <span data-need="nice">Postponed</span>}
        </span>
      </button>
      <span className={styles.rowSide}>
        <span className={styles.rowAmount}>{full(row.remaining, v.currency)}</span>
        {o.paid > 0 && <span className={styles.rowSub}>of {full(o.planned)}</span>}
        <span className={styles.rowSub} data-tone={overdue ? 'bad' : undefined}>
          {dueText(o.due, v.today)}
        </span>
        {row.covered ? (
          <span className={styles.rowSub} data-tone="good">
            <Check size={11} strokeWidth={3} aria-hidden /> covered
          </span>
        ) : (
          <span className={styles.rowSub}>{row.fitsIn ? `Fits in ${monthShort(row.fitsIn, v.today)}` : 'Beyond forecast'}</span>
        )}
      </span>
      <span className={styles.rowMenu}>
        <ActionMenu
          ariaLabel={`Actions for ${o.name}`}
          triggerIcon={<MoreHorizontal size={16} strokeWidth={2} />}
          items={[
            { key: 'paid', label: 'Mark paid', icon: <Check size={14} strokeWidth={2} />, onSelect: () => v.setPaying(o) },
            { key: 'postpone', label: o.recurring ? 'Skip this month' : 'Postpone', icon: <MoreHorizontal size={14} strokeWidth={2} />, onSelect: () => v.setPostponing(o) },
            { key: 'drop', label: o.recurring ? 'Drop this month' : 'Drop it', icon: <MoreHorizontal size={14} strokeWidth={2} />, onSelect: () => v.drop(o), danger: true },
            { key: 'open', label: 'Open item', icon: <MoreHorizontal size={14} strokeWidth={2} />, onSelect: onOpen },
          ]}
        />
      </span>
    </div>
  );

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
      {body}
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
