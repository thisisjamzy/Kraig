'use client';

// A Notion-style database: one list of rows, described once by its columns,
// viewed as a full Table or a grid of Cards. Above it, Notion-style view
// tabs ("Table", "Cards", the list's own built-in views such as "Unpaid",
// and the household's saved views; "+" saves a new one) with the toolbar
// on their right: the shared filter, sort and search (src/widgets/
// ListQuery), Group, Properties, and a primary "New" with a menu of
// templates. Each view keeps its own filters, sorts and search; widths,
// grouping, calculations and card properties are remembered per database
// (useDatabaseState). Used by the Budget, Buckets and Bucket pages, and
// built to be reused on other pages next.

import { useMemo, useState, type ReactNode } from 'react';
import { Check, ChevronDown, LayoutGrid, Plus, Rows3, SlidersHorizontal, Table2, X } from 'lucide-react';
import { applyQuery, newId, type FieldDef, type FieldValue } from '@/src/shared/listQuery/engine';
import { ListQueryBar, ListQueryEmpty } from '@/src/widgets/ListQuery/ListQueryBar';
import { Popover } from '@/src/widgets/ListQuery/Popover';
import { CardsView, type CardSpec } from './CardsView';
import { TableView, type TableGroup } from './TableView';
import { fieldTypeOf } from './format';
import { useDatabaseState } from './useDatabaseState';
import type { BulkAction, ColumnDef, GroupDef, NewTemplate, PresetView } from './types';
import styles from './Database.module.css';

const DEFAULT_PRESETS = [
  { id: 'table', name: 'Table', layout: 'table' as const },
  { id: 'cards', name: 'Cards', layout: 'cards' as const },
];

export interface DatabaseProps<T> {
  /** Remembers this database's views and settings under this id. */
  id: string;
  label: string;
  noun: [string, string];
  rows: T[];
  rowKey: (row: T) => string;
  columns: ColumnDef<T>[];
  /** Built-in views after Table and Cards ("Unpaid", "This week"). */
  presets?: PresetView<T>[];
  /** Which view opens first (default "table"). */
  defaultView?: string;
  groups?: GroupDef<T>[];
  /** A group id, or "none". */
  defaultGroup?: string;
  /** The column a group header subtotals (default: the first amount). */
  subtotalColumn?: string;
  card: CardSpec<T>;
  onOpen?: (row: T) => void;
  /** "New" (and each group's "+ New" row) without inline quick entry. */
  onNew?: (groupKey: string | null) => void;
  /** Inline quick entry: the "+ New" row asks for the columns marked newRow. */
  onCreate?: (values: Record<string, FieldValue>, groupKey: string | null) => Promise<unknown>;
  newLabel?: string;
  newTemplates?: NewTemplate[];
  bulkActions?: BulkAction<T>[];
  emptyText?: string;
  /** Shown between the toolbar and the rows (a summary card). */
  above?: ReactNode;
}

export function Database<T>(props: DatabaseProps<T>) {
  const { id, label, noun, rows, rowKey, columns, groups = [], card } = props;
  const presets = useMemo<PresetView<T>[]>(() => [...DEFAULT_PRESETS, ...(props.presets ?? [])], [props.presets]);
  const db = useDatabaseState(id, { view: props.defaultView ?? 'table', group: props.defaultGroup ?? groups[0]?.id ?? 'none' });
  const { state } = db;
  const [menu, setMenu] = useState<{ kind: 'group' | 'props' | 'new' | 'view'; anchor: HTMLElement } | null>(null);
  const [viewName, setViewName] = useState('');

  const saved = state.saved.find((v) => v.id === state.view) ?? null;
  const preset = presets.find((p) => p.id === (saved?.basedOn ?? state.view)) ?? presets[0];
  const layout = saved?.layout ?? preset.layout;

  const fields = useMemo<FieldDef<T>[]>(
    () =>
      columns
        .filter((c) => !c.noQuery)
        .map((c) => ({ id: c.id, label: c.label, type: fieldTypeOf(c.type), get: c.value, options: c.options, searchable: c.type === 'text' || c.type === 'relation' })),
    [columns]
  );

  // Columns in the household's order, without the hidden ones.
  const ordered = useMemo(() => {
    const order = state.order.length ? state.order : columns.map((c) => c.id);
    const rank = (c: ColumnDef<T>) => {
      const i = order.indexOf(c.id);
      return i < 0 ? order.length + columns.indexOf(c) : i;
    };
    return [...columns].sort((a, b) => rank(a) - rank(b));
  }, [columns, state.order]);
  const isHidden = (c: ColumnDef<T>) => (state.hidden ? state.hidden.includes(c.id) : Boolean(c.hidden));
  const visible = ordered.filter((c) => !isHidden(c));
  // The first column (the name) always shows.
  if (ordered[0] && !visible.includes(ordered[0])) visible.unshift(ordered[0]);
  const cardProps = state.cardProps
    ? ordered.filter((c) => state.cardProps!.includes(c.id))
    : ordered.filter((c) => c.onCard);

  const shown = useMemo(() => {
    const base = preset.filter ? rows.filter(preset.filter) : rows;
    return applyQuery(base, db.query, fields, new Date());
  }, [rows, preset, db.query, fields]);

  const group = groups.find((g) => g.id === state.group) ?? null;
  const grouped = useMemo<TableGroup<T>[] | null>(() => {
    if (!group) return null;
    const map = new Map<string, TableGroup<T>>();
    for (const row of shown) {
      const { key, label: groupLabel } = group.key(row);
      if (!map.has(key)) map.set(key, { key, label: groupLabel, rows: [] });
      map.get(key)!.rows.push(row);
    }
    return [...map.values()];
  }, [shown, group]);

  const subtotalCol = columns.find((c) => c.id === props.subtotalColumn) ?? columns.find((c) => c.type === 'currency');
  const emptyText = props.emptyText ?? `No ${noun[1]} yet.`;
  const tabs = [...presets.map((p) => ({ id: p.id, name: p.name, layout: p.layout, saved: false })), ...state.saved.map((v) => ({ ...v, saved: true }))];

  const viewTabs = (
    <div className={styles.viewTabs} role="tablist" aria-label={`${label} views`}>
      {tabs.map((tab) => {
        const Icon = tab.layout === 'cards' ? LayoutGrid : tab.id === 'table' ? Table2 : Rows3;
        const active = state.view === tab.id;
        return (
          <span key={tab.id} className={styles.viewTabWrap}>
            <button type="button" role="tab" aria-selected={active} className={styles.viewTab} onClick={() => db.patch({ view: tab.id })}>
              <Icon size={14} strokeWidth={2.25} aria-hidden />
              {tab.name}
            </button>
            {tab.saved && active && (
              <button type="button" className={styles.viewTabRemove} aria-label={`Remove view ${tab.name}`} onClick={() => db.removeView(tab.id)}>
                <X size={12} strokeWidth={2.5} />
              </button>
            )}
          </span>
        );
      })}
      <button type="button" className={styles.viewTabAdd} aria-label="Add a view" onClick={(e) => setMenu({ kind: 'view', anchor: e.currentTarget })}>
        <Plus size={15} strokeWidth={2.25} />
      </button>
    </div>
  );

  const tools = (
    <>
      {groups.length > 0 && (
        <button type="button" className={styles.toolText} data-active={group ? true : undefined} onClick={(e) => setMenu({ kind: 'group', anchor: e.currentTarget })}>
          Group{group ? `: ${group.label}` : ''}
        </button>
      )}
      <button type="button" className={styles.toolIcon} aria-label="Properties" title="Properties" onClick={(e) => setMenu({ kind: 'props', anchor: e.currentTarget })}>
        <SlidersHorizontal size={18} strokeWidth={2} />
      </button>
      {(props.onNew || props.onCreate || props.newTemplates?.length) && (
        <span className={styles.newSplit}>
          <button
            type="button"
            className={styles.newButton}
            onClick={(e) => {
              if (props.onNew) props.onNew(null);
              else if (props.newTemplates?.length) setMenu({ kind: 'new', anchor: e.currentTarget });
            }}
          >
            {props.newLabel ?? 'New'}
          </button>
          {props.newTemplates?.length ? (
            <button type="button" className={styles.newArrow} aria-label="New from a template" onClick={(e) => setMenu({ kind: 'new', anchor: e.currentTarget })}>
              <ChevronDown size={14} strokeWidth={2.5} />
            </button>
          ) : null}
        </span>
      )}
    </>
  );

  return (
    <section className={styles.database} aria-label={label}>
      <ListQueryBar
        fields={fields}
        query={db.query}
        setQuery={db.setQuery}
        onClear={db.clearQuery}
        count={shown.length}
        noun={noun}
        className={styles.toolbar}
        leading={viewTabs}
        trailing={tools}
      />
      {props.above}
      {shown.length === 0 && rows.length > 0 ? (
        <ListQueryEmpty onClear={db.clearQuery} />
      ) : layout === 'cards' ? (
        <CardsView
          label={label}
          rows={shown}
          groups={grouped}
          rowKey={rowKey}
          properties={cardProps}
          card={card}
          db={db}
          subtotal={subtotalCol}
          onOpen={props.onOpen}
          emptyText={emptyText}
        />
      ) : (
        <TableView
          label={label}
          rows={shown}
          groups={grouped}
          rowKey={rowKey}
          columns={visible}
          db={db}
          group={group}
          subtotalColumn={props.subtotalColumn}
          onOpen={props.onOpen}
          onNew={props.onNew}
          onCreate={props.onCreate}
          bulkActions={props.bulkActions}
          emptyText={emptyText}
        />
      )}

      {menu?.kind === 'group' && (
        <Popover anchor={menu.anchor} label="Group by" onClose={() => setMenu(null)}>
          <div className={styles.menu}>
            {[{ id: 'none', label: 'No grouping' }, ...groups].map((g) => (
              <button
                key={g.id}
                type="button"
                className={styles.menuRow}
                data-row
                onClick={() => {
                  db.patch({ group: g.id });
                  setMenu(null);
                }}
              >
                <span>{g.label}</span>
                {state.group === g.id && <Check size={14} strokeWidth={2.5} aria-hidden />}
              </button>
            ))}
          </div>
        </Popover>
      )}

      {menu?.kind === 'props' && (
        <Popover anchor={menu.anchor} label="Properties" onClose={() => setMenu(null)}>
          <div className={styles.menu}>
            <p className={styles.menuTitle}>{layout === 'cards' ? 'Shown on cards' : 'Shown in the table'}</p>
            {ordered.map((c, index) => {
              const on = layout === 'cards' ? cardProps.includes(c) : !isHidden(c) || index === 0;
              return (
                <label key={c.id} className={styles.menuRow} data-row>
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={layout === 'table' && index === 0}
                    onChange={() => {
                      if (layout === 'cards') {
                        const current = cardProps.map((p) => p.id);
                        db.patch({ cardProps: on ? current.filter((x) => x !== c.id) : [...current, c.id] });
                      } else {
                        const hidden = ordered.filter(isHidden).map((h) => h.id);
                        db.patch({ hidden: on ? [...hidden, c.id] : hidden.filter((x) => x !== c.id) });
                      }
                    }}
                  />
                  <span>{c.label}</span>
                </label>
              );
            })}
          </div>
        </Popover>
      )}

      {menu?.kind === 'new' && props.newTemplates && (
        <Popover anchor={menu.anchor} label="New from a template" onClose={() => setMenu(null)}>
          <div className={styles.menu}>
            {props.newTemplates.map((t) => (
              <button
                key={t.id}
                type="button"
                className={styles.menuRow}
                data-row
                onClick={() => {
                  setMenu(null);
                  t.onSelect();
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </Popover>
      )}

      {menu?.kind === 'view' && (
        <Popover anchor={menu.anchor} label="Add a view" onClose={() => setMenu(null)}>
          <form
            className={styles.menu}
            onSubmit={(e) => {
              e.preventDefault();
              const layoutChoice = (new FormData(e.currentTarget).get('layout') as 'table' | 'cards') ?? 'table';
              const name = viewName.trim() || `${preset.name} view`;
              const viewId = newId('v');
              // The new view starts from what's showing now.
              db.addView({ id: viewId, name, layout: layoutChoice, basedOn: preset.id });
              db.patch((s) => ({ queries: { ...s.queries, [viewId]: db.query } }));
              setViewName('');
              setMenu(null);
            }}
          >
            <p className={styles.menuTitle}>New view from what&apos;s showing</p>
            <input className={styles.menuInput} autoFocus placeholder="View name" value={viewName} onChange={(e) => setViewName(e.target.value)} aria-label="View name" />
            <div className={styles.segmented} role="radiogroup" aria-label="Layout">
              <label>
                <input type="radio" name="layout" value="table" defaultChecked={layout === 'table'} />
                Table
              </label>
              <label>
                <input type="radio" name="layout" value="cards" defaultChecked={layout === 'cards'} />
                Cards
              </label>
            </div>
            <button type="submit" className={styles.newButton} data-block>
              Add view
            </button>
          </form>
        </Popover>
      )}
    </section>
  );
}
