'use client';

// A chart block (Insights and dashboards): square, a 1px border, 20px of
// padding. Its header asks a question, with a status chip on the right and
// a one-sentence summary; then the visual and a caption. "Show table" under
// the chart shows the same data as a small table. "..." on the block:
// expand to full width (or back), view the data, hide the block; a drag
// handle reorders blocks. On phones, secondary visuals sit behind
// "Show more" so a block stays short.

import { useState, type DragEvent, type ReactNode } from 'react';
import { GripVertical, MoreHorizontal } from 'lucide-react';
import { useLayout } from '@/src/shared/hooks/useLayout';
import { Popover } from '@/src/widgets/ListQuery/Popover';
import styles from './ChartBlock.module.css';

export interface BlockTable {
  columns: string[];
  rows: (string | number)[][];
}

export type BlockStatus = { label: string; tone: 'good' | 'watch' | 'bad' | 'neutral' } | null;

export function ChartBlock({
  id,
  title,
  status,
  summary,
  caption,
  table,
  wide,
  onToggleWide,
  onHide,
  more,
  empty,
  onDragStart,
  onDrop,
  children,
}: {
  id: string;
  title: string;
  status?: BlockStatus;
  summary?: string | null;
  caption?: ReactNode;
  table?: BlockTable | null;
  wide?: boolean;
  onToggleWide?: () => void;
  onHide?: () => void;
  /** Secondary visuals: behind "Show more" on phones. */
  more?: ReactNode;
  /** A one-line empty state instead of the visual. */
  empty?: string | null;
  onDragStart?: (id: string) => void;
  onDrop?: (id: string) => void;
  children?: ReactNode;
}) {
  const compact = useLayout().deviceClass === 'compact';
  const [showTable, setShowTable] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [menu, setMenu] = useState<HTMLElement | null>(null);

  return (
    <section
      className={styles.block}
      aria-label={title}
      onDragOver={(e: DragEvent) => onDrop && e.preventDefault()}
      onDrop={(e: DragEvent) => {
        e.preventDefault();
        onDrop?.(id);
      }}
    >
      <header className={styles.head}>
        {onDragStart && !compact && (
          <span className={styles.grip} draggable onDragStart={() => onDragStart(id)} aria-label="Drag to reorder" role="button" tabIndex={-1}>
            <GripVertical size={14} strokeWidth={2} />
          </span>
        )}
        <h2 className={styles.title}>{title}</h2>
        {status && (
          <span className={styles.chip} data-tone={status.tone}>
            {status.label}
          </span>
        )}
        {(onToggleWide || onHide || table) && (
          <button type="button" className={styles.more} aria-label={`Options for ${title}`} onClick={(e) => setMenu(e.currentTarget)}>
            <MoreHorizontal size={16} strokeWidth={2} />
          </button>
        )}
      </header>
      {summary && <p className={styles.summary}>{summary}</p>}
      {empty ? (
        <p className={styles.empty}>{empty}</p>
      ) : (
        <>
          <div className={styles.visual}>{children}</div>
          {more && (!compact || showMore) && <div className={styles.visual}>{more}</div>}
          {more && compact && (
            <button type="button" className={styles.toggle} onClick={() => setShowMore((s) => !s)}>
              {showMore ? 'Show less' : 'Show more'}
            </button>
          )}
          {caption && <p className={styles.caption}>{caption}</p>}
          {table && table.rows.length > 0 && (
            <>
              <button type="button" className={styles.toggle} aria-expanded={showTable} onClick={() => setShowTable((s) => !s)}>
                {showTable ? 'Hide table' : 'Show table'}
              </button>
              {showTable && (
                <div className={styles.tableScroll}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        {table.columns.map((c, i) => (
                          <th key={c} data-num={i > 0 || undefined}>
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {table.rows.map((row, r) => (
                        <tr key={r}>
                          {row.map((cell, i) => (
                            <td key={i} data-num={typeof cell === 'number' || undefined}>
                              {typeof cell === 'number' ? Math.round(cell).toLocaleString('en-US') : cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      )}

      {menu && (
        <Popover anchor={menu} label={title} onClose={() => setMenu(null)}>
          <div className={styles.menu}>
            {onToggleWide && !compact && (
              <button
                type="button"
                className={styles.menuRow}
                data-row
                onClick={() => {
                  onToggleWide();
                  setMenu(null);
                }}
              >
                {wide ? 'Normal width' : 'Expand to full width'}
              </button>
            )}
            {table && table.rows.length > 0 && (
              <button
                type="button"
                className={styles.menuRow}
                data-row
                onClick={() => {
                  setShowTable(true);
                  setMenu(null);
                }}
              >
                View data
              </button>
            )}
            {onHide && (
              <button
                type="button"
                className={styles.menuRow}
                data-row
                onClick={() => {
                  onHide();
                  setMenu(null);
                }}
              >
                Hide block
              </button>
            )}
          </div>
        </Popover>
      )}
    </section>
  );
}
