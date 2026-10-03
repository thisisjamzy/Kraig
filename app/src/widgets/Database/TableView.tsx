'use client';

// A database's Table view. Full width, scrolling sideways inside its own
// box (never the page) with the header row pinned; columns resizable (and
// remembered); 44px rows with a hover tint and an open icon that opens the
// row's peek; cells editable in place by type; collapsible groups with a
// count and subtotal and a "+ New" row each; a footer row of Notion-style
// calculations; a column menu (sort, filter, hide, move); and bulk select.
// Nothing ever truncates: names and amounts wrap or widen their column.

import { Fragment, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronDown,
  EyeOff,
  ListFilter,
  Maximize2,
  Plus,
  X,
} from 'lucide-react';
import { defaultOperator, newId, type FieldValue } from '@/src/shared/listQuery/engine';
import { Popover } from '@/src/widgets/ListQuery/Popover';
import { CellEditor } from './CellEditor';
import { CALC_LABEL, calculate, calcsFor, defaultCalc, fieldTypeOf, formatNumber, formatValue, fromInputDate } from './format';
import type { BulkAction, ColumnDef, GroupDef } from './types';
import type { DatabaseStateApi } from './useDatabaseState';
import styles from './Database.module.css';

export interface TableGroup<T> {
  key: string;
  label: string;
  rows: T[];
}

interface Editing {
  row: string;
  column: string;
  anchor: HTMLElement;
}

export function TableView<T>({
  label,
  rows,
  groups,
  rowKey,
  columns,
  db,
  group,
  subtotalColumn,
  onOpen,
  onNew,
  onCreate,
  bulkActions,
  emptyText,
}: {
  label: string;
  rows: T[];
  groups: TableGroup<T>[] | null;
  rowKey: (row: T) => string;
  /** Visible columns, in order. */
  columns: ColumnDef<T>[];
  db: DatabaseStateApi;
  group: GroupDef<T> | null;
  subtotalColumn?: string;
  onOpen?: (row: T) => void;
  onNew?: (groupKey: string | null) => void;
  onCreate?: (values: Record<string, FieldValue>, groupKey: string | null) => Promise<unknown>;
  bulkActions?: BulkAction<T>[];
  emptyText: string;
}) {
  const [editing, setEditing] = useState<Editing | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<{ column: string; anchor: HTMLElement; footer?: boolean } | null>(null);
  const [draft, setDraft] = useState<{ group: string | null; values: Record<string, string> } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bulk = Boolean(bulkActions?.length);
  const subtotalCol = columns.find((c) => c.id === subtotalColumn) ?? columns.find((c) => c.type === 'currency');

  const byKey = useMemo(() => new Map(rows.map((r) => [rowKey(r), r])), [rows, rowKey]);
  const selectedRows = [...selected].map((k) => byKey.get(k)).filter((r): r is T => Boolean(r));

  async function save(column: ColumnDef<T>, row: T, next: FieldValue) {
    setEditing(null);
    if (!column.edit) return;
    const before = column.value(row);
    if (before instanceof Date && next instanceof Date ? before.getTime() === next.getTime() : before === next) return;
    try {
      setError(null);
      await column.edit(row, next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save that.');
    }
  }

  function canEdit(column: ColumnDef<T>, row: T) {
    return Boolean(column.edit) && (column.editable ? column.editable(row) : true);
  }

  function startEdit(column: ColumnDef<T>, row: T, anchor: HTMLElement) {
    if (!canEdit(column, row)) return;
    if (column.type === 'checkbox') {
      void save(column, row, !column.value(row));
      return;
    }
    setEditing({ row: rowKey(row), column: column.id, anchor });
  }

  /** Tab: the next editable cell in the same row. */
  function moveEdit(row: T, from: string, back: boolean) {
    const editable = columns.filter((c) => canEdit(c, row) && c.type !== 'checkbox');
    const index = editable.findIndex((c) => c.id === from);
    const next = editable[index + (back ? -1 : 1)];
    if (!next) return setEditing(null);
    const cell = document.querySelector<HTMLElement>(`[data-cell="${CSS.escape(`${rowKey(row)}::${next.id}`)}"]`);
    if (cell) setEditing({ row: rowKey(row), column: next.id, anchor: cell });
  }

  function toggleRow(key: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function runBulk(action: BulkAction<T>) {
    setBusy(true);
    setError(null);
    try {
      await action.run(selectedRows);
      setSelected(new Set());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not do that.');
    } finally {
      setBusy(false);
    }
  }

  async function createDraft() {
    if (!draft || !onCreate) return;
    const values: Record<string, FieldValue> = {};
    for (const column of columns.filter((c) => c.newRow)) {
      const text = draft.values[column.id] ?? '';
      values[column.id] =
        column.type === 'date' ? fromInputDate(text) : column.type === 'currency' || column.type === 'number' ? (text.trim() ? Number(text.replace(/[\s,]/g, '')) : null) : text.trim();
    }
    setBusy(true);
    setError(null);
    try {
      await onCreate(values, draft.group);
      setDraft({ group: draft.group, values: {} });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not add that.');
    } finally {
      setBusy(false);
    }
  }

  // Column resizing: drag the header's right edge.
  const resizing = useRef<{ column: string; startX: number; startWidth: number } | null>(null);
  function startResize(e: React.PointerEvent, column: ColumnDef<T>) {
    e.preventDefault();
    e.stopPropagation();
    const th = (e.currentTarget as HTMLElement).parentElement!;
    resizing.current = { column: column.id, startX: e.clientX, startWidth: th.getBoundingClientRect().width };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onResize(e: React.PointerEvent) {
    const r = resizing.current;
    if (!r) return;
    db.setWidth(r.column, Math.max(64, Math.round(r.startWidth + e.clientX - r.startX)));
  }
  function endResize() {
    resizing.current = null;
  }

  const widthOf = (column: ColumnDef<T>) => db.state.widths[column.id] ?? column.width ?? (column.type === 'text' ? 200 : 128);
  const calcOf = (column: ColumnDef<T>) => db.state.calcs[column.id] ?? column.calc ?? defaultCalc(column.type);
  const sortDir = (column: ColumnDef<T>) => db.query.sorts.find((s) => s.field === column.id)?.dir;
  const sections: TableGroup<T>[] = groups ?? [{ key: '__all', label: '', rows }];
  const colSpan = columns.length + (bulk ? 1 : 0);
  const menuColumn = menu ? columns.find((c) => c.id === menu.column) : undefined;

  function cell(row: T, column: ColumnDef<T>): ReactNode {
    const tone = column.tone?.(row);
    const content = column.render ? column.render(row) : <DefaultCell column={column} value={column.value(row)} />;
    return (
      <span className={styles.cellContent} data-tone={tone === 'bad' ? 'bad' : undefined}>
        {tone === 'bad' && <AlertCircle size={14} strokeWidth={2.25} aria-hidden className={styles.toneIcon} />}
        {content}
      </span>
    );
  }

  return (
    <div className={styles.tableWrap}>
      {bulk && selected.size > 0 && (
        <div className={styles.bulkBar} role="toolbar" aria-label="Selected rows">
          <span>
            {selected.size} selected
          </span>
          {bulkActions!.map((action) => {
            const Icon = action.icon;
            return (
              <button key={action.id} type="button" className={styles.bulkButton} data-danger={action.danger || undefined} disabled={busy} onClick={() => runBulk(action)}>
                {Icon && <Icon size={14} strokeWidth={2.25} aria-hidden />}
                {action.label}
              </button>
            );
          })}
          <button type="button" className={styles.iconButton} aria-label="Clear selection" onClick={() => setSelected(new Set())}>
            <X size={15} strokeWidth={2.25} />
          </button>
        </div>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.scroll}>
        <table className={styles.table} aria-label={label}>
          <colgroup>
            {bulk && <col style={{ width: 40 }} />}
            {columns.map((column) => (
              <col key={column.id} style={{ width: widthOf(column) }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {bulk && (
                <th className={styles.checkCell}>
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    checked={rows.length > 0 && selected.size === rows.length}
                    onChange={(e) => setSelected(e.target.checked ? new Set(rows.map(rowKey)) : new Set())}
                  />
                </th>
              )}
              {columns.map((column) => (
                <th key={column.id} style={{ minWidth: widthOf(column) }} data-align={isNumeric(column) ? 'right' : undefined} aria-sort={sortDir(column) === 'asc' ? 'ascending' : sortDir(column) === 'desc' ? 'descending' : undefined}>
                  <button type="button" className={styles.headButton} onClick={(e) => setMenu({ column: column.id, anchor: e.currentTarget })}>
                    {column.label}
                    {sortDir(column) === 'asc' && <ArrowUp size={12} strokeWidth={2.5} aria-hidden />}
                    {sortDir(column) === 'desc' && <ArrowDown size={12} strokeWidth={2.5} aria-hidden />}
                  </button>
                  <span
                    className={styles.resizer}
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={`Resize ${column.label}`}
                    onPointerDown={(e) => startResize(e, column)}
                    onPointerMove={onResize}
                    onPointerUp={endResize}
                    onPointerCancel={endResize}
                  />
                </th>
              ))}
            </tr>
          </thead>
          {rows.length === 0 && !draft && (
            <tbody>
              <tr>
                <td colSpan={colSpan} className={styles.emptyCell}>
                  {emptyText}
                </td>
              </tr>
            </tbody>
          )}
          {sections.map((section) => {
            const collapsed = groups !== null && db.state.collapsed.includes(section.key);
            if (groups !== null && section.rows.length === 0 && draft?.group !== section.key) return null;
            return (
              <tbody key={section.key}>
                {groups !== null && group && (
                  <tr className={styles.groupRow}>
                    <td colSpan={colSpan}>
                      <button type="button" className={styles.groupButton} aria-expanded={!collapsed} onClick={() => db.toggleGroup(section.key)}>
                        <ChevronDown size={14} strokeWidth={2.5} aria-hidden style={{ transform: collapsed ? 'rotate(-90deg)' : undefined }} />
                        <span className={styles.groupLabel}>{section.label}</span>
                        <span className={styles.groupCount}>{section.rows.length}</span>
                        {subtotalCol && <span className={styles.groupTotal}>{formatNumber(sumOf(section.rows, subtotalCol))}</span>}
                      </button>
                    </td>
                  </tr>
                )}
                {!collapsed &&
                  section.rows.map((row) => {
                    const key = rowKey(row);
                    return (
                      <tr key={key} className={styles.row} data-selected={selected.has(key) || undefined}>
                        {bulk && (
                          <td className={styles.checkCell}>
                            <input type="checkbox" aria-label="Select row" checked={selected.has(key)} onChange={() => toggleRow(key)} />
                          </td>
                        )}
                        {columns.map((column, index) => {
                          const isEditing = editing?.row === key && editing.column === column.id;
                          return (
                            <td
                              key={column.id}
                              data-cell={`${key}::${column.id}`}
                              data-align={isNumeric(column) ? 'right' : undefined}
                              data-editable={canEdit(column, row) || undefined}
                              onClick={(e) => {
                                if ((e.target as HTMLElement).closest('a, button, input')) return;
                                startEdit(column, row, e.currentTarget);
                              }}
                            >
                              {index === 0 && onOpen && (
                                <button type="button" className={styles.openButton} aria-label="Open" onClick={() => onOpen(row)}>
                                  <Maximize2 size={13} strokeWidth={2.25} />
                                  <span>Open</span>
                                </button>
                              )}
                              {isEditing && column.type !== 'select' && column.type !== 'relation' ? (
                                <CellEditor
                                  type={column.type}
                                  value={column.value(row)}
                                  options={column.options}
                                  label={column.label}
                                  anchor={editing.anchor}
                                  onSave={(next) => save(column, row, next)}
                                  onCancel={() => setEditing(null)}
                                  onTab={(back) => moveEdit(row, column.id, back)}
                                />
                              ) : (
                                cell(row, column)
                              )}
                              {isEditing && (column.type === 'select' || column.type === 'relation') && (
                                <CellEditor
                                  type={column.type}
                                  value={column.value(row)}
                                  options={column.options}
                                  label={column.label}
                                  anchor={editing.anchor}
                                  onSave={(next) => save(column, row, next)}
                                  onCancel={() => setEditing(null)}
                                />
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                {!collapsed && draft && draft.group === (groups ? section.key : null) && (
                  <tr className={styles.draftRow}>
                    {bulk && <td className={styles.checkCell} />}
                    {columns.map((column, index) => (
                      <td key={column.id} data-align={isNumeric(column) ? 'right' : undefined}>
                        {column.newRow ? (
                          <input
                            className={styles.cellInput}
                            data-numeric={isNumeric(column) || undefined}
                            autoFocus={index === 0}
                            type={column.type === 'date' ? 'date' : 'text'}
                            inputMode={isNumeric(column) ? 'decimal' : undefined}
                            aria-label={`New ${column.label}`}
                            placeholder={column.type === 'date' ? undefined : column.label}
                            value={draft.values[column.id] ?? ''}
                            onChange={(e) => setDraft({ ...draft, values: { ...draft.values, [column.id]: e.target.value } })}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                void createDraft();
                              } else if (e.key === 'Escape') {
                                setDraft(null);
                              }
                            }}
                          />
                        ) : null}
                      </td>
                    ))}
                  </tr>
                )}
                {!collapsed && (onNew || onCreate) && (
                  <tr className={styles.newRow}>
                    <td colSpan={colSpan}>
                      <button
                        type="button"
                        className={styles.newRowButton}
                        disabled={busy}
                        onClick={() => {
                          const groupKey = groups ? section.key : null;
                          if (onCreate) setDraft({ group: groupKey, values: {} });
                          else onNew?.(groupKey);
                        }}
                      >
                        <Plus size={14} strokeWidth={2.25} aria-hidden />
                        New
                      </button>
                      {draft && draft.group === (groups ? section.key : null) && (
                        <span className={styles.draftHint}>Enter saves · Tab moves to the next cell · Esc cancels</span>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            );
          })}
          <tfoot>
            <tr>
              {bulk && <td className={styles.checkCell} />}
              {columns.map((column) => {
                const calc = calcOf(column);
                const text = calculate(calc, rows.map((r) => column.value(r)));
                return (
                  <td key={column.id} data-align={isNumeric(column) ? 'right' : undefined}>
                    <button type="button" className={styles.calcButton} onClick={(e) => setMenu({ column: column.id, anchor: e.currentTarget, footer: true })}>
                      {calc === 'none' ? (
                        <span className={styles.calcHint}>Calculate</span>
                      ) : (
                        <>
                          <span className={styles.calcLabel}>{CALC_LABEL[calc]}</span> {text}
                        </>
                      )}
                    </button>
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>

      {menu && menuColumn && menu.footer && (
        <Popover anchor={menu.anchor} label={`Calculate ${menuColumn.label}`} onClose={() => setMenu(null)}>
          <div className={styles.menu}>
            {calcsFor(menuColumn.type).map((calc) => (
              <button
                key={calc}
                type="button"
                className={styles.menuRow}
                data-row
                aria-pressed={calcOf(menuColumn) === calc}
                onClick={() => {
                  db.setCalc(menuColumn.id, calc);
                  setMenu(null);
                }}
              >
                {CALC_LABEL[calc]}
              </button>
            ))}
          </div>
        </Popover>
      )}

      {menu && menuColumn && !menu.footer && (
        <Popover anchor={menu.anchor} label={menuColumn.label} onClose={() => setMenu(null)}>
          <div className={styles.menu}>
            {!menuColumn.noQuery && (
              <>
                <MenuRow icon={ArrowUp} label="Sort ascending" onClick={() => { db.setQuery((q) => ({ ...q, sorts: [{ id: newId('s'), field: menuColumn.id, dir: 'asc' }] })); setMenu(null); }} />
                <MenuRow icon={ArrowDown} label="Sort descending" onClick={() => { db.setQuery((q) => ({ ...q, sorts: [{ id: newId('s'), field: menuColumn.id, dir: 'desc' }] })); setMenu(null); }} />
                <MenuRow
                  icon={ListFilter}
                  label="Filter"
                  onClick={() => {
                    db.setQuery((q) => ({ ...q, filters: [...q.filters, { id: newId(), kind: 'rule', field: menuColumn.id, op: defaultOperator(fieldTypeOf(menuColumn.type)), value: null }] }));
                    setMenu(null);
                  }}
                />
              </>
            )}
            <MenuRow icon={EyeOff} label="Hide" onClick={() => { hideColumn(db, menuColumn.id); setMenu(null); }} />
            <MenuRow icon={ArrowLeft} label="Move left" onClick={() => { moveColumn(db, columns, menuColumn.id, -1); setMenu(null); }} />
            <MenuRow icon={ArrowRight} label="Move right" onClick={() => { moveColumn(db, columns, menuColumn.id, 1); setMenu(null); }} />
          </div>
        </Popover>
      )}
    </div>
  );
}

function MenuRow({ icon: Icon, label, onClick }: { icon: typeof ArrowUp; label: string; onClick: () => void }) {
  return (
    <button type="button" className={styles.menuRow} data-row onClick={onClick}>
      <Icon size={14} strokeWidth={2.25} aria-hidden />
      {label}
    </button>
  );
}

function isNumeric<T>(column: ColumnDef<T>) {
  return column.type === 'currency' || column.type === 'number';
}

function sumOf<T>(rows: T[], column: ColumnDef<T>) {
  return rows.reduce((s, r) => {
    const v = column.value(r);
    return s + (typeof v === 'number' ? v : 0);
  }, 0);
}

function hideColumn(db: DatabaseStateApi, id: string) {
  db.patch((s) => ({ hidden: [...new Set([...(s.hidden ?? []), id])] }));
}

function moveColumn<T>(db: DatabaseStateApi, visible: ColumnDef<T>[], id: string, delta: number) {
  const order = visible.map((c) => c.id);
  const index = order.indexOf(id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= order.length) return;
  [order[index], order[target]] = [order[target], order[index]];
  db.patch({ order });
}

/** A cell with no custom render: the value formatted by type. */
export function DefaultCell<T>({ column, value }: { column: ColumnDef<T>; value: FieldValue }) {
  if (column.type === 'checkbox') {
    return <input type="checkbox" checked={value === true} readOnly tabIndex={-1} aria-label={column.label} className={styles.checkbox} />;
  }
  if (column.type === 'progress' && typeof value === 'number') {
    return (
      <span className={styles.progressCell}>
        <span className={styles.progressTrack}>
          <span style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} data-over={value > 1 || undefined} />
        </span>
        <span>{Math.round(value * 100)}%</span>
      </span>
    );
  }
  const text = formatValue(column.type, value, column.options);
  if (!text) return <span className={styles.emptyValue}>Empty</span>;
  if (column.type === 'select' || column.type === 'relation') {
    const option = column.options?.find((o) => o.value === value);
    return (
      <span className={styles.chip} style={option?.color ? { background: option.color } : undefined}>
        {text}
      </span>
    );
  }
  return <Fragment>{text}</Fragment>;
}
