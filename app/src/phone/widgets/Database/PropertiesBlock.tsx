'use client';

// A Notion page's properties: label and value rows under the title — the
// label muted on the left (160px), the value on the right, editable in
// place by clicking when the property allows it. An empty value reads
// "Empty" in light grey. On phones each label sits above its value, the
// first four show, and "Show more properties" opens the rest; editing
// there happens on the item page or in a sheet.

import { useState, type ReactNode } from 'react';
import { useLayout } from '@/src/shared/hooks/useLayout';
import { Plus } from 'lucide-react';
import type { FieldOption, FieldValue } from '@/src/shared/listQuery/engine';
import { CellEditor } from '@/src/phone/widgets/Database/CellEditor';
import { formatValue } from '@/src/widgets/Database/format';
import type { CellType } from '@/src/phone/widgets/Database/types';
import styles from '@/src/phone/widgets/Database/Database.module.css';

export interface Property {
  id: string;
  label: string;
  /** What's shown; when absent the edit value is formatted by type. */
  display?: ReactNode;
  empty?: boolean;
  edit?: {
    type: CellType;
    value: FieldValue;
    options?: FieldOption[];
    onSave: (next: FieldValue) => Promise<unknown> | void;
  };
}

export function PropertiesBlock({ properties, onAdd, label = 'Properties' }: { properties: Property[]; onAdd?: () => void; label?: string }) {
  const [editing, setEditing] = useState<{ id: string; anchor: HTMLElement } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const compact = useLayout().deviceClass === 'compact';
  const shown = compact && !all ? properties.slice(0, 4) : properties;

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
    <dl className={styles.properties} aria-label={label}>
      {shown.map((property) => {
        const isEditing = editing?.id === property.id;
        const text = property.display ?? (property.edit ? formatValue(property.edit.type, property.edit.value, property.edit.options) : null);
        const empty = property.empty ?? (text === null || text === '' || text === undefined);
        const inline = isEditing && property.edit && property.edit.type !== 'select' && property.edit.type !== 'relation';
        return (
          <div key={property.id} className={styles.property}>
            <dt>{property.label}</dt>
            <dd>
              {inline ? (
                <CellEditor
                  type={property.edit!.type}
                  value={property.edit!.value}
                  label={property.label}
                  anchor={editing.anchor}
                  onSave={(next) => save(property, next)}
                  onCancel={() => setEditing(null)}
                />
              ) : property.edit ? (
                <button
                  type="button"
                  className={styles.propertyValue}
                  data-editable
                  onClick={(e) => {
                    if (property.edit!.type === 'checkbox') void save(property, !property.edit!.value);
                    else setEditing({ id: property.id, anchor: e.currentTarget });
                  }}
                >
                  {empty ? <span className={styles.emptyValue}>Empty</span> : text}
                </button>
              ) : (
                <span className={styles.propertyValue}>{empty ? <span className={styles.emptyValue}>Empty</span> : text}</span>
              )}
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
            </dd>
          </div>
        );
      })}
      {compact && properties.length > 4 && (
        <button type="button" className={styles.moreProperties} onClick={() => setAll((a) => !a)}>
          {all ? 'Show fewer properties' : `Show more properties (${properties.length - 4})`}
        </button>
      )}
      {onAdd && (
        <button type="button" className={styles.addProperty} onClick={onAdd}>
          <Plus size={14} strokeWidth={2.25} aria-hidden />
          Add property
        </button>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </dl>
  );
}
