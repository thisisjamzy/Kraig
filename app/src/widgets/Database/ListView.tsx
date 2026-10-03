'use client';

// A database's List view, and how a Table reads on a phone: each row a
// two-line item (the name and its first secondary property on the left,
// the amount and status on the right) with up to two more visible
// properties as small muted text. Groups and totals stay. Amounts never
// truncate; the name gives way first.
//
// Touch: swipe right for the row's main action (Mark paid), left for the
// second (Postpone); a long press starts selection, with the bulk actions
// in a bottom bar. Mouse: the row's actions show on hover. On a phone the
// totals sit in a sticky bar above the bottom navigation.

import { useRef, useState, type ReactNode } from 'react';
import { ChevronDown, MoreHorizontal, X } from 'lucide-react';
import { Popover } from '@/src/widgets/ListQuery/Popover';
import { DefaultCell, isCollapsed, type TableGroup } from './TableView';
import { formatNumber } from './format';
import type { BulkAction, ColumnDef, ListSpec, RowAction } from './types';
import type { DatabaseStateApi } from './useDatabaseState';
import styles from './Database.module.css';

const LONG_PRESS_MS = 500;
const SWIPE_PX = 72;

export function ListView<T>({
  label,
  rows,
  allRows,
  groups,
  rowKey,
  extras,
  spec,
  shown,
  db,
  subtotal,
  currency,
  onOpen,
  rowActions,
  bulkActions,
  compact,
  emptyText,
  more,
}: {
  label: string;
  rows: T[];
  allRows: T[];
  groups: TableGroup<T>[] | null;
  rowKey: (row: T) => string;
  /** Up to two more visible properties, for the third line. */
  extras: ColumnDef<T>[];
  spec: ListSpec<T>;
  /** The view's visible property ids. */
  shown: Set<string>;
  db: DatabaseStateApi;
  subtotal?: ColumnDef<T>;
  currency?: string;
  onOpen?: (row: T) => void;
  rowActions?: RowAction<T>[];
  bulkActions?: BulkAction<T>[];
  compact: boolean;
  emptyText: string;
  more: ReactNode;
}) {
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<{ row: T; anchor: HTMLElement } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [swiping, setSwiping] = useState<{ key: string; dx: number } | null>(null);
  const press = useRef<{ key: string; x: number; y: number; timer: number; moved: boolean; long: boolean } | null>(null);

  if (!rows.length) return <p className={styles.emptyCards}>{emptyText}</p>;

  const sections = groups ?? [{ key: '__all', label: '', rows }];
  const actionsFor = (row: T) => (rowActions ?? []).filter((a) => !a.show || a.show(row));
  const total = subtotal ? allRows.reduce((s, r) => s + (Number(subtotal.value(r)) || 0), 0) : null;
  const byKey = new Map(rows.map((r) => [rowKey(r), r]));

  async function run(action: () => Promise<unknown> | void) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not do that.');
    } finally {
      setBusy(false);
    }
  }

  function toggle(key: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      if (!next.size) setSelecting(false);
      return next;
    });
  }

  function pointerDown(e: React.PointerEvent, key: string) {
    if (e.pointerType === 'mouse') return;
    const timer = window.setTimeout(() => {
      if (!press.current || press.current.moved) return;
      press.current.long = true;
      setSelecting(true);
      setSelected((s) => new Set(s).add(key));
      navigator.vibrate?.(10);
    }, LONG_PRESS_MS);
    press.current = { key, x: e.clientX, y: e.clientY, timer, moved: false, long: false };
  }
  function pointerMove(e: React.PointerEvent) {
    const p = press.current;
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
      p.moved = true;
      window.clearTimeout(p.timer);
    }
    if (!selecting && Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 8) setSwiping({ key: p.key, dx: Math.max(-120, Math.min(120, dx)) });
  }
  function pointerUp(row: T) {
    const p = press.current;
    press.current = null;
    if (!p) return;
    window.clearTimeout(p.timer);
    const dx = swiping?.key === p.key ? swiping.dx : 0;
    setSwiping(null);
    const actions = actionsFor(row);
    if (dx > SWIPE_PX && actions[0]) void run(() => actions[0].run(row));
    else if (dx < -SWIPE_PX && actions[1]) void run(() => actions[1].run(row));
  }

  return (
    <div className={styles.listWrap}>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <ul className={styles.list} aria-label={label}>
        {sections.map((section) => {
          if (!section.rows.length) return null;
          const collapsed = groups !== null && isCollapsed(db, section.key);
          const sub = subtotal ? section.rows.reduce((s, r) => s + (Number(subtotal.value(r)) || 0), 0) : null;
          return (
            <li key={section.key} className={styles.listSection}>
              {groups !== null && (
                <button type="button" className={styles.listGroupHead} aria-expanded={!collapsed} onClick={() => db.toggleGroup(section.key)}>
                  <ChevronDown size={14} strokeWidth={2.5} aria-hidden style={{ transform: collapsed ? 'rotate(-90deg)' : undefined }} />
                  <span className={styles.groupLabel}>{section.label}</span>
                  <span className={styles.groupCount}>{section.rows.length}</span>
                  {sub !== null && <span className={styles.groupTotal}>{formatNumber(sub)}</span>}
                </button>
              )}
              {!collapsed && (
                <ul className={styles.list}>
                  {section.rows.map((row) => {
                    const key = rowKey(row);
                    const actions = actionsFor(row);
                    const dx = swiping?.key === key ? swiping.dx : 0;
                    const secondary = spec.secondary?.(row, shown);
                    return (
                      <li key={key} className={styles.listItemWrap}>
                        {dx !== 0 && (
                          <span className={styles.swipeHint} data-side={dx > 0 ? 'right' : 'left'} aria-hidden>
                            {dx > 0 ? actions[0]?.label : actions[1]?.label}
                          </span>
                        )}
                        <div
                          className={styles.listItem}
                          data-row-key={key}
                          data-lit={spec.highlight === key || undefined}
                          draggable={!compact && Boolean(spec.drag) && !selecting}
                          onDragStart={(e) => {
                            if (!spec.drag) return;
                            e.dataTransfer.setData(spec.drag.type, spec.drag.data(row));
                            e.dataTransfer.effectAllowed = 'move';
                          }}
                          onMouseEnter={spec.onHover ? () => spec.onHover!(row) : undefined}
                          onMouseLeave={spec.onHover ? () => spec.onHover!(null) : undefined}
                          data-selected={selected.has(key) || undefined}
                          style={dx ? { transform: `translateX(${dx}px)` } : undefined}
                          onPointerDown={(e) => pointerDown(e, key)}
                          onPointerMove={pointerMove}
                          onPointerUp={() => pointerUp(row)}
                          onPointerCancel={() => {
                            press.current = null;
                            setSwiping(null);
                          }}
                          onClick={(e) => {
                            if ((e.target as HTMLElement).closest('a, button, input')) return;
                            if (press.current?.long) return;
                            if (selecting) toggle(key);
                            else onOpen?.(row);
                          }}
                          onContextMenu={(e) => {
                            if (compact) e.preventDefault();
                          }}
                          role={onOpen || selecting ? 'button' : undefined}
                          tabIndex={onOpen ? 0 : undefined}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && onOpen) onOpen(row);
                          }}
                        >
                          {selecting && <input type="checkbox" className={styles.checkbox} checked={selected.has(key)} onChange={() => toggle(key)} aria-label="Select" />}
                          {!selecting && spec.leading?.(row)}
                          <span className={styles.listMain}>
                            <span className={styles.listTitle}>{spec.title(row)}</span>
                            {secondary && <span className={styles.listSecondary}>{secondary}</span>}
                            {extras.length > 0 && (
                              <span className={styles.listExtras}>
                                {extras.map((c) => (
                                  <span key={c.id}>{c.render ? c.render(row) : <DefaultCell column={c} value={c.value(row)} />}</span>
                                ))}
                              </span>
                            )}
                          </span>
                          <span className={styles.listSide}>
                            {spec.amount && <span className={styles.listAmount}>{spec.amount(row)}</span>}
                            {spec.status && <span className={styles.listStatus}>{spec.status(row, shown)}</span>}
                          </span>
                          {actions.length > 0 && !selecting && (
                            <button type="button" className={styles.listMore} aria-label="Actions" onClick={(e) => setMenu({ row, anchor: e.currentTarget })}>
                              <MoreHorizontal size={16} strokeWidth={2} />
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      {more}

      {compact && total !== null && !selecting && (
        <div className={styles.totalBar} role="status">
          Total {formatNumber(total)}
          {currency ? ` ${currency}` : ''} · {allRows.length} {allRows.length === 1 ? 'item' : 'items'}
        </div>
      )}
      {selecting && (
        <div className={styles.selectBar} role="toolbar" aria-label="Selected">
          <span>{selected.size} selected</span>
          {(bulkActions ?? []).map((a) => (
            <button
              key={a.id}
              type="button"
              className={styles.bulkButton}
              data-danger={a.danger || undefined}
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await a.run([...selected].map((k) => byKey.get(k)).filter((r): r is T => Boolean(r)));
                  setSelected(new Set());
                  setSelecting(false);
                })
              }
            >
              {a.label}
            </button>
          ))}
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Cancel selection"
            onClick={() => {
              setSelected(new Set());
              setSelecting(false);
            }}
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>
      )}

      {menu && (
        <Popover anchor={menu.anchor} label="Actions" onClose={() => setMenu(null)}>
          <div className={styles.menu}>
            {actionsFor(menu.row).map((a) => (
              <button
                key={a.id}
                type="button"
                className={styles.menuRow}
                data-row
                onClick={() => {
                  const row = menu.row;
                  setMenu(null);
                  void run(() => a.run(row));
                }}
              >
                {a.label}
              </button>
            ))}
            {onOpen && (
              <button
                type="button"
                className={styles.menuRow}
                data-row
                onClick={() => {
                  const row = menu.row;
                  setMenu(null);
                  onOpen(row);
                }}
              >
                Open
              </button>
            )}
            {(bulkActions ?? []).length > 0 && (
              <button
                type="button"
                className={styles.menuRow}
                data-row
                onClick={() => {
                  setSelecting(true);
                  setSelected(new Set([rowKey(menu.row)]));
                  setMenu(null);
                }}
              >
                Select
              </button>
            )}
          </div>
        </Popover>
      )}
    </div>
  );
}
