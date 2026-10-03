'use client';

// A database's Cards view: a responsive grid (2 columns on medium screens,
// 3 on expanded, 4 on large), grouped like the table with group headers
// spanning the grid. Each card shows the row's key properties — which ones
// is the view's "Properties" setting. Names wrap to two lines; amounts never
// truncate. A database can hand in its own card (the bucket card) instead.

import type { ReactNode } from 'react';
import { AlertCircle, ChevronDown } from 'lucide-react';
import { DefaultCell, type TableGroup } from './TableView';
import { formatNumber } from './format';
import type { ColumnDef } from './types';
import type { DatabaseStateApi } from './useDatabaseState';
import styles from './Database.module.css';

export interface CardSpec<T> {
  title: (row: T) => string;
  /** 0..1 (above 1 when over); null for no bar. */
  progress?: (row: T) => { value: number; over?: boolean } | null;
  /** Replaces the default card entirely. */
  render?: (row: T) => ReactNode;
}

export function CardsView<T>({
  label,
  rows,
  groups,
  rowKey,
  properties,
  card,
  db,
  subtotal,
  onOpen,
  emptyText,
}: {
  label: string;
  rows: T[];
  groups: TableGroup<T>[] | null;
  rowKey: (row: T) => string;
  /** The properties shown on each card, in order. */
  properties: ColumnDef<T>[];
  card: CardSpec<T>;
  db: DatabaseStateApi;
  subtotal?: ColumnDef<T>;
  onOpen?: (row: T) => void;
  emptyText: string;
}) {
  if (!rows.length) return <p className={styles.emptyCards}>{emptyText}</p>;
  const sections = groups ?? [{ key: '__all', label: '', rows }];
  return (
    <div className={styles.cardGrid} role="list" aria-label={label}>
      {sections.map((section) => {
        if (!section.rows.length) return null;
        const collapsed = groups !== null && db.state.collapsed.includes(section.key);
        return (
          <div key={section.key} className={styles.cardSection} role="presentation">
            {groups !== null && (
              <button type="button" className={styles.cardGroupHead} aria-expanded={!collapsed} onClick={() => db.toggleGroup(section.key)}>
                <ChevronDown size={14} strokeWidth={2.5} aria-hidden style={{ transform: collapsed ? 'rotate(-90deg)' : undefined }} />
                <span className={styles.groupLabel}>{section.label}</span>
                <span className={styles.groupCount}>{section.rows.length}</span>
                {subtotal && (
                  <span className={styles.groupTotal}>
                    {formatNumber(section.rows.reduce((s, r) => s + (Number(subtotal.value(r)) || 0), 0))}
                  </span>
                )}
              </button>
            )}
            {!collapsed &&
              section.rows.map((row) =>
                card.render ? (
                  <div key={rowKey(row)} role="listitem" className={styles.cardSlot}>
                    {card.render(row)}
                  </div>
                ) : (
                  <DefaultCard key={rowKey(row)} row={row} card={card} properties={properties} onOpen={onOpen} />
                )
              )}
          </div>
        );
      })}
    </div>
  );
}

function DefaultCard<T>({ row, card, properties, onOpen }: { row: T; card: CardSpec<T>; properties: ColumnDef<T>[]; onOpen?: (row: T) => void }) {
  const progress = card.progress?.(row) ?? null;
  return (
    // The whole card opens the row; the title is the keyboard target.
    // Cells may hold their own buttons (Mark paid), which don't open it.
    <article
      role="listitem"
      className={styles.card}
      data-clickable={onOpen ? true : undefined}
      onClick={(e) => {
        if (!onOpen || (e.target as HTMLElement).closest('a, button:not([data-card-title]), input')) return;
        onOpen(row);
      }}
    >
      <h3 className={styles.cardTitle}>
        {onOpen ? (
          <button type="button" data-card-title onClick={() => onOpen(row)}>
            {card.title(row)}
          </button>
        ) : (
          card.title(row)
        )}
      </h3>
      {progress && (
        <span className={styles.progressTrack} data-wide>
          <span style={{ width: `${Math.max(0, Math.min(1, progress.value)) * 100}%` }} data-over={progress.over || undefined} />
        </span>
      )}
      <dl className={styles.cardProps}>
        {properties.map((column) => {
          const tone = column.tone?.(row);
          return (
            <div key={column.id} className={styles.cardProp}>
              <dt>{column.label}</dt>
              <dd data-tone={tone === 'bad' ? 'bad' : undefined}>
                {tone === 'bad' && <AlertCircle size={13} strokeWidth={2.25} aria-hidden className={styles.toneIcon} />}
                {column.render ? column.render(row) : <DefaultCell column={column} value={column.value(row)} />}
              </dd>
            </div>
          );
        })}
      </dl>
    </article>
  );
}
