'use client';

// A database's Cards view: a grid whose column count follows the space it
// has (container queries: 1, 2, 3 or 4 columns, one more for small cards
// and one fewer for large), grouped like the table with group headers
// spanning the grid. Square cards with a 1px border; cards in a row share a
// height. Each card shows the properties chosen in View settings, in that
// order, wrapped or truncated; its preview is none, a progress bar or a
// mini chart. A database can hand in its own card (the bucket card).

import type { ReactNode } from 'react';
import { AlertCircle, ChevronDown } from 'lucide-react';
import { DefaultCell, isCollapsed, type TableGroup } from '@/src/phone/widgets/Database/TableView';
import { formatNumber } from '@/src/widgets/Database/format';
import type { ColumnDef } from '@/src/phone/widgets/Database/types';
import type { DatabaseStateApi } from '@/src/phone/widgets/Database/useDatabaseState';
import styles from '@/src/phone/widgets/Database/Database.module.css';

export interface CardSpec<T> {
  title: (row: T) => string;
  /** 0..1 (above 1 when over); null for no bar. */
  progress?: (row: T) => { value: number; over?: boolean } | null;
  /** Mini chart values (e.g. the last months); falls back to the progress bar. */
  chart?: (row: T) => number[] | null;
  /** A strip along the card's bottom edge (the one action it needs). */
  footer?: (row: T) => ReactNode;
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
  more,
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
  more: ReactNode;
}) {
  if (!rows.length) return <p className={styles.emptyCards}>{emptyText}</p>;
  const view = db.view;
  const sections = groups ?? [{ key: '__all', label: '', rows }];
  return (
    <div className={styles.cardGridWrap}>
      <div className={styles.cardGrid} role="list" aria-label={label} data-size={view.cardSize}>
        {sections.map((section) => {
          if (!section.rows.length) return null;
          const collapsed = groups !== null && isCollapsed(db, section.key);
          return (
            <div key={section.key} className={styles.cardSection} role="presentation">
              {groups !== null && (
                <button type="button" className={styles.cardGroupHead} aria-expanded={!collapsed} onClick={() => db.toggleGroup(section.key)}>
                  <ChevronDown size={14} strokeWidth={2.5} aria-hidden style={{ transform: collapsed ? 'rotate(-90deg)' : undefined }} />
                  <span className={styles.groupLabel}>{section.label}</span>
                  <span className={styles.groupCount}>{section.rows.length}</span>
                  {subtotal && <span className={styles.groupTotal}>{formatNumber(section.rows.reduce((s, r) => s + (Number(subtotal.value(r)) || 0), 0))}</span>}
                </button>
              )}
              {!collapsed &&
                section.rows.map((row) =>
                  card.render ? (
                    <div key={rowKey(row)} role="listitem" className={styles.cardSlot}>
                      {card.render(row)}
                    </div>
                  ) : (
                    <DefaultCard key={rowKey(row)} row={row} card={card} properties={properties} onOpen={onOpen} preview={view.cardPreview} fit={view.fitProperties} />
                  )
                )}
            </div>
          );
        })}
      </div>
      {more}
    </div>
  );
}

function MiniChart({ values }: { values: number[] }) {
  const max = Math.max(1, ...values.map((v) => Math.abs(v)));
  return (
    <span className={styles.miniChart} aria-hidden>
      {values.map((v, i) => (
        <span key={i} style={{ height: `${Math.max(6, (Math.abs(v) / max) * 100)}%` }} data-last={i === values.length - 1 || undefined} />
      ))}
    </span>
  );
}

function DefaultCard<T>({
  row,
  card,
  properties,
  onOpen,
  preview,
  fit,
}: {
  row: T;
  card: CardSpec<T>;
  properties: ColumnDef<T>[];
  onOpen?: (row: T) => void;
  preview: 'none' | 'progress' | 'chart';
  fit: 'wrap' | 'truncate';
}) {
  const progress = preview !== 'none' ? (card.progress?.(row) ?? null) : null;
  const chart = preview === 'chart' ? (card.chart?.(row) ?? null) : null;
  return (
    // The whole card opens the row; the title is the keyboard target.
    // Cells may hold their own buttons (Mark paid), which don't open it.
    <article
      role="listitem"
      className={styles.card}
      data-clickable={onOpen ? true : undefined}
      data-fit={fit}
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
      {chart && chart.length > 1 ? (
        <MiniChart values={chart} />
      ) : (
        progress && (
          <span className={styles.progressTrack} data-wide>
            <span style={{ width: `${Math.max(0, Math.min(1, progress.value)) * 100}%` }} data-over={progress.over || undefined} />
          </span>
        )
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
      {card.footer?.(row)}
    </article>
  );
}
