'use client';

// The database toolbar's two view menus.
//   ViewSelector: "▦ Cards ▾" — the saved views (pick one; rename,
//   duplicate or delete each), "+ Add view" (name it, choose Table, Cards,
//   List or Board). On phones it also opens View settings.
//   ViewSettings (sliders): layout; which properties show, in what order
//   (eye toggles, drag to reorder, Show all / Hide all); card size, preview
//   and fit; table wrap, row numbers and frozen first column; group by,
//   hide empty groups, collapse or expand all; footer calculations; and
//   the load limit. Everything is saved per view.

import { useState, type DragEvent } from 'react';
import { ChevronDown, Copy, Eye, EyeOff, GripVertical, Kanban, LayoutGrid, List, MoreHorizontal, Pencil, Plus, SlidersHorizontal, Table2, Trash2 } from 'lucide-react';
import { Popover } from '@/src/widgets/ListQuery/Popover';
import { CALC_LABEL, calcsFor, defaultCalc } from '@/src/widgets/Database/format';
import type { ColumnDef, GroupDef, Layout, ViewConfig } from '@/src/phone/widgets/Database/types';
import type { DatabaseStateApi } from '@/src/phone/widgets/Database/useDatabaseState';
import styles from '@/src/phone/widgets/Database/Database.module.css';

export const LAYOUT_ICON: Record<Layout, typeof Table2> = { table: Table2, cards: LayoutGrid, list: List, board: Kanban };
const LAYOUT_LABEL: Record<Layout, string> = { table: 'Table', cards: 'Cards', list: 'List', board: 'Board' };
const LAYOUTS: Layout[] = ['table', 'cards', 'list', 'board'];

export function ViewSelector({
  db,
  compact,
  onSettings,
  boardAvailable,
}: {
  db: DatabaseStateApi;
  compact: boolean;
  onSettings: (anchor: HTMLElement) => void;
  boardAvailable: boolean;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [mode, setMode] = useState<'list' | 'add' | { rename: string }>('list');
  const [name, setName] = useState('');
  const [layout, setLayout] = useState<Layout>('table');
  const [rowMenu, setRowMenu] = useState<{ id: string; anchor: HTMLElement } | null>(null);
  const Icon = LAYOUT_ICON[db.view.layout];
  const close = () => {
    setAnchor(null);
    setMode('list');
    setRowMenu(null);
  };

  return (
    <>
      <button type="button" className={styles.viewButton} aria-haspopup="menu" onClick={(e) => setAnchor(e.currentTarget)} aria-label={`View: ${db.view.name}`}>
        <Icon size={15} strokeWidth={2} aria-hidden />
        <span className={styles.viewName}>{db.view.name}</span>
        <ChevronDown size={14} strokeWidth={2} aria-hidden />
      </button>
      {anchor && (
        <Popover anchor={anchor} label="Views" onClose={close}>
          {mode === 'list' && (
            <div className={styles.menu} role="menu">
              {db.views.map((v) => {
                const VIcon = LAYOUT_ICON[v.layout];
                return (
                  <div key={v.id} className={styles.menuRowWrap}>
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={v.id === db.view.id}
                      className={styles.menuRow}
                      data-row
                      onClick={() => {
                        db.select(v.id);
                        close();
                      }}
                    >
                      <VIcon size={15} strokeWidth={2} aria-hidden />
                      <span className={styles.menuLabel}>{v.name}</span>
                    </button>
                    <button type="button" className={styles.menuIcon} aria-label={`Options for ${v.name}`} onClick={(e) => setRowMenu({ id: v.id, anchor: e.currentTarget })}>
                      <MoreHorizontal size={15} strokeWidth={2} />
                    </button>
                  </div>
                );
              })}
              <hr className={styles.menuDivider} />
              <button type="button" className={styles.menuRow} data-row onClick={() => setMode('add')}>
                <Plus size={15} strokeWidth={2} aria-hidden /> Add view
              </button>
              {compact && (
                <button
                  type="button"
                  className={styles.menuRow}
                  data-row
                  onClick={(e) => {
                    const target = e.currentTarget;
                    close();
                    onSettings(target);
                  }}
                >
                  <SlidersHorizontal size={15} strokeWidth={2} aria-hidden /> View settings
                </button>
              )}
            </div>
          )}
          {mode === 'add' && (
            <form
              className={styles.menu}
              onSubmit={(e) => {
                e.preventDefault();
                db.addView(name.trim() || LAYOUT_LABEL[layout], layout);
                setName('');
                close();
              }}
            >
              <p className={styles.menuTitle}>New view</p>
              <input className={styles.menuInput} autoFocus placeholder="View name" value={name} onChange={(e) => setName(e.target.value)} aria-label="View name" />
              <div className={styles.segmented} role="radiogroup" aria-label="Layout">
                {LAYOUTS.filter((l) => l !== 'board' || boardAvailable).map((l) => (
                  <button key={l} type="button" role="radio" aria-checked={layout === l} onClick={() => setLayout(l)}>
                    {LAYOUT_LABEL[l]}
                  </button>
                ))}
              </div>
              <button type="submit" className={styles.newButton} data-block>
                Add view
              </button>
            </form>
          )}
          {typeof mode === 'object' && (
            <form
              className={styles.menu}
              onSubmit={(e) => {
                e.preventDefault();
                if (name.trim()) db.renameView(mode.rename, name.trim());
                close();
              }}
            >
              <p className={styles.menuTitle}>Rename view</p>
              <input className={styles.menuInput} autoFocus value={name} onChange={(e) => setName(e.target.value)} aria-label="View name" />
              <button type="submit" className={styles.newButton} data-block>
                Save
              </button>
            </form>
          )}
        </Popover>
      )}
      {rowMenu && (
        <Popover anchor={rowMenu.anchor} label="View options" onClose={() => setRowMenu(null)}>
          <div className={styles.menu}>
            <button
              type="button"
              className={styles.menuRow}
              data-row
              onClick={() => {
                setName(db.views.find((v) => v.id === rowMenu.id)?.name ?? '');
                setMode({ rename: rowMenu.id });
                setRowMenu(null);
              }}
            >
              <Pencil size={15} strokeWidth={2} aria-hidden /> Rename
            </button>
            <button
              type="button"
              className={styles.menuRow}
              data-row
              onClick={() => {
                db.duplicateView(rowMenu.id);
                close();
              }}
            >
              <Copy size={15} strokeWidth={2} aria-hidden /> Duplicate
            </button>
            <button
              type="button"
              className={styles.menuRow}
              data-row
              data-danger
              disabled={db.views.length <= 1}
              onClick={() => {
                db.deleteView(rowMenu.id);
                close();
              }}
            >
              <Trash2 size={15} strokeWidth={2} aria-hidden /> Delete
            </button>
          </div>
        </Popover>
      )}
    </>
  );
}

export function ViewSettings<T>({
  anchor,
  onClose,
  db,
  columns,
  groups,
  isHidden,
  boardAvailable,
  groupKeys,
}: {
  anchor: HTMLElement;
  /** The current groups' keys, for Collapse all. */
  groupKeys: string[];
  onClose: () => void;
  db: DatabaseStateApi;
  /** Every property, in the view's order. */
  columns: ColumnDef<T>[];
  groups: GroupDef<T>[];
  isHidden: (c: ColumnDef<T>) => boolean;
  boardAvailable: boolean;
}) {
  const v = db.view;
  const [dragging, setDragging] = useState<string | null>(null);
  const setHidden = (hidden: string[]) => db.patchView({ hidden });
  const hiddenIds = columns.filter(isHidden).map((c) => c.id);

  function onDrop(e: DragEvent, target: string) {
    e.preventDefault();
    if (!dragging || dragging === target) return;
    const ids = columns.map((c) => c.id).filter((id) => id !== dragging);
    ids.splice(ids.indexOf(target), 0, dragging);
    db.patchView({ order: ids });
    setDragging(null);
  }
  function move(id: string, delta: number) {
    const ids = columns.map((c) => c.id);
    const i = ids.indexOf(id);
    const j = i + delta;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    db.patchView({ order: ids });
  }

  return (
    <Popover anchor={anchor} label="View settings" wide onClose={onClose}>
      <div className={styles.menu}>
        <p className={styles.menuTitle}>Layout</p>
        <div className={styles.segmented} role="radiogroup" aria-label="Layout">
          {LAYOUTS.filter((l) => l !== 'board' || boardAvailable).map((l) => {
            const Icon = LAYOUT_ICON[l];
            return (
              <button key={l} type="button" role="radio" aria-checked={v.layout === l} onClick={() => db.patchView({ layout: l })}>
                <Icon size={14} strokeWidth={2} aria-hidden /> {LAYOUT_LABEL[l]}
              </button>
            );
          })}
        </div>

        <div className={styles.menuHead}>
          <p className={styles.menuTitle}>Properties</p>
          <span>
            <button type="button" className={styles.textLink} onClick={() => setHidden([])}>
              Show all
            </button>
            <button type="button" className={styles.textLink} onClick={() => setHidden(columns.slice(1).map((c) => c.id))}>
              Hide all
            </button>
          </span>
        </div>
        <ul className={styles.propList}>
          {columns.map((c, index) => {
            const hidden = hiddenIds.includes(c.id) && index > 0;
            return (
              <li
                key={c.id}
                draggable
                onDragStart={() => setDragging(c.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => onDrop(e, c.id)}
                onDragEnd={() => setDragging(null)}
                data-dragging={dragging === c.id || undefined}
                className={styles.propRow}
                onKeyDown={(e) => {
                  if (e.altKey && e.key === 'ArrowUp') move(c.id, -1);
                  if (e.altKey && e.key === 'ArrowDown') move(c.id, 1);
                }}
              >
                <GripVertical size={14} strokeWidth={2} aria-hidden className={styles.grip} />
                <span className={styles.menuLabel} data-muted={hidden || undefined}>
                  {c.label}
                </span>
                <button
                  type="button"
                  className={styles.menuIcon}
                  disabled={index === 0}
                  aria-label={hidden ? `Show ${c.label}` : `Hide ${c.label}`}
                  aria-pressed={!hidden}
                  onClick={() => setHidden(hidden ? hiddenIds.filter((id) => id !== c.id) : [...hiddenIds, c.id])}
                >
                  {hidden ? <EyeOff size={15} strokeWidth={2} /> : <Eye size={15} strokeWidth={2} />}
                </button>
              </li>
            );
          })}
        </ul>

        {v.layout === 'cards' && (
          <>
            <p className={styles.menuTitle}>Cards</p>
            <Choice label="Card size" value={v.cardSize} options={[['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']]} onChange={(cardSize) => db.patchView({ cardSize })} />
            <Choice label="Card preview" value={v.cardPreview} options={[['none', 'None'], ['progress', 'Progress bar'], ['chart', 'Mini chart']]} onChange={(cardPreview) => db.patchView({ cardPreview })} />
            <Choice label="Fit properties" value={v.fitProperties} options={[['wrap', 'Wrap'], ['truncate', 'Truncate']]} onChange={(fitProperties) => db.patchView({ fitProperties })} />
          </>
        )}
        {v.layout === 'table' && (
          <>
            <p className={styles.menuTitle}>Table</p>
            <Toggle label="Wrap cells" on={v.wrapCells} onChange={(wrapCells) => db.patchView({ wrapCells })} />
            <Toggle label="Show row numbers" on={v.rowNumbers} onChange={(rowNumbers) => db.patchView({ rowNumbers })} />
            <Toggle label="Freeze first column" on={v.freezeFirst} onChange={(freezeFirst) => db.patchView({ freezeFirst })} />
          </>
        )}

        {groups.length > 0 && (
          <>
            <p className={styles.menuTitle}>Group</p>
            <label className={styles.selectRow}>
              <span>Group by</span>
              <select value={v.group} onChange={(e) => db.patchView({ group: e.target.value, collapsed: [] })}>
                <option value="none">None</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </select>
            </label>
            {v.group !== 'none' && (
              <>
                <Toggle label="Hide empty groups" on={v.hideEmptyGroups} onChange={(hideEmptyGroups) => db.patchView({ hideEmptyGroups })} />
                <div className={styles.menuHead}>
                  <button type="button" className={styles.textLink} onClick={() => db.patchView({ collapsed: groupKeys })}>
                    Collapse all
                  </button>
                  <button type="button" className={styles.textLink} onClick={() => db.patchView({ collapsed: [] })}>
                    Expand all
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {columns.some((c) => c.type === 'currency' || c.type === 'number' || c.type === 'checkbox') && (
          <>
            <p className={styles.menuTitle}>Calculations</p>
            {columns
              .filter((c) => c.type === 'currency' || c.type === 'number' || c.type === 'checkbox')
              .map((c) => (
                <label key={c.id} className={styles.selectRow}>
                  <span>{c.label}</span>
                  <select value={v.calcs[c.id] ?? c.calc ?? defaultCalc(c.type)} onChange={(e) => db.setCalc(c.id, e.target.value as never)}>
                    {calcsFor(c.type).map((calc) => (
                      <option key={calc} value={calc}>
                        {CALC_LABEL[calc]}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
          </>
        )}

        <p className={styles.menuTitle}>Load limit</p>
        <div className={styles.segmented} role="radiogroup" aria-label="Load limit">
          {[25, 50, 100, 0].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={v.limit === n} onClick={() => db.patchView({ limit: n })}>
              {n === 0 ? 'All' : n}
            </button>
          ))}
        </div>
      </div>
    </Popover>
  );
}

function Choice<V extends string>({ label, value, options, onChange }: { label: string; value: V; options: [V, string][]; onChange: (v: V) => void }) {
  return (
    <label className={styles.selectRow}>
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as V)}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className={styles.selectRow}>
      <span>{label}</span>
      <input type="checkbox" role="switch" checked={on} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export type { ViewConfig };
