'use client';

// A line on the month board or in the backlog: type icon, name, amount
// (edited in place), due date, need and priority chips, paid-from in muted
// text, a lock on fixed recurring lines (they can't be dragged). States:
// changed in the draft ("moved from October"), suggested by Auto-allocate
// (dashed blue border, "Suggested" chip and its reason), causing a dip
// below the cushion (a small amber or red icon; the notification has the
// details). "..." holds Move to month, Move to backlog, Split into
// payments, Change priority, Change paid from and Open item. On a focused
// card: M moves to a month, B to the backlog, S splits.

import { useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { useDraggable } from '@dnd-kit/core';
import { AlertTriangle, CalendarClock, Lock, MoreHorizontal, PiggyBank, Receipt, ShoppingBag, Wallet } from 'lucide-react';
import type { PlanLine } from '@/src/viewmodels/plans/planDraft';
import { monthWord } from '@/src/viewmodels/plans/allocate';
import { Popover } from '@/src/widgets/ListQuery/Popover';
import { Tag } from '@/src/widgets/TaskDb/Tag';
import { formatMoney } from '@/src/widgets/Money/Money';
import db from '@/src/widgets/Database/Database.module.css';
import styles from './PlanBoard.module.css';

const pad = (n: number) => String(n).padStart(2, '0');
const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export interface CardActions {
  months: string[];
  accounts: { id: string; name: string }[];
  moveTo: (line: PlanLine, month: string) => void;
  toBacklog: (line: PlanLine) => void;
  split: (line: PlanLine) => void;
  setPriority: (line: PlanLine, patch: { need?: 'must' | 'nice'; priority?: 'High' | 'Medium' | 'Low' }) => void;
  setAccount: (line: PlanLine, accountId: string) => void;
  setAmount: (line: PlanLine, amount: number) => void;
  setDate: (line: PlanLine, iso: string) => void;
  moveThisMonthOnly: (line: PlanLine) => void;
  accept?: (line: PlanLine) => void;
  reject?: (line: PlanLine) => void;
  waitingText?: (line: PlanLine) => string | null;
}

type Menu = { kind: 'main' | 'move' | 'priority' | 'account'; anchor: HTMLElement } | null;

function TypeIcon({ line }: { line: PlanLine }) {
  const Icon = line.source === 'want_to_buy' ? ShoppingBag : line.kind === 'savings' ? PiggyBank : line.kind === 'variable' ? Wallet : Receipt;
  return <Icon size={14} strokeWidth={2} aria-hidden className={styles.typeIcon} />;
}

export function PlanCard({
  line,
  actions,
  dip,
  accountName,
  inBacklog = false,
  now,
}: {
  line: PlanLine;
  actions: CardActions;
  dip: 'below' | 'zero' | null;
  accountName: string | null;
  inBacklog?: boolean;
  now: Date;
}) {
  const movable = line.movable !== false && !line.paid && !line.suggested;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: line.key, data: { line }, disabled: !movable });
  const [menu, setMenu] = useState<Menu>(null);
  const [editing, setEditing] = useState(false);
  const [amount, setAmountText] = useState(String(Math.round(line.amount)));
  const waiting = line.waitingSince ? Math.floor((now.getTime() - line.waitingSince.getTime()) / 86_400_000) : null;
  const waitText = !inBacklog && actions.waitingText ? actions.waitingText(line) : null;

  function onKey(e: KeyboardEvent<HTMLElement>) {
    if ((e.target as HTMLElement).closest('input, button:not([data-card])')) return;
    const key = e.key.toLowerCase();
    if (key === 'm' && movable) {
      e.preventDefault();
      setMenu({ kind: 'move', anchor: e.currentTarget });
    } else if (key === 'b' && movable && !inBacklog) {
      e.preventDefault();
      actions.toBacklog(line);
    } else if (key === 's' && movable) {
      e.preventDefault();
      actions.split(line);
    }
  }

  const row = (label: string, run: () => void, disabled = false) => (
    <button
      type="button"
      className={db.menuRow}
      data-row
      disabled={disabled}
      onClick={() => {
        setMenu(null);
        run();
      }}
    >
      {label}
    </button>
  );

  return (
    <article
      ref={setNodeRef}
      className={styles.card}
      data-dragging={isDragging || undefined}
      data-changed={line.changed && !line.suggested ? true : undefined}
      data-suggested={line.suggested ? true : undefined}
      data-paid={line.paid || undefined}
      aria-label={`${line.name}, ${formatMoney(line.amount)}`}
      {...(movable ? { ...attributes, ...listeners } : { tabIndex: 0 })}
      onKeyDown={(e) => {
        onKey(e);
        if (!e.defaultPrevented && movable) listeners?.onKeyDown?.(e);
      }}
    >
      <header className={styles.cardHead}>
        <TypeIcon line={line} />
        <span className={styles.cardName}>{line.name}</span>
        {line.movable === false && <Lock size={12} strokeWidth={2.25} aria-label="Fixed recurring: can't be dragged" className={styles.lock} />}
        {dip && (
          <AlertTriangle size={13} strokeWidth={2.25} className={styles.dip} data-tone={dip} aria-label={dip === 'zero' ? 'Takes the balance below zero' : 'Takes the balance below your cushion'} />
        )}
        <button
          type="button"
          data-card
          className={styles.cardMore}
          aria-label="Card actions"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => setMenu({ kind: 'main', anchor: e.currentTarget })}
        >
          <MoreHorizontal size={14} strokeWidth={2} />
        </button>
      </header>

      <div className={styles.cardFigures}>
        {editing ? (
          <input
            className={styles.amountInput}
            inputMode="decimal"
            value={amount}
            autoFocus
            aria-label="Amount"
            onPointerDown={(e) => e.stopPropagation()}
            onChange={(e) => setAmountText(e.target.value.replace(/[^\d.]/g, ''))}
            onBlur={() => {
              setEditing(false);
              const n = Number(amount);
              if (n > 0 && Math.round(n) !== Math.round(line.amount)) actions.setAmount(line, n);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') {
                setAmountText(String(Math.round(line.amount)));
                setEditing(false);
              }
            }}
          />
        ) : (
          <button type="button" className={styles.amount} onPointerDown={(e) => e.stopPropagation()} onClick={() => !line.paid && setEditing(true)} aria-label={`Amount ${formatMoney(line.amount)}, edit`}>
            {formatMoney(line.amount)}
          </button>
        )}
        {!inBacklog && line.month && (
          <label className={styles.date} onPointerDown={(e) => e.stopPropagation()}>
            <CalendarClock size={12} strokeWidth={2} aria-hidden />
            <input
              type="date"
              aria-label="Due date"
              value={line.due ? isoDay(line.due) : ''}
              disabled={line.paid || line.movable === false}
              onChange={(e) => e.target.value && actions.setDate(line, e.target.value)}
            />
          </label>
        )}
      </div>

      <div className={styles.chips}>
        <Tag color={line.need === 'must' ? 'red' : 'gray'}>{line.need === 'must' ? 'Must have' : 'Nice to have'}</Tag>
        <Tag color={line.priority === 'High' ? 'orange' : line.priority === 'Low' ? 'gray' : 'yellow'}>{line.priority}</Tag>
        {line.suggested && <Tag color="blue">Suggested</Tag>}
        {line.warnings?.includes('must have moved') && <Tag color="orange">Must have moved</Tag>}
        {line.paid && <Tag color="green">Paid</Tag>}
      </div>

      {accountName && <p className={styles.muted}>From {accountName}</p>}
      {line.changed && !line.suggested && line.movedFrom && line.movedFrom !== line.month && (
        <p className={styles.changedNote}>
          <span className={styles.changedDot} aria-hidden />
          Moved from {line.movedFrom ? monthWord(line.movedFrom) : 'the backlog'}
        </p>
      )}
      {line.changed && !line.suggested && line.movedFrom === null && line.month && <p className={styles.changedNote}><span className={styles.changedDot} aria-hidden />From the backlog</p>}
      {line.suggested && <p className={styles.reason}>{line.suggested.reason}</p>}
      {line.suggested && actions.accept && (
        <div className={styles.suggestActions} onPointerDown={(e) => e.stopPropagation()}>
          <button type="button" onClick={() => actions.accept!(line)}>Accept</button>
          <button type="button" onClick={() => actions.reject!(line)}>Reject</button>
        </div>
      )}
      {inBacklog && (
        <p className={styles.muted}>
          {[line.neededBy ? `Needed by ${monthWord(line.neededBy)}` : null, line.notBefore ? `Not before ${monthWord(line.notBefore)}` : null, waiting !== null ? `Waiting ${waiting} ${waiting === 1 ? 'day' : 'days'}` : null]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}
      {waitText && <p className={styles.waiting}>{waitText}</p>}

      {menu?.kind === 'main' && (
        <Popover anchor={menu.anchor} label="Card actions" onClose={() => setMenu(null)}>
          <div className={db.menu}>
            {movable ? (
              <>
                <button type="button" className={db.menuRow} data-row onClick={(e) => setMenu({ kind: 'move', anchor: menu.anchor ?? e.currentTarget })}>
                  Move to month
                </button>
                {!inBacklog && row('Move to backlog', () => actions.toBacklog(line))}
                {row('Split into payments', () => actions.split(line))}
              </>
            ) : (
              line.movable === false && !line.paid && row('Move this month only', () => actions.moveThisMonthOnly(line))
            )}
            <button type="button" className={db.menuRow} data-row onClick={() => setMenu({ kind: 'priority', anchor: menu.anchor })}>
              Change priority
            </button>
            <button type="button" className={db.menuRow} data-row onClick={() => setMenu({ kind: 'account', anchor: menu.anchor })}>
              Change paid from
            </button>
            <Link className={db.menuRow} data-row href={`/budget/item/${line.bucketId}/${line.itemId}${line.month ? `?month=${line.month}` : ''}`}>
              Open item
            </Link>
          </div>
        </Popover>
      )}
      {menu?.kind === 'move' && (
        <Popover anchor={menu.anchor} label="Move to month" onClose={() => setMenu(null)}>
          <div className={db.menu}>
            {actions.months.map((m) => row(monthWord(m), () => actions.moveTo(line, m), m === line.month))}
            {!inBacklog && row('Backlog', () => actions.toBacklog(line))}
          </div>
        </Popover>
      )}
      {menu?.kind === 'priority' && (
        <Popover anchor={menu.anchor} label="Change priority" onClose={() => setMenu(null)}>
          <div className={db.menu}>
            {row('Must have', () => actions.setPriority(line, { need: 'must' }), line.need === 'must')}
            {row('Nice to have', () => actions.setPriority(line, { need: 'nice' }), line.need === 'nice')}
            {(['High', 'Medium', 'Low'] as const).map((p) => row(p, () => actions.setPriority(line, { priority: p }), line.priority === p))}
          </div>
        </Popover>
      )}
      {menu?.kind === 'account' && (
        <Popover anchor={menu.anchor} label="Change paid from" onClose={() => setMenu(null)}>
          <div className={db.menu}>{actions.accounts.map((a) => row(a.name, () => actions.setAccount(line, a.id), a.id === line.accountId))}</div>
        </Popover>
      )}
    </article>
  );
}
