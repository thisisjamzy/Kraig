'use client';

// "Your plan by {period}": the List view (the default: dates first) and the
// Board view (drag a card between periods, or use its Move to menu). Each
// period opens with "Starts with · +in · −out · Ends with", so it always
// adds up. Locked items (income, fixed costs) are read-only everywhere: no
// handle, menu, skip or date. Weekly spending folds into one row per
// period and remembers whether it is open.

import { useState } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { GripVertical } from 'lucide-react';
import { compact } from '@/src/shared/dashboard/format';
import { dayLabel, isoOf, parseIso, shortDay } from '@/src/viewmodels/planner/days';
import { earliestAffordable, isLocked, isWeekly, type Column, type MoneyInput, type MoneyPlanView, type Occ, type PeriodFigures } from '@/src/viewmodels/planner/money';
import type { MoneyPlanLogic } from '@/src/logic/moneyPlan/useMoneyPlan';
import { LockGlyph } from './PlanCharts';
import p from './Planner.module.css';

type Actions = MoneyPlanLogic['actions'];

const ORDER = { income: 0, fixed: 1, savings: 2, variable: 3 } as const;
const byDate = (a: Occ, b: Occ) => (a.date ?? 0) - (b.date ?? 0) || ORDER[a.item.kind] - ORDER[b.item.kind];
const inCol = (occ: Occ[], c: Column) => occ.filter((o) => o.date != null && o.date >= c.start && o.date <= c.end).sort(byDate);
const range = (c: Column) => (c.start === c.end ? shortDay(c.start) : `${shortDay(c.start)} to ${shortDay(c.end)}`);

function Flow({ x, buffer }: { x: PeriodFigures; buffer: number }) {
  return (
    <div className={p.flow}>
      <span>
        Starts with <b>{compact(x.start)}</b>
      </span>
      <span>+{compact(x.in)} in</span>
      <span>−{compact(x.out)} out</span>
      <span>
        Ends with <b data-bad={x.end < buffer || undefined}>{compact(x.end)}</b>
      </span>
    </div>
  );
}

function PeriodNote({ c, x, buffer }: { c: Column; x: PeriodFigures; buffer: number }) {
  if (x.end < 0)
    return (
      <p className={p.note} data-bad>
        You would end {c.label} {compact(-x.end)} short: more is going out than you have. Move or skip something below, or lower a savings transfer.
      </p>
    );
  if (x.end < buffer) return <p className={p.note}>Ends below your {compact(buffer)} buffer.</p>;
  return null;
}

function Tag({ o }: { o: Occ }) {
  if (o.item.kind === 'savings') return null;
  return (
    <span className={p.tag} data-p={o.item.priority}>
      {o.item.priority}
    </span>
  );
}

function LockedRow({ o, goalName }: { o: Occ; goalName: (id: string) => string }) {
  const it = o.item;
  return (
    <div className={p.lockedRow}>
      <LockGlyph />
      <span className={p.name}>
        {it.name}
        {it.confidence === 'Expected' && <em> expected</em>}
        {it.fundedByGoalId && <em> paid from {goalName(it.fundedByGoalId)}</em>}
      </span>
      <span className={p.muted}>{o.date != null ? dayLabel(o.date) : ''}</span>
      <b data-good={it.kind === 'income' || undefined}>
        {it.kind === 'income' ? '+' : '−'}
        {compact(o.amount)}
      </b>
    </div>
  );
}

function FlexRow({ o, end, today, actions }: { o: Occ; end: number; today: number; actions: Actions }) {
  const it = o.item;
  return (
    <div className={p.flexRow} data-skip={o.skip || undefined} data-kind={it.kind}>
      <span className={p.name}>
        {it.name} <Tag o={o} />
        {o.moved && <em> moved from {o.base != null ? shortDay(o.base) : 'not scheduled'}</em>}
      </span>
      <b className={p.amount}>−{compact(o.amount)}</b>
      <span className={p.rowControls}>
        <label className={p.srOnly} htmlFor={`dt-${o.id}`}>
          Date for {it.name}
        </label>
        <input
          id={`dt-${o.id}`}
          type="date"
          className={p.date}
          value={o.date != null ? isoOf(o.date) : ''}
          min={isoOf(today)}
          max={isoOf(end)}
          disabled={o.skip}
          onChange={(e) => {
            const d = parseIso(e.target.value);
            if (d != null) actions.setDate(o.id, d);
          }}
        />
        {o.moved && (
          <button type="button" className={p.small} onClick={() => actions.originalDate(o.id)}>
            Original date
          </button>
        )}
        <button type="button" className={p.small} onClick={() => actions.toggleSkip(o.id)}>
          {o.skip ? 'Restore' : 'Skip'}
        </button>
        {it.kind === 'variable' && o.date != null && (
          <button type="button" className={p.small} onClick={() => actions.moveTo(o.id, 'park')}>
            Put off
          </button>
        )}
      </span>
    </div>
  );
}

const WEEKLY_KEY = 'dreda.plan.weeklyOpen';
function readOpen(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(WEEKLY_KEY) ?? '{}') as Record<string, boolean>;
  } catch {
    return {};
  }
}

function WeeklyGroup({ list, colKey, end, today, actions }: { list: Occ[]; colKey: string; end: number; today: number; actions: Actions }) {
  const [open, setOpen] = useState(() => (typeof window === 'undefined' ? false : Boolean(readOpen()[colKey])));
  if (!list.length) return null;
  const names = [...new Set(list.map((o) => o.item.name))];
  const total = list.filter((o) => !o.skip).reduce((a, o) => a + o.amount, 0);
  return (
    <details
      className={p.group}
      open={open}
      onToggle={(e) => {
        const next = (e.currentTarget as HTMLDetailsElement).open;
        setOpen(next);
        try {
          localStorage.setItem(WEEKLY_KEY, JSON.stringify({ ...readOpen(), [colKey]: next }));
        } catch {
          // Not remembered on this device.
        }
      }}
    >
      <summary>
        <span>Weekly spending: {names.join(', ')}</span>
        <span className={p.groupNums}>
          <span className={p.muted}>{list.length} entries</span>
          <span>−{compact(total)}</span>
        </span>
      </summary>
      <div className={p.groupBody}>
        {list.map((o) => (
          <FlexRow key={o.id} o={o} end={end} today={today} actions={actions} />
        ))}
      </div>
    </details>
  );
}

function Wishes({ input, view, buffer, actions }: { input: MoneyInput; view: MoneyPlanView; buffer: number; actions: Actions }) {
  const parked = view.run.occ.filter((o) => o.date == null);
  return (
    <div className={p.period} data-park>
      <div className={p.periodHead}>
        <div>
          <b>Not scheduled</b> <span className={p.muted}>Wishes and things you put off</span>
        </div>
      </div>
      {parked.length ? (
        parked.map((o) => {
          const e = earliestAffordable(input, view.run, o, buffer);
          return (
            <div key={o.id} className={p.flexRow} data-kind="variable">
              <span className={p.name}>
                {o.item.name} <Tag o={o} />
                <span className={p.hint}>{e != null ? <>Earliest you can afford it: <b>{dayLabel(e)}</b></> : 'Not affordable in this period without dropping below the buffer'}</span>
              </span>
              <b className={p.amount}>−{compact(o.amount)}</b>
              <span className={p.rowControls}>
                <label className={p.srOnly} htmlFor={`dt-${o.id}`}>
                  Schedule {o.item.name}
                </label>
                <input
                  id={`dt-${o.id}`}
                  type="date"
                  className={p.date}
                  value=""
                  min={isoOf(input.today)}
                  max={isoOf(view.run.end)}
                  onChange={(ev) => {
                    const d = parseIso(ev.target.value);
                    if (d != null) actions.setDate(o.id, d);
                  }}
                />
                {e != null && (
                  <button type="button" className={p.small} data-primary onClick={() => actions.setDate(o.id, e)}>
                    Plan for {shortDay(e)}
                  </button>
                )}
              </span>
            </div>
          );
        })
      ) : (
        <p className={p.muted}>Nothing put off.</p>
      )}
    </div>
  );
}

export function MoneyListView({ input, view, buffer, actions }: { input: MoneyInput; view: MoneyPlanView; buffer: number; actions: Actions }) {
  const { run } = view;
  const goalName = (id: string) => input.goals.find((g) => g.id === id)?.name ?? 'savings';
  return (
    <div className={p.periods}>
      {run.cols.map((c) => {
        const x = run.periods[c.key];
        const mine = inCol(run.occ, c);
        const locked = mine.filter((o) => isLocked(o.item));
        const flex = mine.filter((o) => !isLocked(o.item));
        const lin = locked.filter((o) => o.item.kind === 'income' && !o.skip).reduce((a, o) => a + o.amount, 0);
        const lout = locked.filter((o) => o.item.kind === 'fixed').reduce((a, o) => a + o.amount, 0);
        const weekly = flex.filter((o) => isWeekly(o.item));
        const one = flex.filter((o) => !isWeekly(o.item));
        return (
          <div key={c.key} className={p.period}>
            <div className={p.periodHead}>
              <div>
                <b>{c.label}</b> <span className={p.muted}>{range(c)}</span>
              </div>
              <Flow x={x} buffer={buffer} />
            </div>
            <PeriodNote c={c} x={x} buffer={buffer} />
            {locked.length > 0 && (
              <details className={p.group} data-locked>
                <summary>
                  <LockGlyph />
                  <span>
                    Locked: {locked.length} item{locked.length > 1 ? 's' : ''}
                  </span>
                  <span className={p.groupNums}>
                    <span data-good>+{compact(lin)}</span>
                    <span>−{compact(lout)}</span>
                  </span>
                </summary>
                <div className={p.groupBody}>
                  {locked.map((o) => (
                    <LockedRow key={o.id} o={o} goalName={goalName} />
                  ))}
                </div>
              </details>
            )}
            <WeeklyGroup list={weekly} colKey={`${c.key}`} end={run.end} today={input.today} actions={actions} />
            {one.map((o) => (
              <FlexRow key={o.id} o={o} end={run.end} today={input.today} actions={actions} />
            ))}
            {!flex.length && <p className={p.muted}>No flexible items in this period.</p>}
          </div>
        );
      })}
      <Wishes input={input} view={view} buffer={buffer} actions={actions} />
    </div>
  );
}

// ---- Board ----

function Card({ o, cols, actions }: { o: Occ; cols: Column[]; actions: Actions }) {
  const it = o.item;
  const locked = isLocked(it);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: o.id, disabled: locked });
  if (locked)
    return (
      <div className={p.card} data-locked data-kind={it.kind}>
        <span className={p.grip}>
          <LockGlyph />
        </span>
        <span className={p.cardName}>{it.name}</span>
        <b>
          {it.kind === 'income' ? '+' : '−'}
          {compact(o.amount)}
        </b>
        <span className={p.cardMeta}>
          {o.date != null ? dayLabel(o.date) : ''}
          {it.confidence ? ` · ${it.confidence}` : ''}
          {it.fundedByGoalId ? ' · from savings' : ''}
        </span>
      </div>
    );
  const current = o.date == null ? 'park' : (cols.find((c) => o.date! >= c.start && o.date! <= c.end)?.key ?? '');
  return (
    <div
      ref={setNodeRef}
      className={p.card}
      data-kind={it.kind}
      data-skip={o.skip || undefined}
      data-dragging={isDragging || undefined}
      style={transform ? { transform: `translate(${transform.x}px, ${transform.y}px)`, zIndex: 30 } : undefined}
    >
      <button type="button" className={p.grip} aria-label={`Drag ${it.name}`} {...listeners} {...attributes}>
        <GripVertical size={14} />
      </button>
      <span className={p.cardName}>{it.name}</span>
      <b>−{compact(o.amount)}</b>
      <span className={p.cardMeta}>
        {o.date != null ? dayLabel(o.date) : 'No date'}
        {o.moved ? ' · moved' : ''} <Tag o={o} />
        <label className={p.srOnly} htmlFor={`mv-${o.id}`}>
          Move {it.name}
        </label>
        <select id={`mv-${o.id}`} className={p.moveSelect} value={current} onChange={(e) => actions.moveTo(o.id, e.target.value)}>
          {cols.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
          {it.kind === 'variable' && <option value="park">Not scheduled</option>}
        </select>
        <button type="button" className={p.small} onClick={() => actions.toggleSkip(o.id)}>
          {o.skip ? 'Restore' : 'Skip'}
        </button>
      </span>
    </div>
  );
}

function BoardColumn({ id, children, park }: { id: string; children: React.ReactNode; park?: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={p.boardCol} data-over={isOver || undefined} data-park={park || undefined}>
      {children}
    </div>
  );
}

export function MoneyBoardView({ input, view, buffer, actions }: { input: MoneyInput; view: MoneyPlanView; buffer: number; actions: Actions }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor));
  const { run } = view;
  const parked = run.occ.filter((o) => o.date == null);
  const onEnd = (e: DragEndEvent) => {
    if (!e.over) return;
    actions.moveTo(String(e.active.id), String(e.over.id));
  };
  return (
    <DndContext sensors={sensors} onDragEnd={onEnd} autoScroll>
      <div className={p.board}>
        {run.cols.map((c) => {
          const mine = inCol(run.occ, c);
          return (
            <BoardColumn key={c.key} id={c.key}>
              <div className={p.boardHead}>
                <b>{c.label}</b>
                <span className={p.muted}>{range(c)}</span>
                <Flow x={run.periods[c.key]} buffer={buffer} />
              </div>
              {mine.length ? mine.map((o) => <Card key={o.id} o={o} cols={run.cols} actions={actions} />) : <p className={p.muted}>Nothing planned.</p>}
            </BoardColumn>
          );
        })}
        <BoardColumn id="park" park>
          <div className={p.boardHead}>
            <b>Not scheduled</b>
            <span className={p.muted}>Wishes and things you put off</span>
          </div>
          {parked.length ? (
            parked.map((o) => {
              const e = earliestAffordable(input, run, o, buffer);
              return (
                <div key={o.id}>
                  <Card o={o} cols={run.cols} actions={actions} />
                  <p className={p.hint}>{e != null ? <>Earliest you can afford it: <b>{dayLabel(e)}</b></> : 'Not affordable in this period without dropping below the buffer'}</p>
                </div>
              );
            })
          ) : (
            <p className={p.muted}>Drop a variable cost here to put it off.</p>
          )}
        </BoardColumn>
      </div>
    </DndContext>
  );
}
