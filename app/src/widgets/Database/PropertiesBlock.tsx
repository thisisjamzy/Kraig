'use client';

// A page's properties as a grid of tiles under its title: the label on top
// (small, muted, sentence case), the value below (18px semibold, 16px on
// phones), an optional sub-line. Tiles are colored by meaning, always with
// the label: money in (pale blue), money out (navy value), on track (pale
// green), watch (pale amber), a problem (pale red), neutral otherwise.
// Select and status values come in as chips inside a neutral tile. A
// progress value is a compact bar (at most 200px) with its percentage.
//
// 4 columns on large screens, 3 on expanded, 2 on medium and phones; the
// first 8 tiles show, the rest behind "Show N more properties". Clicking an
// editable tile opens its editor (a popover, a bottom sheet on phones).

import { useState, type ReactNode } from 'react';
import { useLayout } from '@/src/shared/hooks/useLayout';
import type { FieldOption, FieldValue } from '@/src/shared/listQuery/engine';
import { CellEditor } from './CellEditor';
import { formatValue } from './format';
import type { CellType } from './types';
import styles from './PropertiesGrid.module.css';

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

export function PropertiesGrid({ properties, label = 'Properties' }: { properties: Property[]; label?: string }) {
  const [editing, setEditing] = useState<{ id: string; anchor: HTMLElement } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const { deviceClass } = useLayout();
  const columns = deviceClass === 'large' ? 4 : deviceClass === 'expanded' ? 3 : 2;
  const shown = all ? properties : properties.slice(0, VISIBLE);

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
    <div className={styles.wrap}>
      <dl className={styles.grid} style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }} aria-label={label}>
        {shown.map((property) => {
          const isEditing = editing?.id === property.id;
          const text =
            property.display ??
            (property.progress !== undefined ? <CompactProgress value={property.progress} tone={property.tone} /> : property.edit ? formatValue(property.edit.type, property.edit.value, property.edit.options) : null);
          const empty = property.empty ?? (text === null || text === '' || text === undefined);
          const inline = isEditing && property.edit && property.edit.type !== 'select' && property.edit.type !== 'relation';
          const value = empty ? <span className={styles.empty}>Empty</span> : text;
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
            <div key={property.id} className={styles.tile} data-tone={property.tone ?? 'neutral'} title={property.title}>
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
      {properties.length > VISIBLE && (
        <button type="button" className={styles.more} onClick={() => setAll((a) => !a)}>
          {all ? 'Show fewer properties' : `Show ${properties.length - VISIBLE} more ${properties.length - VISIBLE === 1 ? 'property' : 'properties'}`}
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
export function PropertiesBlock({ properties, label }: { properties: Property[]; onAdd?: () => void; label?: string }) {
  return <PropertiesGrid properties={properties} label={label} />;
}
