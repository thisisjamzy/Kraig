'use client';

// A database's Board view: one column per value of the board's group
// (Coverage on Priorities, the month on the planning board, Importance on
// the Focus matrix), side by side and scrolling sideways inside the board
// when they don't fit. Cards drag between columns; the database can refuse
// a move (its message shows). Each column ends with a quiet "+ New" row
// when the database can create rows; an empty column shows only that row
// (it still takes drops). A column's "..." collapses or hides it.
//
// Medium screens with `matrix`: the four columns as a 2 by 2 grid, each
// cell scrolling on its own. Phones: one column at a time with a switcher
// (and counts) above it; cards move with "Move to..." in their menu.

import { useState, type ReactNode } from 'react';
import { ChevronRight, MoreHorizontal, Plus } from 'lucide-react';
import { Popover } from '@/src/widgets/ListQuery/Popover';
import { DefaultCell } from './TableView';
import type { CardSpec } from './CardsView';
import type { BoardSpec, ColumnDef, GroupDef } from './types';
import type { DatabaseStateApi } from './useDatabaseState';
import styles from './Database.module.css';

export function BoardView<T>({
  label,
  rows,
  rowKey,
  group,
  board,
  properties,
  card,
  db,
  onOpen,
  onNew,
  compact,
  medium,
  emptyText,
}: {
  label: string;
  rows: T[];
  rowKey: (row: T) => string;
  group: GroupDef<T>;
  board: BoardSpec<T>;
  properties: ColumnDef<T>[];
  card: CardSpec<T>;
  db: DatabaseStateApi;
  onOpen?: (row: T) => void;
  onNew?: (groupKey: string | null) => void;
  compact: boolean;
  medium: boolean;
  emptyText: string;
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ row: T; anchor: HTMLElement } | null>(null);
  const [columnMenu, setColumnMenu] = useState<{ key: string; anchor: HTMLElement } | null>(null);
  const hiddenGroups = db.view.hiddenGroups ?? [];

  // Columns: the group's own order first, then any other value seen.
  const columns = new Map<string, { key: string; label: string; rows: T[] }>();
  for (const key of group.order ?? []) columns.set(key, { key, label: key, rows: [] });
  for (const row of rows) {
    const { key, label: colLabel } = group.key(row);
    const col = columns.get(key) ?? { key, label: colLabel, rows: [] };
    col.label = colLabel;
    col.rows.push(row);
    columns.set(key, col);
  }
  const list = [...columns.values()].filter((c) => !hiddenGroups.includes(c.key));
  const byKey = new Map(rows.map((r) => [rowKey(r), r]));
  const shownKey = active && list.some((c) => c.key === active) ? active : (list[0]?.key ?? null);
  const matrix = Boolean(board.matrix) && medium && list.length === 4;

  async function move(row: T, toKey: string) {
    if (group.key(row).key === toKey || !board.onMove) return;
    setError(null);
    try {
      await board.onMove(row, toKey);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That card can’t move there.');
    }
  }

  function renderCard(row: T): ReactNode {
    const key = rowKey(row);
    return (
      <article
        key={key}
        className={styles.boardCard}
        draggable={!compact && Boolean(board.onMove)}
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', key);
          setDragging(key);
        }}
        onDragEnd={() => {
          setDragging(null);
          setOver(null);
        }}
        data-dragging={dragging === key || undefined}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('a, button, input')) return;
          onOpen?.(row);
        }}
      >
        {card.render ? (
          card.render(row, new Set(properties.map((c) => c.id)))
        ) : (
          <>
            <h3 className={styles.cardTitle} data-leading={card.leading ? true : undefined}>
              {card.leading?.(row)}
              <span>{card.title(row)}</span>
            </h3>
            {properties.length > 0 && (
              <dl className={styles.cardProps} data-bare={card.bare || undefined}>
                {properties.map((c) => {
                  const value = c.render ? c.render(row) : <DefaultCell column={c} value={c.value(row)} />;
                  if (card.bare && (value === null || value === undefined || value === '')) return null;
                  return (
                    <div key={c.id} className={styles.cardProp}>
                      <dt>{c.label}</dt>
                      <dd>{value}</dd>
                    </div>
                  );
                })}
              </dl>
            )}
          </>
        )}
        {(board.onMove || board.actions?.length) && (
          <button type="button" className={styles.boardMore} aria-label="Card actions" onClick={(e) => setMenu({ row, anchor: e.currentTarget })}>
            <MoreHorizontal size={15} strokeWidth={2} />
          </button>
        )}
      </article>
    );
  }

  if (!rows.length && !list.length) return <p className={styles.emptyCards}>{emptyText}</p>;

  const visibleColumns = list.filter((col) => !compact || col.key === shownKey);

  return (
    <div className={styles.boardWrap}>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {compact && (
        <div className={styles.boardSwitch} role="tablist" aria-label={`${label} columns`} data-even={list.length <= 4 || undefined}>
          {list.map((col) => (
            <button key={col.key} type="button" role="tab" aria-selected={col.key === shownKey} onClick={() => setActive(col.key)}>
              {col.label} <span>{col.rows.length}</span>
            </button>
          ))}
        </div>
      )}
      <div className={styles.board} aria-label={label} data-matrix={matrix || undefined} data-fill={board.fill || undefined}>
        {visibleColumns.map((col) => {
          const collapsed = !compact && db.view.collapsed.includes(col.key);
          const dot = board.dot?.(col.key);
          const hint = board.hint?.(col.key);
          return (
            <section
              key={col.key}
              className={styles.boardColumn}
              data-over={over === col.key || undefined}
              data-collapsed={collapsed || undefined}
              aria-label={col.label}
              onDragOver={(e) => {
                if (!board.onMove) return;
                e.preventDefault();
                setOver(col.key);
              }}
              onDragLeave={() => setOver((o) => (o === col.key ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                const row = dragging ? byKey.get(dragging) : undefined;
                setDragging(null);
                setOver(null);
                if (row) void move(row, col.key);
              }}
            >
              <header className={styles.boardHead}>
                {collapsed ? (
                  <button type="button" className={styles.boardExpand} onClick={() => db.toggleGroup(col.key)} aria-label={`Expand ${col.label}`}>
                    <ChevronRight size={14} strokeWidth={2.25} aria-hidden />
                  </button>
                ) : null}
                {dot && <span className={styles.boardDot} style={{ background: dot }} aria-hidden />}
                <span className={styles.groupLabel}>{col.label}</span>
                <span className={styles.groupCount}>{col.rows.length}</span>
                {!compact && (
                  <button type="button" className={styles.boardColumnMore} aria-label={`Options for ${col.label}`} onClick={(e) => setColumnMenu({ key: col.key, anchor: e.currentTarget })}>
                    <MoreHorizontal size={15} strokeWidth={2} />
                  </button>
                )}
                {hint && !collapsed && <span className={styles.boardHint}>{hint}</span>}
                {board.header && !collapsed && <div className={styles.boardFigures}>{board.header(col.key, col.rows)}</div>}
              </header>
              {!collapsed && (
                <div className={styles.boardCards}>
                  {col.rows.map(renderCard)}
                  {onNew ? (
                    <button type="button" className={styles.boardNew} onClick={() => onNew(col.key)}>
                      <Plus size={14} strokeWidth={2} aria-hidden /> New
                    </button>
                  ) : (
                    !col.rows.length && <p className={styles.boardEmpty}>Nothing here</p>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {columnMenu && (
        <Popover anchor={columnMenu.anchor} label="Column options" onClose={() => setColumnMenu(null)}>
          <div className={styles.menu}>
            <button
              type="button"
              className={styles.menuRow}
              data-row
              onClick={() => {
                db.toggleGroup(columnMenu.key);
                setColumnMenu(null);
              }}
            >
              {db.view.collapsed.includes(columnMenu.key) ? 'Expand' : 'Collapse'}
            </button>
            <button
              type="button"
              className={styles.menuRow}
              data-row
              onClick={() => {
                db.patchView({ hiddenGroups: [...hiddenGroups, columnMenu.key] });
                setColumnMenu(null);
              }}
            >
              Hide group
            </button>
            {hiddenGroups.length > 0 && (
              <button
                type="button"
                className={styles.menuRow}
                data-row
                onClick={() => {
                  db.patchView({ hiddenGroups: [] });
                  setColumnMenu(null);
                }}
              >
                Show hidden groups ({hiddenGroups.length})
              </button>
            )}
          </div>
        </Popover>
      )}

      {menu && (
        <Popover anchor={menu.anchor} label="Move to" onClose={() => setMenu(null)}>
          <div className={styles.menu}>
            {board.onMove && <p className={styles.menuTitle}>Move to</p>}
            {list
              .filter((col) => Boolean(board.onMove) && col.key !== group.key(menu.row).key)
              .map((col) => (
                <button
                  key={col.key}
                  type="button"
                  className={styles.menuRow}
                  data-row
                  onClick={() => {
                    const row = menu.row;
                    setMenu(null);
                    void move(row, col.key);
                  }}
                >
                  {col.label}
                </button>
              ))}
            {(board.actions ?? [])
              .filter((a) => !a.show || a.show(menu.row))
              .map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className={styles.menuRow}
                  data-row
                  onClick={async () => {
                    const row = menu.row;
                    setMenu(null);
                    setError(null);
                    try {
                      await a.run(row);
                    } catch (caught) {
                      setError(caught instanceof Error ? caught.message : 'Could not do that.');
                    }
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
          </div>
        </Popover>
      )}
    </div>
  );
}
