'use client';

// A page's properties as a grid of tiles under its title: the label on top
// (small, muted, sentence case), the value below (18px semibold, 16px on
// phones), an optional sub-line. Tiles are colored by meaning, always with
// the label: money in (pale blue), money out (navy value), on track (pale
// green), watch (pale amber), a problem (pale red), neutral otherwise.
// Select and status values come in as chips inside a neutral tile. A
// progress value is a compact bar (at most 200px) with its percentage.
//
// The column count comes from the space the block has, not the screen
// (a container query): one column of label and value rows under 560px (a
// side peek always), then 2, 3 and 4 tiles as it widens. `columns` fixes
// it. Values wrap at spaces, never mid-word. The first 8 show, the rest behind "Show N more properties". Clicking an
// editable tile opens its editor (a popover, a bottom sheet on phones).

import { isValidElement, useState, type ReactNode } from 'react';
import { AlertTriangle, CircleAlert } from 'lucide-react';
import type { FieldOption, FieldValue } from '@/src/shared/listQuery/engine';
import { CellEditor } from './CellEditor';
import { formatValue } from './format';
import type { CellType } from './types';
import styles from './PropertiesGrid.module.css';
import { useWebOnly } from '@/src/shared/device/useWebOnly';

export type PropertyTone = 'neutral' | 'in' | 'out' | 'good' | 'watch' | 'bad';

export interface Property {
  id: string;
  label: string;
  /** What's shown; when absent the edit value is formatted by type. */
  display?: ReactNode;
  empty?: boolean;
  /** The tile's color by meaning (default neutral). */
  tone?: PropertyTone;
  /** A small line under the value ("of 1,013,381 expected"). */
  sub?: ReactNode;
  /** 0 to 1: drawn as a compact bar with its percentage. */
  progress?: number;
  /** Shown before the label. */
  icon?: ReactNode;
  /** A tooltip for the whole tile. */
  title?: string;
  edit?: {
    type: CellType;
    value: FieldValue;
    options?: FieldOption[];
    onSave: (next: FieldValue) => Promise<unknown> | void;
  };
}

const VISIBLE = 8;

/** A compact progress bar with its percentage ("63%"), never full width. */
export function CompactProgress({ value, tone }: { value: number; tone?: PropertyTone }) {
  const pct = Math.round(Math.max(0, value) * 100);
  return (
    <span className={styles.progress} data-tone={tone}>
      <span className={styles.progressTrack} role="img" aria-label={`${pct}%`}>
        <span style={{ width: `${Math.min(100, pct)}%` }} />
      </span>
      <span className={styles.progressPct}>{pct}%</span>
    </span>
  );
}

/** A figure, shown in the mono KPI style; anything else stays in the body font. */
function isFigure(display: ReactNode): boolean {
  if (typeof display === 'number') return true;
  if (isValidElement(display) && typeof (display.props as { value?: unknown }).value === 'number') return true;
  if (typeof display === 'string') return /^[\s+\-−]*[\d][\d,.\s]*(%|h|m|[A-Z]{3})?(\s.*)?$/.test(display) && !/[a-z]{4,}/.test(display);
  return false;
}

export function PropertiesGrid({
  properties,
  label = 'Properties',
  visible = VISIBLE,
  layout = 'tiles',
  columns,
  compact,
}: {
  properties: Property[];
  label?: string;
  /** Tiles shown before "Show more properties". */
  visible?: number;
  /** tiles: KPI cards (pages); list: label and value rows (side panels). */
  layout?: 'tiles' | 'list';
  /** A fixed column count; by default it follows the block's own width. */
  columns?: number;
  /** The task panel's tighter rows (Dreda.figcraft `Task / Detail panel`). */
  compact?: boolean;
}) {
  useWebOnly('PropertiesGrid');
  const [editing, setEditing] = useState<{ id: string; anchor: HTMLElement } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const shown = all ? properties : properties.slice(0, visible);

  async function save(property: Property, next: FieldValue) {
    setEditing(null);
    if (!property.edit) return;
    try {
      setError(null);
      await property.edit.onSave(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save that.');
    }
  }

  return (
    <div className={styles.wrap} data-layout={layout === 'list' || columns === 1 ? 'list' : 'tiles'} data-compact={compact || undefined}>
      <dl className={styles.grid} style={columns && columns > 1 ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined} aria-label={label}>
        {shown.map((property) => {
          const isEditing = editing?.id === property.id;
          const text =
            property.display ??
            (property.progress !== undefined ? <CompactProgress value={property.progress} tone={property.tone} /> : property.edit ? formatValue(property.edit.type, property.edit.value, property.edit.options) : null);
          const empty = property.empty ?? (text === null || text === '' || text === undefined);
          const inline = isEditing && property.edit && property.edit.type !== 'select' && property.edit.type !== 'relation';
          // Warning and problem values carry an icon (the tile stays white).
          const toneIcon =
            !empty && !property.icon && (property.tone === 'bad' || property.tone === 'watch') ? (
              <span className={styles.toneIcon} aria-hidden>
                {property.tone === 'bad' ? <CircleAlert size={15} strokeWidth={2.25} /> : <AlertTriangle size={15} strokeWidth={2.25} />}
              </span>
            ) : null;
          const value = empty ? (
            <span className={styles.empty}>Empty</span>
          ) : (
            <>
              {toneIcon}
              {text}
            </>
          );
          const body = (
            <>
              <dt className={styles.label}>
                {property.icon && <span className={styles.icon}>{property.icon}</span>}
                {property.label}
              </dt>
              <dd className={styles.value}>
                {inline ? (
                  <CellEditor
                    type={property.edit!.type}
                    value={property.edit!.value}
                    label={property.label}
                    anchor={editing.anchor}
                    onSave={(next) => save(property, next)}
                    onCancel={() => setEditing(null)}
                  />
                ) : (
                  value
                )}
              </dd>
              {property.sub && <dd className={styles.sub}>{property.sub}</dd>}
            </>
          );
          return (
            <div key={property.id} className={styles.tile} data-tone={property.tone ?? 'neutral'} data-figure={isFigure(property.display) || undefined} title={property.title}>
              {property.edit && !inline ? (
                <button
                  type="button"
                  className={styles.editable}
                  aria-label={`${property.label}: edit`}
                  onClick={(e) => {
                    if (property.edit!.type === 'checkbox') void save(property, !property.edit!.value);
                    else setEditing({ id: property.id, anchor: e.currentTarget });
                  }}
                />
              ) : null}
              {body}
              {isEditing && property.edit && (property.edit.type === 'select' || property.edit.type === 'relation') && (
                <CellEditor
                  type={property.edit.type}
                  value={property.edit.value}
                  options={property.edit.options}
                  label={property.label}
                  anchor={editing.anchor}
                  onSave={(next) => save(property, next)}
                  onCancel={() => setEditing(null)}
                />
              )}
            </div>
          );
        })}
      </dl>
      {properties.length > visible && (
        <button type="button" className={styles.more} onClick={() => setAll((a) => !a)}>
          {all ? 'Show fewer properties' : visible < VISIBLE ? 'Show more properties' : `Show ${properties.length - visible} more ${properties.length - visible === 1 ? 'property' : 'properties'}`}
        </button>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** The same grid; kept under its older name for existing pages. */
export function PropertiesBlock({
  properties,
  label,
  visible,
  layout,
  columns,
  compact,
}: {
  properties: Property[];
  onAdd?: () => void;
  label?: string;
  visible?: number;
  layout?: 'tiles' | 'list';
  columns?: number;
  compact?: boolean;
}) {
  return <PropertiesGrid properties={properties} label={label} visible={visible} layout={layout} columns={columns} compact={compact} />;
}
