// Notion-style databases — the shared shapes. A database is a list of rows
// described once by its columns. What's shown is a VIEW: a layout (Table,
// Cards, List or Board), its own filters, sorts and search (the shared
// ListQuery engine), which properties show and in what order, grouping,
// footer calculations, card and table options and a load limit. Views are
// picked from the view selector (never a second row of tabs) and are saved
// per database on this device. See Database.tsx.

import type { ReactNode } from 'react';
import type { FieldOption, FieldValue, ListQuery } from '@/src/shared/listQuery/engine';
import type { LucideIcon } from 'lucide-react';

export type CellType = 'text' | 'number' | 'currency' | 'date' | 'select' | 'checkbox' | 'relation' | 'progress';

/** Notion's "Calculate" — what a column's footer cell shows. */
export type Calc = 'none' | 'sum' | 'average' | 'count' | 'count_values' | 'percent_checked';

export type Tone = 'bad' | 'good' | 'watch' | 'neutral';

/** Table, Cards, List and Board come with every database; Day, Week,
 * Month (calendar) and Timeline only where the database renders them
 * (Database's renderLayout). */
export type Layout = 'table' | 'cards' | 'list' | 'board' | 'day' | 'week' | 'month' | 'timeline';

export interface ColumnDef<T> {
  id: string;
  label: string;
  type: CellType;
  /** The raw value: sorting, filtering, grouping and calculations read it. */
  value: (row: T) => FieldValue;
  /** How the cell looks; defaults to the value formatted by type. */
  render?: (row: T) => ReactNode;
  /** select / relation: the choices, in order. */
  options?: FieldOption[];
  /** Inline editing (medium screens and up): saves one cell. */
  edit?: (row: T, next: FieldValue) => Promise<unknown> | void;
  editable?: (row: T) => boolean;
  /** Preferred width in px. */
  width?: number;
  /** Default footer calculation. */
  calc?: Calc;
  /** Hidden until switched on in View settings. */
  hidden?: boolean;
  /** Red text with an icon for a problem (over plan, overdue). */
  tone?: (row: T) => Tone | undefined;
  /** Shown on cards by default. */
  onCard?: boolean;
  /** Asked for in the inline "+ New" row (quick entry). */
  newRow?: boolean;
  /** Not offered in the filter / sort menus. */
  noQuery?: boolean;
  /** Text shown on hover when the cell truncates (defaults to the value). */
  tooltip?: (row: T) => string;
}

export interface GroupDef<T> {
  id: string;
  label: string;
  key: (row: T) => { key: string; label: string };
  /** Group order (keys); groups not listed follow in first-seen order. */
  order?: string[];
}

/** A database's starting views; the household can add, rename, duplicate and delete. */
export interface DefaultView<T> {
  id: string;
  name: string;
  layout: Layout;
  /** Built-in rows for this view ("Needs attention"); kept by duplicates. */
  filter?: (row: T) => boolean;
  group?: string;
  hidden?: string[];
  /** Groups collapsed until opened (Done and Cancelled on Today). */
  collapsed?: string[];
}

export interface ViewConfig {
  id: string;
  name: string;
  layout: Layout;
  /** The default view whose built-in filter applies. */
  basedOn: string | null;
  query: ListQuery;
  /** Hidden property ids (null = each column's default). */
  hidden: string[] | null;
  /** Property order (ids). */
  order: string[];
  widths: Record<string, number>;
  group: string;
  hideEmptyGroups: boolean;
  collapsed: string[];
  /** Board columns hidden from this view ("..." > Hide group). */
  hiddenGroups?: string[];
  calcs: Record<string, Calc>;
  cardSize: 'small' | 'medium' | 'large';
  cardPreview: 'none' | 'progress' | 'chart';
  fitProperties: 'wrap' | 'truncate';
  wrapCells: boolean;
  rowNumbers: boolean;
  freezeFirst: boolean;
  /** Rows shown before "Load more"; 0 = all. */
  limit: number;
  /** Sort preset id (when the database offers presets). */
  sortPreset: string | null;
}

export interface BulkAction<T> {
  id: string;
  label: string;
  icon?: LucideIcon;
  danger?: boolean;
  run: (rows: T[]) => Promise<unknown> | void;
}

/** Per-row actions: on hover (mouse), swipe (touch: the first is swipe
 * right, the second swipe left) and in the row's "..." menu. */
export interface RowAction<T> {
  id: string;
  label: string;
  icon?: LucideIcon;
  run: (row: T) => Promise<unknown> | void;
  show?: (row: T) => boolean;
}

export interface NewTemplate {
  id: string;
  label: string;
  onSelect: () => void;
}

/** How a row reads as a two-line list item (List view, and Table on phones). */
export interface ListSpec<T> {
  title: (row: T) => string;
  /** The second line; `shown` holds the view's visible property ids. */
  secondary?: (row: T, shown: Set<string>) => ReactNode;
  amount?: (row: T) => ReactNode;
  status?: (row: T, shown: Set<string>) => ReactNode;
  /** Before the title (a task's circle checkbox). */
  leading?: (row: T) => ReactNode;
  /** The spec draws the visible properties itself (no third line). */
  ownsProperties?: boolean;
  /** Marks a row (data-row-key) so a page can highlight it from elsewhere. */
  highlight?: string | null;
  onHover?: (row: T | null) => void;
  /** Rows can be dragged out (onto a timeline), carrying this data. */
  drag?: { type: string; data: (row: T) => string };
}

export interface BoardSpec<T> {
  /** The group whose values are the columns. */
  group: string;
  /** Moving a card; throw to refuse (the message is shown). */
  onMove?: (row: T, toKey: string) => Promise<unknown> | void;
  /** A column's header figures. */
  header?: (key: string, rows: T[]) => ReactNode;
  /** More actions in a card's "..." menu (after "Move to"). */
  actions?: RowAction<T>[];
  /** A muted one-line hint under a column's name ("Urgent and important"). */
  hint?: (key: string) => string | null;
  /** A colored dot before a column's name. */
  dot?: (key: string) => string | null;
  /** Medium screens: four columns as a 2 by 2 grid (the Focus matrix). */
  matrix?: boolean;
  /** Columns share the width (at least 260px each, then the board scrolls). */
  fill?: boolean;
}
