'use client';

// Priorities on Payments, drawn from Dreda.figcraft `Payments / Web /
// Priorities`: a banner saying money is given to payments from the top
// down, then the ranked list grouped by coverage (Covered by money
// received, Partly covered, Not covered yet). Each row: a drag handle, its
// rank, the name over "<tag> · <kind> · due <date>", the coverage in its
// status colour, the wallet and the amount left in mono. Dragging a row
// changes the saved order (every month); tapping it opens Mark paid. The
// footer says how the order works.

import { useEffect, useMemo } from 'react';
import { CheckCircle2, GripVertical } from 'lucide-react';
import { DndContext, PointerSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { usePriorityWalk, type PrioritiesLogic } from '@/src/logic/priorities/useLogic';
import { dueText } from '@/src/viewmodels/plans/model';
import type { WalkRow } from '@/src/viewmodels/plans/priorities';
import { formatAmountValue } from '@/src/widgets/Database/format';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { PaySheet, PostponeSheet } from '@/src/screens/Plans/PrioritiesScreen';
import styles from './PriorityList.module.css';

type Group = { key: 'covered' | 'partly' | 'not'; label: string; rows: { row: WalkRow; rank: number; coveredPart: number }[] };

const KIND_WORD: Record<string, string> = { fixed: 'Payment', variable: 'Payment', savings: 'Set aside' };

export function PriorityList({ v, walletName }: { v: PrioritiesLogic; walletName: (id: string | null | undefined) => string | null }) {
  const w = usePriorityWalk(v);
  const { setMode } = w;
  // The order the money follows is the saved one.
  useEffect(() => setMode('mine'), [setMode]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const money = (n: number) => formatAmountValue(Math.round(n));

  const groups = useMemo<Group[]>(() => {
    const out: Group[] = [
      { key: 'covered', label: 'Covered by money received', rows: [] },
      { key: 'partly', label: 'Partly covered', rows: [] },
      { key: 'not', label: 'Not covered yet', rows: [] },
    ];
    w.walk.rows.forEach((row, i) => {
      const before = row.after + row.remaining;
      const coveredPart = row.covered ? row.remaining : Math.max(0, Math.min(row.remaining, before));
      const key = row.covered ? 'covered' : coveredPart > 0 ? 'partly' : 'not';
      out.find((g) => g.key === key)!.rows.push({ row, rank: i + 1, coveredPart });
    });
    return out.filter((g) => g.rows.length);
  }, [w.walk.rows]);

  const short = Math.max(0, w.walk.due - w.walk.available);

  return (
    <section className={styles.card} aria-label="Priorities">
      <p className={styles.banner}>
        <CheckCircle2 size={16} strokeWidth={2} aria-hidden />
        Money you receive is given to payments from the top down. Drag a payment to change the order. {money(w.walk.available)} is available now
        {short > 0 ? `; ${money(short)} more is needed to cover everything.` : ', enough to cover everything.'}
      </p>

      <ScreenState loading={v.loading} />
      {!v.loading && w.walk.rows.length === 0 && <p className={styles.empty}>Nothing left to pay in {v.monthText}.</p>}

      {!v.loading && w.walk.rows.length > 0 && (
        <DndContext
          sensors={sensors}
          onDragEnd={(e: DragEndEvent) => {
            if (!e.over || e.active.id === e.over.id) return;
            void w.move(String(e.active.id), w.walk.rows.findIndex((r) => r.item.key === e.over!.id));
          }}
        >
          <SortableContext items={w.walk.rows.map((r) => r.item.key)} strategy={verticalListSortingStrategy}>
            {groups.map((g) => (
              <div key={g.key} className={styles.group}>
                <p className={styles.groupLabel}>
                  {g.label} · {g.rows.length}
                </p>
                <ul className={styles.rows}>
                  {g.rows.map(({ row, rank, coveredPart }) => (
                    <Row
                      key={row.item.key}
                      row={row}
                      rank={rank}
                      coverage={
                        g.key === 'covered' ? (
                          <span data-tone="good">Covered</span>
                        ) : g.key === 'partly' ? (
                          <span data-tone="watch">
                            {money(coveredPart)} of {money(row.remaining)}
                          </span>
                        ) : (
                          <span data-tone="bad">{row.fitsIn ? `Fits in ${row.fitsIn}` : 'Not covered'}</span>
                        )
                      }
                      wallet={walletName(row.item.accountId) ?? 'No wallet yet'}
                      amount={money(row.remaining)}
                      meta={[row.item.tag || row.item.bucketName, KIND_WORD[row.item.kind] ?? 'Payment', row.item.due ? dueText(row.item.due, v.today) : null].filter(Boolean).join(' · ')}
                      onOpen={() => v.setPaying(row.item)}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </SortableContext>
        </DndContext>
      )}

      <p className={styles.footer}>The order is saved for every month. Payments at the top are covered first when income arrives.</p>

      {v.error && <p className={styles.error}>{v.error}</p>}
      {v.paying && <PaySheet v={v} item={v.paying} />}
      {v.postponing && <PostponeSheet v={v} item={v.postponing} />}
    </section>
  );
}

function Row({
  row,
  rank,
  coverage,
  wallet,
  amount,
  meta,
  onOpen,
}: {
  row: WalkRow;
  rank: number;
  coverage: React.ReactNode;
  wallet: string;
  amount: string;
  meta: string;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.item.key });
  return (
    <li ref={setNodeRef} className={styles.row} data-dragging={isDragging || undefined} style={{ transform: CSS.Transform.toString(transform), transition }}>
      <button type="button" className={styles.handle} aria-label={`Move ${row.item.name}`} {...attributes} {...listeners}>
        <GripVertical size={16} strokeWidth={2} />
      </button>
      <span className={styles.rank}>{rank}</span>
      <button type="button" className={styles.main} onClick={onOpen}>
        <span className={styles.name}>{row.item.name}</span>
        <span className={styles.meta}>{meta}</span>
      </button>
      <span className={styles.coverage}>{coverage}</span>
      <span className={styles.wallet}>{wallet}</span>
      <span className={styles.amount}>{amount}</span>
    </li>
  );
}
