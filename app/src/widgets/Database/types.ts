// Notion-style databases — the shared shapes. A database is a list of rows
// described once by its columns, shown as a Table or as Cards, with saved
// views, filters and sorts (the shared ListQuery engine), grouping, footer
// calculations, inline editing and bulk actions. See Database.tsx.

import type { ReactNode } from 'react';
import type { FieldOption, FieldValue, ListQuery } from '@/src/shared/listQuery/engine';
import type { LucideIcon } from 'lucide-react';

export type CellType = 'text' | 'number' | 'currency' | 'date' | 'select' | 'checkbox' | 'relation' | 'progress';

/** Notion's "Calculate" — what a column's footer cell shows. */
export type Calc = 'none' | 'sum' | 'average' | 'count' | 'count_values' | 'percent_checked';

export type Tone = 'bad' | 'good' | 'watch' | 'neutral';

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
  /** Inline editing: saves one cell. */
  edit?: (row: T, next: FieldValue) => Promise<unknown> | void;
  editable?: (row: T) => boolean;
  /** Preferred width in px (the column never truncates its content). */
  width?: number;
  /** Default footer calculation. */
  calc?: Calc;
  /** Hidden until switched on from the column or Properties menu. */
  hidden?: boolean;
  /** Red text with an icon for a problem (over plan, overdue). */
  tone?: (row: T) => Tone | undefined;
  /** Shown on cards by default (Cards view, "Properties"). */
  onCard?: boolean;
  /** Asked for in the inline "+ New" row (quick entry). */
  newRow?: boolean;
  /** Not offered in the filter / sort menus. */
  noQuery?: boolean;
}

export interface GroupDef<T> {
  id: string;
  label: string;
  key: (row: T) => { key: string; label: string };
}

export interface PresetView<T> {
  id: string;
  name: string;
  layout: 'table' | 'cards';
  /** A built-in view's own rows (e.g. "Unpaid"). */
  filter?: (row: T) => boolean;
}

export interface SavedView {
  id: string;
  name: string;
  layout: 'table' | 'cards';
  /** The view it was made from (its preset filter carries over). */
  basedOn: string | null;
}

export interface BulkAction<T> {
  id: string;
  label: string;
  icon?: LucideIcon;
  danger?: boolean;
  run: (rows: T[]) => Promise<unknown> | void;
}

export interface NewTemplate {
  id: string;
  label: string;
  onSelect: () => void;
}

export interface DatabaseState {
  view: string;
  saved: SavedView[];
  widths: Record<string, number>;
  hidden: string[] | null; // null = each column's own default
  order: string[];
  group: string;
  collapsed: string[];
  calcs: Record<string, Calc>;
  cardProps: string[] | null;
  queries: Record<string, ListQuery>;
}
