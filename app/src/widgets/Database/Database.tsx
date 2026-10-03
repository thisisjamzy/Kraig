'use client';

// A Notion-style database: one list of rows, described once by its
// columns, shown through VIEWS (Table, Cards, List, Board) picked from the
// view selector. One tab level at most: a page's type tabs (Income,
// Expenses, Savings, Transfers) sit on the left of the toolbar row, and the
// toolbar on its right reads: view selector, filter, sort, search, view
// settings, New (with its template menu). Active filters and sorts show as
// chips under it.
//
// On phones the toolbar takes its own row under the tabs (view selector on
// the left, filter, sort and search on the right, view settings inside the
// view selector), "New" becomes the page's "+" button, menus open as bottom
// sheets, a Table reads as a List, and Cards go one across.

import { useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, Plus, SlidersHorizontal } from 'lucide-react';
import { applyQuery, type FieldDef, type FieldValue } from '@/src/shared/listQuery/engine';
import { useLayout } from '@/src/shared/hooks/useLayout';
import { ListQueryBar, ListQueryEmpty } from '@/src/widgets/ListQuery/ListQueryBar';
import { Popover } from '@/src/widgets/ListQuery/Popover';
import { CardsView, type CardSpec } from './CardsView';
import { TableView, type TableGroup } from './TableView';
import { ListView } from './ListView';
import { BoardView } from './BoardView';
import { ViewSelector, ViewSettings } from './ViewMenus';
import { fieldTypeOf, formatNumber, formatValue } from './format';
import { useDatabaseState } from './useDatabaseState';
import type { BoardSpec, BulkAction, ColumnDef, DefaultView, GroupDef, Layout, ListSpec, NewTemplate, RowAction, ViewConfig } from './types';
import styles from './Database.module.css';

const DEFAULT_VIEWS: DefaultView<never>[] = [
  { id: 'table', name: 'Table', layout: 'table' },
  { id: 'cards', name: 'Cards', layout: 'cards' },
];

export interface SortPreset<T> {
  id: string;
  label: string;
  compare: (a: T, b: T) => number;
}

export interface DatabaseProps<T> {
  /** Remembers this database's views under this id. */
  id: string;
  label: string;
  noun: [string, string];
  rows: T[];
  rowKey: (row: T) => string;
  columns: ColumnDef<T>[];
  /** The starting views (default: Table and Cards). */
  views?: DefaultView<T>[];
  groups?: GroupDef<T>[];
  /** A group id, or "none". */
  defaultGroup?: string;
  /** The column group headers and totals add up (default: the first amount). */
  subtotalColumn?: string;
  card: CardSpec<T>;
  list?: ListSpec<T>;
  board?: BoardSpec<T>;
  /** The page's type tabs (or a date range), on the toolbar row's left. */
  tabs?: ReactNode | ((view: ViewConfig) => ReactNode);
  onOpen?: (row: T) => void;
  onNew?: (groupKey: string | null) => void;
  onCreate?: (values: Record<string, FieldValue>, groupKey: string | null) => Promise<unknown>;
  newLabel?: string;
  newTemplates?: NewTemplate[];
  bulkActions?: BulkAction<T>[];
  rowActions?: RowAction<T>[];
  /** Named orderings in the Sort menu; the first is the default. */
  sortPresets?: SortPreset<T>[];
  emptyText?: string;
  /** Shown between the toolbar and the rows (a summary). */
  above?: ReactNode;
  /** For the phone's total bar. */
  currency?: string;
  /** Layouts this database draws itself (Day, Week, Month, Timeline):
   * they're offered in the view menus, and drawn by renderLayout with the
   * view's filtered, searched and sorted rows. */
  extraLayouts?: Layout[];
  renderLayout?: (layout: Layout, rows: T[], view: ViewConfig) => ReactNode;
  /** Layouts not offered on phones (Week, Timeline). */
  phoneLayouts?: Layout[];
  /** Open on this view (a link like "Review overdue"). */
  openView?: string | null;
}

export function Database<T>(props: DatabaseProps<T>) {
  const { id, label, noun, rows, rowKey, columns, groups = [], card } = props;
  const tabsFor = (v: ViewConfig) => (typeof props.tabs === 'function' ? props.tabs(v) : props.tabs);
  const { deviceClass } = useLayout();
  const compact = deviceClass === 'compact';
  const defaults = (props.views ?? (DEFAULT_VIEWS as DefaultView<T>[])) as DefaultView<T>[];
  const db = useDatabaseState<T>(id, defaults, props.defaultGroup ?? groups[0]?.id ?? 'none', props.sortPresets?.[0]?.id ?? null, props.openView ?? null);
  const view = db.view;
  const [settings, setSettings] = useState<HTMLElement | null>(null);
  const [newMenu, setNewMenu] = useState<HTMLElement | null>(null);
  const [extra, setExtra] = useState(0);

  const base = defaults.find((d) => d.id === view.basedOn);

  const fields = useMemo<FieldDef<T>[]>(
    () =>
      columns
        .filter((c) => !c.noQuery)
        .map((c) => ({ id: c.id, label: c.label, type: fieldTypeOf(c.type), get: c.value, options: c.options, searchable: c.type === 'text' || c.type === 'relation' })),
    [columns]
  );

  // Properties in this view's order; the first (the name) always shows.
  const ordered = useMemo(() => {
    const order = view.order.length ? view.order : columns.map((c) => c.id);
    const rank = (c: ColumnDef<T>) => {
      const i = order.indexOf(c.id);
      return i < 0 ? order.length + columns.indexOf(c) : i;
    };
    const sorted = [...columns].sort((a, b) => rank(a) - rank(b));
    // The name column stays first.
    const first = columns[0];
    return first ? [first, ...sorted.filter((c) => c !== first)] : sorted;
  }, [columns, view.order]);
  const isHidden = (c: ColumnDef<T>) => c !== ordered[0] && (view.hidden ? view.hidden.includes(c.id) : Boolean(c.hidden));
  const visible = ordered.filter((c) => !isHidden(c));

  const preset = props.sortPresets?.find((p) => p.id === view.sortPreset) ?? null;
  const shown = useMemo(() => {
    const filtered = base?.filter ? rows.filter(base.filter) : rows;
    const queried = applyQuery(filtered, view.query, fields, new Date());
    return preset && !view.query.sorts.length ? [...queried].sort(preset.compare) : queried;
  }, [rows, base, view.query, fields, preset]);

  const limit = view.limit ? view.limit + extra : Infinity;
  const limited = shown.length > limit ? shown.slice(0, limit) : shown;
  const more =
    shown.length > limited.length ? (
      <button type="button" className={styles.loadMore} onClick={() => setExtra((n) => n + (view.limit || 50))}>
        Load more ({shown.length - limited.length})
      </button>
    ) : null;

  const group = groups.find((g) => g.id === view.group) ?? null;
  const grouped = useMemo<TableGroup<T>[] | null>(() => {
    if (!group) return null;
    const map = new Map<string, TableGroup<T>>();
    if (!view.hideEmptyGroups) for (const key of group.order ?? []) map.set(key, { key, label: key, rows: [] });
    for (const row of limited) {
      const { key, label: groupLabel } = group.key(row);
      const g = map.get(key) ?? { key, label: groupLabel, rows: [] };
      g.label = groupLabel;
      g.rows.push(row);
      map.set(key, g);
    }
    const order = group.order ?? [];
    return [...map.values()].sort((a, b) => {
      const ia = order.indexOf(a.key);
      const ib = order.indexOf(b.key);
      return (ia < 0 ? Infinity : ia) - (ib < 0 ? Infinity : ib);
    });
  }, [limited, group, view.hideEmptyGroups]);

  const subtotalCol = columns.find((c) => c.id === props.subtotalColumn) ?? columns.find((c) => c.type === 'currency');
  const emptyText = props.emptyText ?? `No ${noun[1]} yet.`;
  const boardGroup = props.board ? (groups.find((g) => g.id === props.board!.group) ?? null) : null;
  const cardProps = visible.slice(1);

  // What each layout becomes on a phone.
  let layout = view.layout;
  if (layout === 'board' && !boardGroup) layout = 'table';
  const extraLayouts = props.extraLayouts ?? [];
  if (!['table', 'cards', 'list', 'board'].includes(layout) && (!extraLayouts.includes(layout) || !props.renderLayout)) layout = 'table';
  if (compact && props.phoneLayouts && extraLayouts.includes(layout) && !props.phoneLayouts.includes(layout)) layout = props.phoneLayouts[0] ?? 'list';
  if (compact && layout === 'table') layout = 'list';
  const layouts: Layout[] = [
    ...(['table', 'cards', 'list', 'board'] as Layout[]).filter((l) => l !== 'board' || boardGroup),
    ...extraLayouts.filter((l) => !compact || !props.phoneLayouts || props.phoneLayouts.includes(l)),
  ];
  const shownIds = new Set(visible.map((c) => c.id));

  const amountCol = visible.find((c) => c.type === 'currency');
  const statusCol = visible.find((c) => c.id === 'status');
  const listSpec: ListSpec<T> = props.list ?? {
    title: card.title,
    secondary: (row) => {
      const c = visible.slice(1).find((col) => col !== amountCol && col !== statusCol && col.type !== 'progress');
      return c ? formatValue(c.type, c.value(row), c.options) || null : null;
    },
    amount: amountCol ? (row) => (amountCol.render ? amountCol.render(row) : formatNumber(Number(amountCol.value(row)) || 0)) : undefined,
    status: statusCol ? (row) => (statusCol.render ? statusCol.render(row) : formatValue(statusCol.type, statusCol.value(row), statusCol.options)) : undefined,
  };
  const listExtras = props.list?.ownsProperties ? [] : visible.slice(1).filter((c) => c !== amountCol && c !== statusCol).slice(1, 3);

  const hasNew = Boolean(props.onNew || props.onCreate || props.newTemplates?.length);
  const newButton = hasNew && !compact && (
    <span className={styles.newSplit}>
      <button
        type="button"
        className={styles.newButton}
        onClick={(e) => {
          if (props.onNew) props.onNew(null);
          else if (props.newTemplates?.length) setNewMenu(e.currentTarget);
        }}
      >
        {props.newLabel ?? 'New'}
      </button>
      {props.newTemplates?.length ? (
        <button type="button" className={styles.newArrow} aria-label="New from a template" onClick={(e) => setNewMenu(e.currentTarget)}>
          <ChevronDown size={14} strokeWidth={2.5} />
        </button>
      ) : null}
    </span>
  );

  const selector = <ViewSelector db={db} compact={compact} onSettings={setSettings} layouts={layouts} />;

  return (
    <section className={styles.database} aria-label={label} data-compact={compact || undefined}>
      {compact && props.tabs && <div className={styles.tabsRow}>{tabsFor(view)}</div>}
      <ListQueryBar
        fields={fields}
        query={view.query}
        setQuery={db.setQuery}
        onClear={db.clearQuery}
        count={shown.length}
        noun={noun}
        className={styles.toolbar}
        leading={compact ? selector : (tabsFor(view) ?? <span />)}
        beforeTools={compact ? undefined : selector}
        sortPresets={props.sortPresets?.map((p) => ({ id: p.id, label: p.label }))}
        sortPreset={view.sortPreset}
        onSortPreset={(sortPreset) => db.patchView({ sortPreset })}
        trailing={
          compact ? undefined : (
            <>
              <button type="button" className={styles.toolIcon} aria-label="View settings" title="View settings" onClick={(e) => setSettings(e.currentTarget)}>
                <SlidersHorizontal size={18} strokeWidth={2} />
              </button>
              {newButton}
            </>
          )
        }
      />
      {props.above}
      {extraLayouts.includes(layout) && props.renderLayout ? (
        props.renderLayout(layout, shown, view)
      ) : shown.length === 0 && rows.length > 0 ? (
        <ListQueryEmpty onClear={db.clearQuery} />
      ) : layout === 'cards' ? (
        <CardsView label={label} rows={limited} groups={grouped} rowKey={rowKey} properties={cardProps} card={card} db={db} subtotal={subtotalCol} onOpen={props.onOpen} emptyText={emptyText} more={more} />
      ) : layout === 'board' && boardGroup && props.board ? (
        <BoardView
          label={label}
          rows={shown}
          rowKey={rowKey}
          group={boardGroup}
          board={props.board}
          properties={cardProps.filter((c) => c.id !== boardGroup.id)}
          card={card}
          db={db}
          onOpen={props.onOpen}
          onNew={props.onNew}
          compact={compact}
          medium={deviceClass === 'medium'}
          emptyText={emptyText}
        />
      ) : layout === 'list' ? (
        <ListView
          label={label}
          rows={limited}
          allRows={shown}
          groups={grouped}
          rowKey={rowKey}
          extras={listExtras}
          spec={listSpec}
          shown={shownIds}
          db={db}
          subtotal={subtotalCol}
          currency={props.currency}
          onOpen={props.onOpen}
          rowActions={props.rowActions}
          bulkActions={props.bulkActions}
          compact={compact}
          emptyText={emptyText}
          more={more}
        />
      ) : (
        <TableView
          label={label}
          rows={limited}
          allRows={shown}
          groups={grouped}
          rowKey={rowKey}
          columns={visible}
          allColumns={ordered}
          db={db}
          group={group}
          subtotalColumn={props.subtotalColumn}
          onOpen={props.onOpen}
          onNew={props.onNew}
          onCreate={props.onCreate}
          bulkActions={props.bulkActions}
          rowActions={props.rowActions}
          emptyText={emptyText}
          more={more}
        />
      )}

      {compact && hasNew && (
        <button
          type="button"
          className={styles.fab}
          aria-label={props.newLabel ?? 'New'}
          onClick={(e) => {
            if (props.newTemplates?.length) setNewMenu(e.currentTarget);
            else props.onNew?.(null);
          }}
        >
          <Plus size={24} strokeWidth={2.25} />
        </button>
      )}

      {settings && (
        <ViewSettings
          anchor={settings}
          onClose={() => setSettings(null)}
          db={db}
          columns={ordered}
          groups={groups}
          isHidden={isHidden}
          layouts={layouts}
          groupKeys={grouped?.map((g) => g.key) ?? []}
        />
      )}

      {newMenu && (
        <Popover anchor={newMenu} label={props.newLabel ?? 'New'} onClose={() => setNewMenu(null)}>
          <div className={styles.menu}>
            {props.onNew && (
              <button
                type="button"
                className={styles.menuRow}
                data-row
                onClick={() => {
                  setNewMenu(null);
                  props.onNew?.(null);
                }}
              >
                <Plus size={15} strokeWidth={2} aria-hidden /> {props.newLabel ?? 'New'}
              </button>
            )}
            {props.newTemplates?.map((t) => (
              <button
                key={t.id}
                type="button"
                className={styles.menuRow}
                data-row
                onClick={() => {
                  setNewMenu(null);
                  t.onSelect();
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </Popover>
      )}
    </section>
  );
}
