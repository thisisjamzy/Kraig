'use client';

// A database's Board view: one column per value of the board's group
// (Coverage on Priorities, the month on the planning board), side by side
// and scrolling sideways inside the board when they don't fit. Cards drag
// between columns; the database can refuse a move (its message shows). On
// a phone, one column at a time with a switcher above it, and cards move
// with "Move to..." in their menu.

import { useState, type ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Popover } from '@/src/widgets/ListQuery/Popover';
import { DefaultCell } from '@/src/phone/widgets/Database/TableView';
import type { CardSpec } from '@/src/phone/widgets/Database/CardsView';
import type { BoardSpec, ColumnDef, GroupDef } from '@/src/phone/widgets/Database/types';
import styles from '@/src/phone/widgets/Database/Database.module.css';

export function BoardView<T>({
  label,
  rows,
  rowKey,
  group,
  board,
  properties,
  card,
  onOpen,
  compact,
  emptyText,
}: {
  label: string;
  rows: T[];
  rowKey: (row: T) => string;
  group: GroupDef<T>;
  board: BoardSpec<T>;
  properties: ColumnDef<T>[];
  card: CardSpec<T>;
  onOpen?: (row: T) => void;
  compact: boolean;
  emptyText: string;
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ row: T; anchor: HTMLElement } | null>(null);

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
  const list = [...columns.values()];
  const byKey = new Map(rows.map((r) => [rowKey(r), r]));
  const shownKey = active && columns.has(active) ? active : (list[0]?.key ?? null);

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
        onDragStart={() => setDragging(key)}
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
          card.render(row)
        ) : (
          <>
            <h3 className={styles.cardTitle}>{card.title(row)}</h3>
            <dl className={styles.cardProps}>
              {properties.map((c) => (
                <div key={c.id} className={styles.cardProp}>
                  <dt>{c.label}</dt>
                  <dd>{c.render ? c.render(row) : <DefaultCell column={c} value={c.value(row)} />}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
        {board.onMove && (
          <button type="button" className={styles.boardMore} aria-label="Card actions" onClick={(e) => setMenu({ row, anchor: e.currentTarget })}>
            <MoreHorizontal size={15} strokeWidth={2} />
          </button>
        )}
      </article>
    );
  }

  if (!rows.length && !list.length) return <p className={styles.emptyCards}>{emptyText}</p>;

  return (
    <div className={styles.boardWrap}>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {compact && (
        <div className={styles.boardSwitch} role="tablist" aria-label={`${label} columns`}>
          {list.map((col) => (
            <button key={col.key} type="button" role="tab" aria-selected={col.key === shownKey} onClick={() => setActive(col.key)}>
              {col.label} <span>{col.rows.length}</span>
            </button>
          ))}
        </div>
      )}
      <div className={styles.board} aria-label={label}>
        {list
          .filter((col) => !compact || col.key === shownKey)
          .map((col) => (
            <section
              key={col.key}
              className={styles.boardColumn}
              data-over={over === col.key || undefined}
              aria-label={col.label}
              onDragOver={(e) => {
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
                <span className={styles.groupLabel}>{col.label}</span>
                <span className={styles.groupCount}>{col.rows.length}</span>
                {board.header && <div className={styles.boardFigures}>{board.header(col.key, col.rows)}</div>}
              </header>
              <div className={styles.boardCards}>
                {col.rows.map(renderCard)}
                {!col.rows.length && <p className={styles.boardEmpty}>Nothing here</p>}
              </div>
            </section>
          ))}
      </div>

      {menu && (
        <Popover anchor={menu.anchor} label="Move to" onClose={() => setMenu(null)}>
          <div className={styles.menu}>
            <p className={styles.menuTitle}>Move to</p>
            {list
              .filter((col) => col.key !== group.key(menu.row).key)
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
