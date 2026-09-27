'use client';

// The Notion-style filter and sort toolbar — one component, configured per
// list (its FieldDefs and default query, src/shared/listQuery). Sticky
// under the list's header: the result count on the left; Filter, Sort and
// Search on the right (primary color and a count badge when active). With
// any rule set, a chip row follows — one chip per sort / filter, an
// advanced filter as "N rules", then "+ Filter" and "Clear". Each chip
// opens its own editor anchored under it.

import { useEffect, useRef, useState } from 'react';
import { ArrowDownUp, ChevronDown, ListFilter, Plus, Search, X } from 'lucide-react';
import {
  countRules,
  defaultOperator,
  filterCount,
  hasValue,
  isMissing,
  newId,
  type FieldDef,
  type ListQuery,
  type Rule,
} from '@/src/shared/listQuery/engine';
import { Popover } from './Popover';
import { AdvancedBuilder, FieldPicker, FilterEditor, SortMenu, TYPE_ICON, blankRule, ruleSummary } from './editors';
import styles from './ListQuery.module.css';

type Menu =
  | { kind: 'filterFields'; anchor: HTMLElement }
  | { kind: 'filter'; anchor: HTMLElement; ruleId: string }
  | { kind: 'sort'; anchor: HTMLElement }
  | { kind: 'advanced'; anchor: HTMLElement };

export function ListQueryBar<T>({
  fields,
  query,
  setQuery,
  onClear,
  count,
  noun,
  stickyTop = '0px',
  manualOrder = false,
  hideSort = false,
  className,
}: {
  fields: FieldDef<T>[];
  query: ListQuery;
  setQuery: (next: ListQuery | ((q: ListQuery) => ListQuery)) => void;
  /** Back to the list's default. */
  onClear: () => void;
  count: number;
  /** ["task", "tasks"] */
  noun: [string, string];
  /** Where it pins (under the screen's own header). */
  stickyTop?: string;
  /** The list can be reordered by hand (paused while sorting). */
  manualOrder?: boolean;
  /** The list has its own ordering control (e.g. Priorities' sort chips). */
  hideSort?: boolean;
  /** Placement tweaks from the screen (the bar must stay a direct child of
   * the scrolling content for sticky to work). */
  className?: string;
}) {
  const [menu, setMenu] = useState<Menu | null>(null);
  const [searching, setSearching] = useState(query.search !== '');
  const barRef = useRef<HTMLDivElement>(null);
  const filterable = fields.filter((f) => f.filterable !== false);
  const nFilters = filterCount(query);
  const nSorts = query.sorts.length;
  const showChips = nFilters > 0 || nSorts > 0;

  // The hairline shows once the list scrolls under the pinned bar.
  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    function onScroll() {
      if (!bar) return;
      const pinnedAt = parseFloat(getComputedStyle(bar).top) || 0;
      if (bar.getBoundingClientRect().top <= pinnedAt + 0.5 && window.scrollY > 0) bar.dataset.stuck = 'true';
      else delete bar.dataset.stuck;
    }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  function addFilter(field: FieldDef<T>, anchor: HTMLElement) {
    const rule: Rule = { id: newId(), kind: 'rule', field: field.id, op: defaultOperator(field.type), value: null };
    setQuery((q) => ({ ...q, filters: [...q.filters, rule] }));
    setMenu({ kind: 'filter', anchor, ruleId: rule.id });
  }
  function updateRule(rule: Rule) {
    setQuery((q) => ({ ...q, filters: q.filters.map((r) => (r.id === rule.id ? rule : r)) }));
  }
  function deleteRule(id: string) {
    setQuery((q) => ({ ...q, filters: q.filters.filter((r) => r.id !== id) }));
    setMenu(null);
  }
  function openAdvanced(anchor: HTMLElement, withRule?: Rule) {
    setQuery((q) => {
      const base = q.advanced ?? { id: newId('g'), kind: 'group' as const, conj: 'and' as const, rules: [] };
      const rules = withRule ? [...base.rules, withRule] : base.rules.length ? base.rules : [blankRule(fields)];
      return { ...q, advanced: { ...base, rules }, filters: withRule ? q.filters.filter((r) => r.id !== withRule.id) : q.filters };
    });
    setMenu({ kind: 'advanced', anchor });
  }

  const activeRule = menu?.kind === 'filter' ? query.filters.find((r) => r.id === menu.ruleId) ?? null : null;
  const sortField = query.sorts[0] ? fields.find((f) => f.id === query.sorts[0].field) : undefined;

  return (
    <>
      <div ref={barRef} className={`${styles.bar} ${className ?? ''}`} style={{ top: stickyTop }}>
        <div className={styles.toolbar}>
          {searching ? (
            <label className={styles.searchField}>
              <Search size={16} strokeWidth={2} aria-hidden />
              <input
                autoFocus
                value={query.search}
                onChange={(e) => setQuery((q) => ({ ...q, search: e.target.value }))}
                placeholder={`Search ${noun[1]}`}
                aria-label={`Search ${noun[1]}`}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setQuery((q) => ({ ...q, search: '' }));
                    setSearching(false);
                  }
                }}
              />
              <button
                type="button"
                className={styles.iconButtonSmall}
                aria-label="Close search"
                onClick={() => {
                  setQuery((q) => ({ ...q, search: '' }));
                  setSearching(false);
                }}
              >
                <X size={16} strokeWidth={2.25} />
              </button>
            </label>
          ) : (
            <>
              <span className={styles.count} aria-live="polite">
                {count} {count === 1 ? noun[0] : noun[1]}
              </span>
              <div className={styles.tools}>
                <button
                  type="button"
                  className={styles.tool}
                  data-active={nFilters > 0 || undefined}
                  aria-label={nFilters ? `Filter, ${nFilters} active` : 'Filter'}
                  aria-haspopup="dialog"
                  onClick={(e) => setMenu({ kind: 'filterFields', anchor: e.currentTarget })}
                >
                  <ListFilter size={20} strokeWidth={2} />
                  {nFilters > 0 && <span className={styles.badge}>{nFilters}</span>}
                </button>
                {!hideSort && (
                  <button
                    type="button"
                    className={styles.tool}
                    data-active={nSorts > 0 || undefined}
                    aria-label={nSorts ? `Sort, ${nSorts} active` : 'Sort'}
                    aria-haspopup="dialog"
                    onClick={(e) => setMenu({ kind: 'sort', anchor: e.currentTarget })}
                  >
                    <ArrowDownUp size={20} strokeWidth={2} />
                    {nSorts > 0 && <span className={styles.badge}>{nSorts}</span>}
                  </button>
                )}
                <button type="button" className={styles.tool} aria-label="Search" onClick={() => setSearching(true)}>
                  <Search size={20} strokeWidth={2} />
                </button>
              </div>
            </>
          )}
        </div>

        {showChips && (
          <div className={styles.chips} role="toolbar" aria-label="Active filters and sorts">
            {nSorts > 0 && (
              <button type="button" className={styles.chip} onClick={(e) => setMenu({ kind: 'sort', anchor: e.currentTarget })}>
                <ArrowDownUp size={13} strokeWidth={2.25} aria-hidden />
                {nSorts > 1 ? `Sorted by ${nSorts}` : `${sortField?.label ?? 'Sort'} ${query.sorts[0].dir === 'asc' ? '↑' : '↓'}`}
                <ChevronDown size={12} strokeWidth={2.5} aria-hidden />
              </button>
            )}
            {query.filters.map((rule) => {
              const field = fields.find((f) => f.id === rule.field);
              const Icon = field ? TYPE_ICON[field.type] : ListFilter;
              const missing = isMissing(rule, fields);
              return (
                <button
                  key={rule.id}
                  type="button"
                  className={styles.chip}
                  data-empty={!hasValue(rule) || undefined}
                  data-missing={missing || undefined}
                  onClick={(e) => setMenu({ kind: 'filter', anchor: e.currentTarget, ruleId: rule.id })}
                >
                  <Icon size={13} strokeWidth={2.25} aria-hidden />
                  {missing && field ? `${field.label}: missing value` : ruleSummary(rule, fields)}
                  <ChevronDown size={12} strokeWidth={2.5} aria-hidden />
                </button>
              );
            })}
            {query.advanced && countRules(query.advanced) > 0 && (
              <button type="button" className={styles.chip} onClick={(e) => setMenu({ kind: 'advanced', anchor: e.currentTarget })}>
                <ListFilter size={13} strokeWidth={2.25} aria-hidden />
                {countRules(query.advanced)} {countRules(query.advanced) === 1 ? 'rule' : 'rules'}
                <ChevronDown size={12} strokeWidth={2.5} aria-hidden />
              </button>
            )}
            <button type="button" className={styles.chipText} onClick={(e) => setMenu({ kind: 'filterFields', anchor: e.currentTarget })}>
              <Plus size={13} strokeWidth={2.5} aria-hidden />
              Filter
            </button>
            <button type="button" className={styles.chipText} onClick={onClear}>
              Clear
            </button>
          </div>
        )}
      </div>

      {menu?.kind === 'filterFields' && (
        <Popover anchor={menu.anchor} label="Filter by" onClose={() => setMenu(null)}>
          <FieldPicker
            title="Filter by…"
            fields={filterable}
            onPick={(f) => addFilter(f, menu.anchor)}
            footer={
              <div className={styles.menuFooter}>
                <button type="button" className={styles.row} data-row onClick={() => openAdvanced(menu.anchor)}>
                  <Plus size={15} strokeWidth={2.25} className={styles.rowIcon} aria-hidden />
                  <span className={styles.rowLabel}>{query.advanced ? 'Edit advanced filter' : 'Add advanced filter'}</span>
                </button>
              </div>
            }
          />
        </Popover>
      )}

      {menu?.kind === 'filter' && activeRule && (
        <Popover anchor={menu.anchor} label={`Filter ${fields.find((f) => f.id === activeRule.field)?.label ?? ''}`} onClose={() => setMenu(null)}>
          <FilterEditor
            rule={activeRule}
            fields={fields}
            onChange={updateRule}
            onDelete={() => deleteRule(activeRule.id)}
            onMoveToAdvanced={() => openAdvanced(menu.anchor, activeRule)}
          />
        </Popover>
      )}

      {menu?.kind === 'sort' && (
        <Popover anchor={menu.anchor} label="Sort" onClose={() => setMenu(null)}>
          <SortMenu
            sorts={query.sorts}
            fields={fields}
            manualOrder={manualOrder}
            onChange={(sorts) => setQuery((q) => ({ ...q, sorts }))}
          />
        </Popover>
      )}

      {menu?.kind === 'advanced' && query.advanced && (
        <Popover anchor={menu.anchor} label="Advanced filter" wide onClose={() => setMenu(null)}>
          <AdvancedBuilder
            group={query.advanced}
            fields={fields}
            onChange={(advanced) => setQuery((q) => ({ ...q, advanced }))}
            onDelete={() => {
              setQuery((q) => ({ ...q, advanced: null }));
              setMenu(null);
            }}
          />
        </Popover>
      )}
    </>
  );
}

/** "No results match these filters" with a way out. */
export function ListQueryEmpty({ onClear, className }: { onClear: () => void; className?: string }) {
  return (
    <div className={`${styles.empty} ${className ?? ''}`}>
      <p>No results match these filters.</p>
      <button type="button" onClick={onClear}>
        Clear filters
      </button>
    </div>
  );
}
