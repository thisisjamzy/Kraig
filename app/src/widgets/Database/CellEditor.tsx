'use client';

// The inline editor a table cell (or a property row) turns into when
// clicked, by type: a text or number box, a date picker, or a list of
// select chips. Enter saves, Escape cancels, Tab saves and moves on (the
// caller decides where), clicking away saves.

import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import type { FieldOption, FieldValue } from '@/src/shared/listQuery/engine';
import { Popover } from '@/src/widgets/ListQuery/Popover';
import { fromInputDate, toInputDate } from './format';
import type { CellType } from './types';
import styles from './Database.module.css';

export interface CellEditorProps {
  type: CellType;
  value: FieldValue;
  options?: FieldOption[];
  label: string;
  anchor: HTMLElement | null;
  onSave: (next: FieldValue) => void;
  onCancel: () => void;
  /** Tab / Shift+Tab: save, then the caller moves to the next cell. */
  onTab?: (back: boolean) => void;
}

export function CellEditor(props: CellEditorProps) {
  if (props.type === 'select' || props.type === 'relation') return <SelectEditor {...props} />;
  return <InputEditor {...props} />;
}

function InputEditor({ type, value, label, onSave, onCancel, onTab }: CellEditorProps) {
  const numeric = type === 'number' || type === 'currency';
  const [text, setText] = useState(() =>
    type === 'date' ? toInputDate(value) : value === null || value === undefined ? '' : String(value)
  );
  const done = useRef(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    if (type !== 'date') ref.current?.select();
  }, [type]);

  function parsed(): FieldValue {
    if (type === 'date') return fromInputDate(text);
    if (numeric) {
      const n = Number(text.replace(/[\s,]/g, ''));
      return text.trim() === '' || !Number.isFinite(n) ? null : n;
    }
    return text;
  }
  function save() {
    if (done.current) return;
    done.current = true;
    onSave(parsed());
  }

  return (
    <input
      ref={ref}
      className={styles.cellInput}
      data-numeric={numeric || undefined}
      type={type === 'date' ? 'date' : 'text'}
      inputMode={numeric ? 'decimal' : undefined}
      aria-label={label}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          save();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          done.current = true;
          onCancel();
        } else if (e.key === 'Tab' && onTab) {
          e.preventDefault();
          save();
          onTab(e.shiftKey);
        }
      }}
    />
  );
}

function SelectEditor({ value, options = [], label, anchor, onSave, onCancel }: CellEditorProps) {
  return (
    <Popover anchor={anchor} label={label} onClose={onCancel}>
      <div className={styles.menu} role="listbox" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="option"
            aria-selected={value === option.value}
            className={styles.menuRow}
            data-row
            onClick={() => onSave(option.value)}
          >
            <span className={styles.chip} style={option.color ? { background: option.color } : undefined}>
              {option.label}
            </span>
            {value === option.value && <Check size={14} strokeWidth={2.5} aria-hidden />}
          </button>
        ))}
      </div>
    </Popover>
  );
}
