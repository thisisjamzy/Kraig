// Cell formatting and footer calculations for databases. Pure.

import type { FieldOption, FieldType, FieldValue } from '@/src/shared/listQuery/engine';
import type { Calc, CellType } from './types';

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(Math.round(value * 100) / 100);
}

export function formatDate(value: Date): string {
  return value.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: value.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}

export function formatValue(type: CellType, value: FieldValue, options?: FieldOption[]): string {
  if (value === null || value === undefined || value === '') return '';
  if (value instanceof Date) return formatDate(value);
  if (typeof value === 'number') return type === 'progress' ? `${Math.round(value * 100)}%` : formatNumber(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.map((v) => options?.find((o) => o.value === v)?.label ?? v).join(', ');
  return options?.find((o) => o.value === value)?.label ?? String(value);
}

export const CALC_LABEL: Record<Calc, string> = {
  none: 'None',
  sum: 'Sum',
  average: 'Average',
  count: 'Count all',
  count_values: 'Count values',
  percent_checked: 'Percent checked',
};

export function calcsFor(type: CellType): Calc[] {
  if (type === 'number' || type === 'currency') return ['none', 'sum', 'average', 'count', 'count_values'];
  if (type === 'checkbox') return ['none', 'count', 'percent_checked'];
  return ['none', 'count', 'count_values'];
}

export function defaultCalc(type: CellType): Calc {
  return type === 'currency' ? 'sum' : 'none';
}

/** The footer cell's text, "" when the calculation is off. */
export function calculate(calc: Calc, values: FieldValue[]): string {
  const present = values.filter((v) => v !== null && v !== undefined && v !== '');
  switch (calc) {
    case 'sum':
      return formatNumber(present.reduce<number>((s, v) => s + (typeof v === 'number' ? v : 0), 0));
    case 'average': {
      const numbers = present.filter((v): v is number => typeof v === 'number');
      return numbers.length ? formatNumber(numbers.reduce((s, v) => s + v, 0) / numbers.length) : '';
    }
    case 'count':
      return String(values.length);
    case 'count_values':
      return String(present.length);
    case 'percent_checked':
      return values.length ? `${Math.round((values.filter((v) => v === true).length / values.length) * 100)}%` : '';
    default:
      return '';
  }
}

/** A group's subtotal over one numeric column. */
export function subtotal<T>(rows: T[], value: (row: T) => FieldValue): number {
  return rows.reduce((s, row) => {
    const v = value(row);
    return s + (typeof v === 'number' ? v : 0);
  }, 0);
}

export function toInputDate(value: FieldValue): string {
  if (!(value instanceof Date)) return '';
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

export function fromInputDate(text: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const [y, m, d] = text.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** The filter / sort engine's field type for a cell type. */
export function fieldTypeOf(type: CellType): FieldType {
  if (type === 'progress') return 'number';
  if (type === 'relation') return 'select';
  return type;
}
