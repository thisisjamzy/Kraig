'use client';

// The contents of the filter and sort menus (ListQueryBar opens them in a
// Popover): a searchable field list, one filter's editor (operator, value
// for its type, a "…" menu), the sort rules (draggable), and the advanced
// rule builder (And / Or, one nested group level).

import { useState, type ReactNode } from 'react';
import {
  Calendar,
  CheckSquare,
  ChevronDown,
  Clock3,
  Copy,
  GripVertical,
  Hash,
  ListFilter,
  MoreHorizontal,
  Plus,
  Search,
  Tag,
  Trash2,
  Type,
  X,
  type LucideIcon,
} from 'lucide-react';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  DATE_PRESETS,
  OPERATORS,
  OPERATOR_LABEL,
  defaultOperator,
  directionLabels,
  isMissing,
  newId,
  valueless,
  type DatePreset,
  type DateValue,
  type FieldDef,
  type FieldType,
  type Group,
  type Operator,
  type Rule,
  type Sort,
} from '@/src/shared/listQuery/engine';
import styles from './ListQuery.module.css';

export const TYPE_ICON: Record<FieldType, LucideIcon> = {
  text: Type,
  number: Hash,
  currency: Hash,
  time: Clock3,
  date: Calendar,
  select: Tag,
  checkbox: CheckSquare,
};

// ---------------------------------------------------------------------------
// Chip text

function money(n: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n);
}
function minutesLabel(m: number) {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
function dateLabel(v: DateValue): string {
  if ('preset' in v) return DATE_PRESETS.find((p) => p.id === v.preset)?.label.toLowerCase() ?? v.preset;
  const fmt = (k: string) => {
    const [y, m, d] = k.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).replace('Sept', 'Sep');
  };
  if ('date' in v) return fmt(v.date);
  return `${fmt(v.from)} to ${fmt(v.to)}`;
}

/** "Status: Pending, Done", "Amount > 10,000", "Deadline: next 7 days". */
export function ruleSummary<T>(rule: Rule, fields: FieldDef<T>[]): string {
  const field = fields.find((f) => f.id === rule.field);
  if (!field) return 'Missing field';
  if (valueless(rule.op)) return `${field.label} ${OPERATOR_LABEL[rule.op]}`;
  const v = rule.value;
  if (v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) return field.label;
  switch (field.type) {
    case 'select': {
      const names = (v as string[]).map((x) => field.options?.find((o) => o.value === x)?.label ?? 'missing value');
      const prefix = rule.op === 'is_not' || rule.op === 'none_of' ? 'not ' : '';
      return `${field.label}: ${prefix}${names.join(', ')}`;
    }
    case 'date': {
      const op = rule.op === 'is' || rule.op === 'within' ? '' : `${OPERATOR_LABEL[rule.op].replace('is ', '')} `;
      return `${field.label}: ${op}${dateLabel(v as DateValue)}`;
    }
    case 'number':
    case 'currency':
    case 'time': {
      const f = (n: number) => (field.type === 'time' ? minutesLabel(n) : money(n));
      if (rule.op === 'between') {
        const [a, b] = v as [number, number];
        return `${field.label}: ${f(a)} to ${f(b)}`;
      }
      return `${field.label} ${OPERATOR_LABEL[rule.op]} ${f(Number(v))}`;
    }
    default:
      return `${field.label} ${OPERATOR_LABEL[rule.op]} “${String(v)}”`;
  }
}

// ---------------------------------------------------------------------------
// Field list

export function FieldPicker<T>({
  title,
  fields,
  onPick,
  footer,
}: {
  title: string;
  fields: FieldDef<T>[];
  onPick: (field: FieldDef<T>) => void;
  footer?: ReactNode;
}) {
  const [q, setQ] = useState('');
  const shown = fields.filter((f) => f.label.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className={styles.menu}>
      <label className={styles.menuSearch}>
        <Search size={15} strokeWidth={2} aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={title} aria-label={title} data-autofocus />
      </label>
      <div className={styles.menuList} role="listbox" aria-label={title}>
        {shown.map((f) => {
          const Icon = TYPE_ICON[f.type];
          return (
            <button key={f.id} type="button" role="option" aria-selected={false} className={styles.row} data-row onClick={() => onPick(f)}>
              <Icon size={16} strokeWidth={2} className={styles.rowIcon} aria-hidden />
              <span className={styles.rowLabel}>{f.label}</span>
            </button>
          );
        })}
        {shown.length === 0 && <p className={styles.menuEmpty}>No matching fields</p>}
      </div>
      {footer}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Values

const PRESETS_FOR_OP = (op: Operator) => op === 'before' || op === 'after' || op === 'on_or_before' || op === 'on_or_after';

function toTime(m: number | null | undefined) {
  return m === null || m === undefined || !Number.isFinite(m) ? '' : minutesLabel(m);
}
function fromTime(s: string) {
  if (!s) return null;
  const [h, mm] = s.split(':').map(Number);
  return h * 60 + mm;
}

export function ValueEditor<T>({
  field,
  rule,
  onChange,
  compact = false,
}: {
  field: FieldDef<T>;
  rule: Rule;
  onChange: (value: unknown) => void;
  compact?: boolean;
}) {
  if (valueless(rule.op)) return null;
  switch (field.type) {
    case 'text':
      return (
        <input
          className={styles.input}
          value={String(rule.value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Type a value…"
          aria-label={`${field.label} value`}
        />
      );
    case 'number':
    case 'currency':
    case 'time': {
      const isTime = field.type === 'time';
      const read = (s: string) => (isTime ? fromTime(s) : s === '' ? null : Number(s));
      const show = (n: unknown) => (isTime ? toTime(n as number) : n === null || n === undefined ? '' : String(n));
      if (rule.op === 'between') {
        const [a, b] = (Array.isArray(rule.value) ? rule.value : [null, null]) as [number | null, number | null];
        return (
          <div className={styles.inputPair}>
            <input
              className={styles.input}
              type={isTime ? 'time' : 'number'}
              inputMode="decimal"
              value={show(a)}
              onChange={(e) => onChange([read(e.target.value), b])}
              aria-label={`${field.label} from`}
            />
            <span>and</span>
            <input
              className={styles.input}
              type={isTime ? 'time' : 'number'}
              inputMode="decimal"
              value={show(b)}
              onChange={(e) => onChange([a, read(e.target.value)])}
              aria-label={`${field.label} to`}
            />
          </div>
        );
      }
      return (
        <input
          className={styles.input}
          type={isTime ? 'time' : 'number'}
          inputMode="decimal"
          value={show(rule.value)}
          onChange={(e) => onChange(read(e.target.value))}
          placeholder={field.type === 'currency' ? 'Amount' : 'Number'}
          aria-label={`${field.label} value`}
        />
      );
    }
    case 'date':
      return <DateValueEditor value={(rule.value as DateValue | null) ?? null} onChange={onChange} compact={compact} op={rule.op} />;
    case 'select': {
      const chosen = (rule.value as string[] | null) ?? [];
      const single = rule.op === 'is' || rule.op === 'is_not';
      return (
        <div className={styles.checklist} role={single ? 'radiogroup' : 'group'} aria-label={field.label}>
          {(field.options ?? []).map((o) => {
            const on = chosen.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                role={single ? 'radio' : 'checkbox'}
                aria-checked={on}
                className={styles.row}
                data-row
                onClick={() => onChange(single ? (on ? [] : [o.value]) : on ? chosen.filter((x) => x !== o.value) : [...chosen, o.value])}
              >
                <span className={styles.check} data-on={on || undefined} data-single={single || undefined} aria-hidden />
                <span className={styles.optionChip} style={o.color ? { ['--oc' as string]: o.color } : undefined}>
                  {o.label}
                </span>
              </button>
            );
          })}
          {/* Values that no longer exist (a deleted project, bucket…). */}
          {chosen
            .filter((x) => !(field.options ?? []).some((o) => o.value === x))
            .map((x) => (
              <button key={x} type="button" className={styles.row} data-row data-missing onClick={() => onChange(chosen.filter((y) => y !== x))}>
                <X size={14} strokeWidth={2.5} aria-hidden />
                <span className={styles.rowLabel}>Missing value, remove</span>
              </button>
            ))}
        </div>
      );
    }
    default:
      return null;
  }
}

function DateValueEditor({
  value,
  onChange,
  compact,
  op,
}: {
  value: DateValue | null;
  onChange: (v: DateValue) => void;
  compact: boolean;
  op: Operator;
}) {
  const [mode, setMode] = useState<'preset' | 'date' | 'range'>(value && 'from' in value ? 'range' : value && 'date' in value ? 'date' : 'preset');
  const presets = PRESETS_FOR_OP(op) ? DATE_PRESETS.filter((p) => p.id !== 'overdue') : DATE_PRESETS;
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return (
    <div className={styles.dateEditor}>
      {!compact && (
        <div className={styles.presetGrid}>
          {presets.map((p) => (
            <button
              key={p.id}
              type="button"
              data-row
              aria-pressed={mode === 'preset' && value !== null && 'preset' in value && value.preset === p.id}
              onClick={() => {
                setMode('preset');
                onChange({ preset: p.id });
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
      {compact && (
        <select
          className={styles.select}
          value={value && 'preset' in value ? value.preset : mode}
          onChange={(e) => {
            const v = e.target.value;
            if (v === 'date' || v === 'range') {
              setMode(v);
              onChange(v === 'date' ? { date: todayKey } : { from: todayKey, to: todayKey });
            } else {
              setMode('preset');
              onChange({ preset: v as DatePreset });
            }
          }}
          aria-label="Date"
        >
          {presets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
          <option value="date">Custom date</option>
          <option value="range">Custom range</option>
        </select>
      )}
      {!compact && (
        <div className={styles.customRow}>
          <button
            type="button"
            data-row
            aria-pressed={mode === 'date'}
            onClick={() => {
              setMode('date');
              onChange({ date: value && 'date' in value ? value.date : todayKey });
            }}
          >
            Custom date
          </button>
          <button
            type="button"
            data-row
            aria-pressed={mode === 'range'}
            onClick={() => {
              setMode('range');
              onChange(value && 'from' in value ? value : { from: todayKey, to: todayKey });
            }}
          >
            Custom range
          </button>
        </div>
      )}
      {mode === 'date' && value && 'date' in value && (
        <input className={styles.input} type="date" value={value.date} onChange={(e) => e.target.value && onChange({ date: e.target.value })} aria-label="Date" />
      )}
      {mode === 'range' && value && 'from' in value && (
        <div className={styles.inputPair}>
          <input className={styles.input} type="date" value={value.from} onChange={(e) => e.target.value && onChange({ ...value, from: e.target.value })} aria-label="From" />
          <span>to</span>
          <input className={styles.input} type="date" value={value.to} onChange={(e) => e.target.value && onChange({ ...value, to: e.target.value })} aria-label="To" />
        </div>
      )}
    </div>
  );
}

/** A native select styled as the menus' dropdown. */
function Dropdown<V extends string>({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: V;
  options: { value: V; label: string }[];
  onChange: (v: V) => void;
  label: string;
  className?: string;
}) {
  return (
    <span className={`${styles.dropdown} ${className ?? ''}`}>
      <select value={value} onChange={(e) => onChange(e.target.value as V)} aria-label={label}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown size={13} strokeWidth={2.5} aria-hidden />
    </span>
  );
}

/** A small inline menu behind a "…" button. */
function DotsMenu({ items, label }: { items: { label: string; icon: LucideIcon; onSelect: () => void; danger?: boolean }[]; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className={styles.dots}>
      <button type="button" className={styles.iconButtonSmall} aria-label={label} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <MoreHorizontal size={16} strokeWidth={2} />
      </button>
      {open && (
        <span className={styles.dotsMenu} role="menu">
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              data-row
              className={styles.row}
              data-danger={it.danger || undefined}
              onClick={() => {
                setOpen(false);
                it.onSelect();
              }}
            >
              <it.icon size={15} strokeWidth={2} className={styles.rowIcon} aria-hidden />
              <span className={styles.rowLabel}>{it.label}</span>
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// One filter's editor

export function FilterEditor<T>({
  rule,
  fields,
  onChange,
  onDelete,
  onMoveToAdvanced,
}: {
  rule: Rule;
  fields: FieldDef<T>[];
  onChange: (rule: Rule) => void;
  onDelete: () => void;
  onMoveToAdvanced: () => void;
}) {
  const field = fields.find((f) => f.id === rule.field);
  const missing = isMissing(rule, fields);
  if (!field) {
    return (
      <div className={styles.menu}>
        <p className={styles.missingNote}>This filter’s field no longer exists.</p>
        <button type="button" className={styles.row} data-row data-danger onClick={onDelete}>
          <Trash2 size={15} strokeWidth={2} className={styles.rowIcon} aria-hidden />
          <span className={styles.rowLabel}>Delete filter</span>
        </button>
      </div>
    );
  }
  return (
    <div className={styles.menu}>
      <div className={styles.editorHead}>
        <span className={styles.editorField}>{field.label}</span>
        <Dropdown
          value={rule.op}
          label="Condition"
          options={OPERATORS[field.type].map((op) => ({ value: op, label: OPERATOR_LABEL[op] }))}
          onChange={(op) => {
            // Switching between single and multi value keeps what fits.
            let value = rule.value;
            if (field.type === 'number' || field.type === 'currency' || field.type === 'time') {
              if (op === 'between' && !Array.isArray(value)) value = [value ?? null, null];
              if (op !== 'between' && Array.isArray(value)) value = value[0] ?? null;
            }
            if (field.type === 'select' && (op === 'is' || op === 'is_not') && Array.isArray(value)) value = value.slice(0, 1);
            onChange({ ...rule, op, value });
          }}
        />
        <DotsMenu
          label="Filter options"
          items={[
            { label: 'Delete filter', icon: Trash2, onSelect: onDelete, danger: true },
            { label: 'Add to advanced filter', icon: ListFilter, onSelect: onMoveToAdvanced },
          ]}
        />
      </div>
      {missing && <p className={styles.missingNote}>Some chosen values no longer exist.</p>}
      <div className={styles.editorBody}>
        <ValueEditor field={field} rule={rule} onChange={(value) => onChange({ ...rule, value })} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sorts

function SortRow<T>({
  sort,
  fields,
  onChange,
  onRemove,
}: {
  sort: Sort;
  fields: FieldDef<T>[];
  onChange: (s: Sort) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sort.id });
  const field = fields.find((f) => f.id === sort.field);
  const labels = directionLabels(field ?? { type: 'text' });
  return (
    <div
      ref={setNodeRef}
      className={styles.sortRow}
      data-dragging={isDragging || undefined}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button type="button" className={styles.handle} aria-label={`Reorder ${field?.label ?? 'sort'}`} {...attributes} {...listeners}>
        <GripVertical size={16} strokeWidth={2} />
      </button>
      <Dropdown
        value={sort.field}
        label="Sort field"
        className={styles.grow}
        options={fields.filter((f) => f.sortable !== false).map((f) => ({ value: f.id, label: f.label }))}
        onChange={(fieldId) => onChange({ ...sort, field: fieldId })}
      />
      <Dropdown
        value={sort.dir}
        label="Direction"
        options={[
          { value: 'asc', label: labels.asc },
          { value: 'desc', label: labels.desc },
        ]}
        onChange={(dir) => onChange({ ...sort, dir })}
      />
      <button type="button" className={styles.iconButtonSmall} onClick={onRemove} aria-label={`Remove sort by ${field?.label ?? 'field'}`}>
        <X size={15} strokeWidth={2.25} />
      </button>
    </div>
  );
}

export function SortMenu<T>({
  sorts,
  fields,
  onChange,
  manualOrder,
}: {
  sorts: Sort[];
  fields: FieldDef<T>[];
  onChange: (sorts: Sort[]) => void;
  manualOrder?: boolean;
}) {
  const [adding, setAdding] = useState(sorts.length === 0);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const sortable = fields.filter((f) => f.sortable !== false);

  if (adding) {
    return (
      <FieldPicker
        title="Sort by…"
        fields={sortable.filter((f) => !sorts.some((s) => s.field === f.id))}
        onPick={(f) => {
          onChange([...sorts, { id: newId('s'), field: f.id, dir: 'asc' }]);
          setAdding(false);
        }}
      />
    );
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = sorts.findIndex((s) => s.id === active.id);
    const to = sorts.findIndex((s) => s.id === over.id);
    onChange(arrayMove(sorts, from, to));
  }

  return (
    <div className={styles.menu}>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={sorts.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <div className={styles.sortRows}>
            {sorts.map((s, i) => (
              <SortRow
                key={s.id}
                sort={s}
                fields={fields}
                onChange={(next) => onChange(sorts.map((x, j) => (j === i ? next : x)))}
                onRemove={() => onChange(sorts.filter((_, j) => j !== i))}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      {manualOrder && <p className={styles.menuNote}>Manual order is paused while sorting.</p>}
      <div className={styles.menuFooter}>
        <button type="button" className={styles.row} data-row onClick={() => setAdding(true)}>
          <Plus size={15} strokeWidth={2.25} className={styles.rowIcon} aria-hidden />
          <span className={styles.rowLabel}>Add sort</span>
        </button>
        <button type="button" className={styles.row} data-row data-danger onClick={() => onChange([])}>
          <Trash2 size={15} strokeWidth={2} className={styles.rowIcon} aria-hidden />
          <span className={styles.rowLabel}>Delete sort</span>
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Advanced filter

function blankRule<T>(fields: FieldDef<T>[]): Rule {
  const f = fields.find((x) => x.filterable !== false) ?? fields[0];
  return { id: newId(), kind: 'rule', field: f.id, op: defaultOperator(f.type), value: null };
}

function RuleLine<T>({
  rule,
  index,
  conj,
  fields,
  onConj,
  onChange,
  onDelete,
  onDuplicate,
}: {
  rule: Rule;
  index: number;
  conj: 'and' | 'or';
  fields: FieldDef<T>[];
  onConj: (c: 'and' | 'or') => void;
  onChange: (r: Rule) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const field = fields.find((f) => f.id === rule.field);
  return (
    <div className={styles.ruleLine}>
      <div className={styles.ruleTop}>
        {index === 0 ? (
          <span className={styles.where}>Where</span>
        ) : index === 1 ? (
          <Dropdown
            value={conj}
            label="And or or"
            options={[
              { value: 'and', label: 'And' },
              { value: 'or', label: 'Or' },
            ]}
            onChange={onConj}
          />
        ) : (
          <span className={styles.where}>{conj === 'and' ? 'And' : 'Or'}</span>
        )}
        <Dropdown
          value={rule.field}
          label="Field"
          className={styles.grow}
          options={fields.filter((f) => f.filterable !== false).map((f) => ({ value: f.id, label: f.label }))}
          onChange={(fieldId) => {
            const f = fields.find((x) => x.id === fieldId)!;
            onChange({ ...rule, field: fieldId, op: defaultOperator(f.type), value: null });
          }}
        />
        <DotsMenu
          label="Rule options"
          items={[
            { label: 'Duplicate', icon: Copy, onSelect: onDuplicate },
            { label: 'Delete', icon: Trash2, onSelect: onDelete, danger: true },
          ]}
        />
      </div>
      {field && (
        <div className={styles.ruleBottom}>
          <Dropdown
            value={rule.op}
            label="Condition"
            options={OPERATORS[field.type].map((op) => ({ value: op, label: OPERATOR_LABEL[op] }))}
            onChange={(op) => onChange({ ...rule, op, value: op === 'between' ? [null, null] : field.type === 'select' ? [] : rule.value })}
          />
          <div className={styles.grow}>
            <ValueEditor field={field} rule={rule} onChange={(value) => onChange({ ...rule, value })} compact />
          </div>
        </div>
      )}
    </div>
  );
}

function GroupEditor<T>({
  group,
  fields,
  onChange,
  nested,
  onDeleteGroup,
}: {
  group: Group;
  fields: FieldDef<T>[];
  onChange: (g: Group) => void;
  nested: boolean;
  onDeleteGroup?: () => void;
}) {
  const setRules = (rules: Group['rules']) => onChange({ ...group, rules });
  return (
    <div className={nested ? styles.nestedGroup : undefined}>
      {group.rules.map((r, i) =>
        r.kind === 'group' ? (
          <div key={r.id} className={styles.ruleLine}>
            <div className={styles.ruleTop}>
              {i === 0 ? (
                <span className={styles.where}>Where</span>
              ) : i === 1 ? (
                <Dropdown
                  value={group.conj}
                  label="And or or"
                  options={[
                    { value: 'and', label: 'And' },
                    { value: 'or', label: 'Or' },
                  ]}
                  onChange={(conj) => onChange({ ...group, conj })}
                />
              ) : (
                <span className={styles.where}>{group.conj === 'and' ? 'And' : 'Or'}</span>
              )}
              <span className={styles.groupLabel}>Group</span>
            </div>
            <GroupEditor
              group={r}
              fields={fields}
              nested
              onChange={(g) => setRules(group.rules.map((x, j) => (j === i ? g : x)))}
              onDeleteGroup={() => setRules(group.rules.filter((_, j) => j !== i))}
            />
          </div>
        ) : (
          <RuleLine
            key={r.id}
            rule={r}
            index={i}
            conj={group.conj}
            fields={fields}
            onConj={(conj) => onChange({ ...group, conj })}
            onChange={(next) => setRules(group.rules.map((x, j) => (j === i ? next : x)))}
            onDelete={() => setRules(group.rules.filter((_, j) => j !== i))}
            onDuplicate={() => setRules([...group.rules.slice(0, i + 1), { ...r, id: newId() }, ...group.rules.slice(i + 1)])}
          />
        )
      )}
      <div className={styles.builderActions}>
        <button type="button" className={styles.textButton} onClick={() => setRules([...group.rules, blankRule(fields)])}>
          <Plus size={14} strokeWidth={2.5} aria-hidden /> Add filter rule
        </button>
        {!nested && (
          <button
            type="button"
            className={styles.textButton}
            onClick={() => setRules([...group.rules, { id: newId('g'), kind: 'group', conj: 'or', rules: [blankRule(fields)] }])}
          >
            <Plus size={14} strokeWidth={2.5} aria-hidden /> Add filter group
          </button>
        )}
        {nested && onDeleteGroup && (
          <button type="button" className={styles.textButton} data-danger onClick={onDeleteGroup}>
            <Trash2 size={13} strokeWidth={2.25} aria-hidden /> Delete group
          </button>
        )}
      </div>
    </div>
  );
}

export function AdvancedBuilder<T>({
  group,
  fields,
  onChange,
  onDelete,
}: {
  group: Group;
  fields: FieldDef<T>[];
  onChange: (g: Group) => void;
  onDelete: () => void;
}) {
  return (
    <div className={`${styles.menu} ${styles.builder}`}>
      <div className={styles.builderHead}>
        <span className={styles.editorField}>Advanced filter</span>
        <button type="button" className={styles.textButton} data-danger onClick={onDelete}>
          <Trash2 size={13} strokeWidth={2.25} aria-hidden /> Delete
        </button>
      </div>
      <GroupEditor group={group} fields={fields} onChange={onChange} nested={false} />
    </div>
  );
}

export { blankRule };
