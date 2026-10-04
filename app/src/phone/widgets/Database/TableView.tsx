'use client';

// A database's Table view (medium screens and up; phones get the List
// rendering). Full width, scrolling sideways inside its own box (never the
// page) with the header row pinned and, by default, the first column
// frozen; columns resizable (remembered per view); 40px rows with a hover
// tint, an "Open" button and the row's actions on hover (and in its "..."
// menu); text truncates with the full value on hover unless the view wraps
// cells; numbers are right-aligned and never truncate; empty cells stay
// blank. Cells edit in place by type; collapsible groups with a count and
// subtotal and a "+ New" row each; a footer of Notion-style calculations; a
// column menu (sort, filter, hide, move); bulk select.

import { Fragment, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronDown, EyeOff, ListFilter, Maximize2, MoreHorizontal, Plus, X } from 'lucide-react';
import { defaultOperator, newId, type FieldValue } from '@/src/shared/listQuery/engine';
import { Popover } from '@/src/widgets/ListQuery/Popover';
import { CellEditor } from '@/src/phone/widgets/Database/CellEditor';
import { CALC_LABEL, calculate, calcsFor, defaultCalc, fieldTypeOf, formatNumber, formatValue, fromInputDate } from '@/src/widgets/Database/format';
import type { BulkAction, ColumnDef, GroupDef, RowAction } from '@/src/phone/widgets/Database/types';
import type { DatabaseStateApi } from '@/src/phone/widgets/Database/useDatabaseState';
import styles from '@/src/phone/widgets/Database/Database.module.css';

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

export function isCollapsed(db: DatabaseStateApi, key: string) {
  return db.view.collapsed.includes(key);
}

export function TableView<T>({
  label,
  rows,
  allRows,
  groups,
  rowKey,
  columns,
  allColumns,
  db,
  group,
  subtotalColumn,
  onOpen,
  onNew,
  onCreate,
  bulkActions,
  rowActions,
  emptyText,
  more,
}: {
  label: string;
  /** The rows on screen (after the load limit). */
  rows: T[];
  /** Every row the view matches, for footer calculations. */
  allRows: T[];
  groups: TableGroup<T>[] | null;
  rowKey: (row: T) => string;
  /** Visible columns, in order. */
  columns: ColumnDef<T>[];
  /** Every column in order (moving uses it). */
  allColumns: ColumnDef<T>[];
  db: DatabaseStateApi;
  group: GroupDef<T> | null;
  subtotalColumn?: string;
  onOpen?: (row: T) => void;
  onNew?: (groupKey: string | null) => void;
  onCreate?: (values: Record<string, FieldValue>, groupKey: string | null) => Promise<unknown>;
  bulkActions?: BulkAction<T>[];
  rowActions?: RowAction<T>[];
  emptyText: string;
  more: ReactNode;
}) {
  const view = db.view;
  const [editing, setEditing] = useState<Editing | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<{ column: string; anchor: HTMLElement; footer?: boolean } | null>(null);
  const [rowMenu, setRowMenu] = useState<{ row: T; anchor: HTMLElement } | null>(null);
  const [draft, setDraft] = useState<{ group: string | null; values: Record<string, string> } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bulk = Boolean(bulkActions?.length);
  const subtotalCol = columns.find((c) => c.id === subtotalColumn) ?? columns.find((c) => c.type === 'currency');

  const byKey = useMemo(() => new Map(rows.map((r) => [rowKey(r), r])), [rows, rowKey]);
  const selectedRows = [...selected].map((k) => byKey.get(k)).filter((r): r is T => Boolean(r));

  async function run(action: () => Promise<unknown> | void) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not do that.');
    } finally {
      setBusy(false);
    }
  }

  async function save(column: ColumnDef<T>, row: T, next: FieldValue) {
    setEditing(null);
    if (!column.edit) return;
    const before = column.value(row);
    if (before instanceof Date && next instanceof Date ? before.getTime() === next.getTime() : before === next) return;
    await run(() => column.edit!(row, next));
  }

  const canEdit = (column: ColumnDef<T>, row: T) => Boolean(column.edit) && (column.editable ? column.editable(row) : true);

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

  async function createDraft() {
    if (!draft || !onCreate) return;
    const values: Record<string, FieldValue> = {};
    for (const column of columns.filter((c) => c.newRow)) {
      const text = draft.values[column.id] ?? '';
      values[column.id] =
        column.type === 'date' ? fromInputDate(text) : column.type === 'currency' || column.type === 'number' ? (text.trim() ? Number(text.replace(/[\s,]/g, '')) : null) : text.trim();
    }
    await run(async () => {
      await onCreate(values, draft.group);
      setDraft({ group: draft.group, values: {} });
    });
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

  const widthOf = (column: ColumnDef<T>) => view.widths[column.id] ?? column.width ?? (column.type === 'text' ? 200 : 128);
  const calcOf = (column: ColumnDef<T>) => view.calcs[column.id] ?? column.calc ?? defaultCalc(column.type);
  const sortDir = (column: ColumnDef<T>) => view.query.sorts.find((s) => s.field === column.id)?.dir;
  const sections: TableGroup<T>[] = groups ?? [{ key: '__all', label: '', rows }];
  const lead = (bulk ? 1 : 0) + (view.rowNumbers ? 1 : 0);
  // Where the frozen first column sits: after the checkbox and number columns.
  const leadWidth = (bulk ? 40 : 0) + (view.rowNumbers ? 44 : 0);
  const colSpan = columns.length + lead;
  const menuColumn = menu ? columns.find((c) => c.id === menu.column) : undefined;
  const numeric = (c: ColumnDef<T>) => c.type === 'currency' || c.type === 'number';
  const frozen = view.freezeFirst;
  let rowNumber = 0;

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

  function tooltipOf(row: T, column: ColumnDef<T>) {
    if (column.tooltip) return column.tooltip(row);
    const text = formatValue(column.type, column.value(row), column.options);
    return text || undefined;
  }

  const visibleActions = (row: T) => (rowActions ?? []).filter((a) => !a.show || a.show(row));

  return (
    <div className={styles.tableWrap}>
      {bulk && selected.size > 0 && (
        <div className={styles.bulkBar} role="toolbar" aria-label="Selected rows">
          <span>{selected.size} selected</span>
          {bulkActions!.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                type="button"
                className={styles.bulkButton}
                data-danger={action.danger || undefined}
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await action.run(selectedRows);
                    setSelected(new Set());
                  })
                }
              >
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
        <table className={styles.table} aria-label={label} data-wrap={view.wrapCells || undefined} data-frozen={frozen || undefined}>
          <colgroup>
            {bulk && <col style={{ width: 40 }} />}
            {view.rowNumbers && <col style={{ width: 44 }} />}
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
              {view.rowNumbers && <th className={styles.numCell} aria-label="Row" />}
              {columns.map((column, index) => (
                <th
                  key={column.id}
                  style={{ width: widthOf(column), left: index === 0 && frozen ? leadWidth : undefined }}
                  data-first={index === 0 || undefined}
                  data-align={numeric(column) ? 'right' : undefined}
                  aria-sort={sortDir(column) === 'asc' ? 'ascending' : sortDir(column) === 'desc' ? 'descending' : undefined}
                >
                  <button type="button" className={styles.headButton} onClick={(e) => setMenu({ column: column.id, anchor: e.currentTarget })}>
                    <span className={styles.headLabel}>{column.label}</span>
                    {sortDir(column) === 'asc' && <ArrowUp size={12} strokeWidth={2.5} aria-hidden />}
                    {sortDir(column) === 'desc' && <ArrowDown size={12} strokeWidth={2.5} aria-hidden />}
                  </button>
                  <span
                    className={styles.resizer}
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={`Resize ${column.label}`}
                    onPointerDown={(e) => startResize(e, column)}
                    onPointerMove={(e) => {
                      const r = resizing.current;
                      if (r) db.setWidth(r.column, Math.max(64, Math.round(r.startWidth + e.clientX - r.startX)));
                    }}
                    onPointerUp={() => {
                      resizing.current = null;
                    }}
                    onPointerCancel={() => {
                      resizing.current = null;
                    }}
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
            const collapsed = groups !== null && isCollapsed(db, section.key);
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
                    rowNumber += 1;
                    const actions = visibleActions(row);
                    return (
                      <tr key={key} className={styles.row} data-selected={selected.has(key) || undefined}>
                        {bulk && (
                          <td className={styles.checkCell}>
                            <input type="checkbox" aria-label="Select row" checked={selected.has(key)} onChange={() => toggleRow(key)} />
                          </td>
                        )}
                        {view.rowNumbers && <td className={styles.numCell}>{rowNumber}</td>}
                        {columns.map((column, index) => {
                          const isEditing = editing?.row === key && editing.column === column.id;
                          const select = column.type === 'select' || column.type === 'relation';
                          return (
                            <td
                              key={column.id}
                              data-cell={`${key}::${column.id}`}
                              data-first={index === 0 || undefined}
                              style={index === 0 && frozen ? { left: leadWidth } : undefined}
                              data-align={numeric(column) ? 'right' : undefined}
                              data-editable={canEdit(column, row) || undefined}
                              title={!numeric(column) && !view.wrapCells ? tooltipOf(row, column) : undefined}
                              onClick={(e) => {
                                if ((e.target as HTMLElement).closest('a, button, input')) return;
                                startEdit(column, row, e.currentTarget);
                              }}
                            >
                              {index === 0 && (onOpen || actions.length > 0) && (
                                <span className={styles.rowHover}>
                                  {actions.map((a) => {
                                    const Icon = a.icon;
                                    return (
                                      <button key={a.id} type="button" className={styles.hoverButton} onClick={() => run(() => a.run(row))} disabled={busy}>
                                        {Icon && <Icon size={13} strokeWidth={2.25} aria-hidden />}
                                        <span>{a.label}</span>
                                      </button>
                                    );
                                  })}
                                  {onOpen && (
                                    <button type="button" className={styles.hoverButton} aria-label="Open" onClick={() => onOpen(row)}>
                                      <Maximize2 size={13} strokeWidth={2.25} />
                                      <span>Open</span>
                                    </button>
                                  )}
                                  {actions.length > 0 && (
                                    <button type="button" className={styles.hoverButton} aria-label="More actions" onClick={(e) => setRowMenu({ row, anchor: e.currentTarget })}>
                                      <MoreHorizontal size={13} strokeWidth={2.25} />
                                    </button>
                                  )}
                                </span>
                              )}
                              {isEditing && !select ? (
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
                              {isEditing && select && (
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
                    {view.rowNumbers && <td className={styles.numCell} />}
                    {columns.map((column, index) => (
                      <td key={column.id} data-align={numeric(column) ? 'right' : undefined} data-first={index === 0 || undefined}>
                        {column.newRow ? (
                          <input
                            className={styles.cellInput}
                            data-numeric={numeric(column) || undefined}
                            autoFocus={index === 0}
                            type={column.type === 'date' ? 'date' : 'text'}
                            inputMode={numeric(column) ? 'decimal' : undefined}
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
              {view.rowNumbers && <td className={styles.numCell} />}
              {columns.map((column, index) => {
                const calc = calcOf(column);
                const text = calculate(calc, allRows.map((r) => column.value(r)));
                return (
                  <td key={column.id} data-align={numeric(column) ? 'right' : undefined} data-first={index === 0 || undefined} style={index === 0 && frozen ? { left: leadWidth } : undefined}>
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
      {more}

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
                <MenuRow icon={ArrowUp} label="Sort ascending" onClick={() => { db.patchView((v) => ({ sortPreset: null, query: { ...v.query, sorts: [{ id: newId('s'), field: menuColumn.id, dir: 'asc' }] } })); setMenu(null); }} />
                <MenuRow icon={ArrowDown} label="Sort descending" onClick={() => { db.patchView((v) => ({ sortPreset: null, query: { ...v.query, sorts: [{ id: newId('s'), field: menuColumn.id, dir: 'desc' }] } })); setMenu(null); }} />
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
            <MenuRow icon={EyeOff} label="Hide" onClick={() => { db.patchView((v) => ({ hidden: [...new Set([...(v.hidden ?? allColumns.filter((c) => c.hidden).map((c) => c.id)), menuColumn.id])] })); setMenu(null); }} />
            <MenuRow icon={ArrowLeft} label="Move left" onClick={() => { moveColumn(db, allColumns, menuColumn.id, -1); setMenu(null); }} />
            <MenuRow icon={ArrowRight} label="Move right" onClick={() => { moveColumn(db, allColumns, menuColumn.id, 1); setMenu(null); }} />
          </div>
        </Popover>
      )}

      {rowMenu && (
        <Popover anchor={rowMenu.anchor} label="Row actions" onClose={() => setRowMenu(null)}>
          <div className={styles.menu}>
            {visibleActions(rowMenu.row).map((a) => {
              const Icon = a.icon ?? MoreHorizontal;
              return (
                <MenuRow
                  key={a.id}
                  icon={Icon}
                  label={a.label}
                  onClick={() => {
                    const row = rowMenu.row;
                    setRowMenu(null);
                    void run(() => a.run(row));
                  }}
                />
              );
            })}
            {onOpen && <MenuRow icon={Maximize2} label="Open" onClick={() => { const row = rowMenu.row; setRowMenu(null); onOpen(row); }} />}
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

function sumOf<T>(rows: T[], column: ColumnDef<T>) {
  return rows.reduce((s, r) => {
    const v = column.value(r);
    return s + (typeof v === 'number' ? v : 0);
  }, 0);
}

function moveColumn<T>(db: DatabaseStateApi, all: ColumnDef<T>[], id: string, delta: number) {
  const order = all.map((c) => c.id);
  const index = order.indexOf(id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= order.length) return;
  [order[index], order[target]] = [order[target], order[index]];
  db.patchView({ order });
}

/** A cell with no custom render: the value formatted by type; blank when empty. */
export function DefaultCell<T>({ column, value }: { column: ColumnDef<T>; value: FieldValue }) {
  if (column.type === 'checkbox') {
    return <input type="checkbox" checked={value === true} readOnly tabIndex={-1} aria-label={column.label} className={styles.checkbox} />;
  }
  if (column.type === 'progress') {
    if (typeof value !== 'number') return null;
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
  if (!text) return null;
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
