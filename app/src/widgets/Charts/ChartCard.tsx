'use client';

// The only card wrapper on the dashboards: header (title, subtitle, the
// Linear / Log switch where the chart has a scale, the info button), the
// "How to read this chart" panel inline under it, a legend, one chart and
// one insight line, plus loading, empty and error states. Only one guide is
// open on the page (GuideProvider); Escape or "Got it" closes it and puts
// focus back on its button.

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { GUIDE, LOG_GUIDE, type ChartType } from '@/src/shared/dashboard/guides';
import type { ScaleMode } from '@/src/shared/dashboard/scale';
import s from './Charts.module.css';

// ---- One open guide per page ----

interface GuideState {
  open: string | null;
  setOpen: (id: string | null) => void;
}
const GuideContext = createContext<GuideState | null>(null);

export function GuideProvider({ resetKey, children }: { resetKey: string; children: ReactNode }) {
  const [state, setState] = useState<{ key: string; open: string | null }>({ key: resetKey, open: null });
  // Switching period closes any open guide.
  const open = state.key === resetKey ? state.open : null;
  const setOpen = useCallback((id: string | null) => setState({ key: resetKey, open: id }), [resetKey]);
  const value = useMemo(() => ({ open, setOpen }), [open, setOpen]);
  return <GuideContext.Provider value={value}>{children}</GuideContext.Provider>;
}

function useGuide(id: string) {
  const ctx = useContext(GuideContext);
  const [local, setLocal] = useState(false);
  const open = ctx ? ctx.open === id : local;
  const setOpen = (next: boolean) => (ctx ? ctx.setOpen(next ? id : null) : setLocal(next));
  return { open, setOpen };
}

function InfoButton({ open, onToggle, controls, small, buttonRef }: { open: boolean; onToggle: () => void; controls: string; small?: boolean; buttonRef: React.RefObject<HTMLButtonElement | null> }) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className={`${s.info} ${small ? s.infoSmall : ''}`}
      aria-label="How to read this chart"
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
    >
      i
    </button>
  );
}

function GuidePanel({ id, type, override, custom, log, onClose }: { id: string; type: ChartType; override?: string; custom?: { title: string; text: string }; log: boolean; onClose: () => void }) {
  const guide = custom ?? GUIDE[type];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div id={id} className={s.guide} role="region" aria-label={guide.title}>
      <strong>{guide.title}</strong>
      <p>{override ?? guide.text}</p>
      {log && <p>{LOG_GUIDE}</p>}
      <button type="button" className={s.guideClose} onClick={onClose}>
        Got it
      </button>
    </div>
  );
}

export function ScaleSwitch({ mode, onChange }: { mode: ScaleMode; onChange: (mode: ScaleMode) => void }) {
  return (
    <span className={s.scale} role="group" aria-label="Scale">
      <button type="button" aria-pressed={mode === 'linear'} onClick={() => onChange('linear')}>
        Linear
      </button>
      <button type="button" aria-pressed={mode === 'log'} onClick={() => onChange('log')}>
        Log
      </button>
    </span>
  );
}

export interface LegendItem {
  label: string;
  color?: string;
  /** A dashed line (a reference or target) instead of a swatch. */
  line?: boolean;
  hatch?: 'primary' | 'accent';
  outline?: boolean;
}

export function Legend({ items }: { items: LegendItem[] }) {
  if (!items.length) return null;
  return (
    <ul className={s.legend}>
      {items.map((item) => (
        <li key={item.label}>
          {item.line ? (
            <span className={s.swatchLine} aria-hidden />
          ) : (
            <span
              className={`${s.swatch} ${item.hatch === 'primary' ? s.hatch : item.hatch === 'accent' ? s.hatchAccent : ''}`}
              style={item.outline ? { border: '1.5px dashed var(--c-future)' } : { background: item.color }}
              aria-hidden
            />
          )}
          {item.label}
        </li>
      ))}
    </ul>
  );
}

export type CardState = { status: 'ready' } | { status: 'loading' } | { status: 'empty'; text: string; href?: string; linkText?: string } | { status: 'error'; onRetry: () => void };

export function ChartCard({
  title,
  subtitle,
  chartType,
  guideOverride,
  guide: customGuide,
  tools,
  scale,
  onScale,
  legend,
  insight,
  state = { status: 'ready' },
  className,
  style,
  children,
}: {
  title: string;
  subtitle?: string;
  chartType: ChartType;
  guideOverride?: string;
  /** A guide of its own (title and text) instead of the chart type's. */
  guide?: { title: string; text: string };
  /** Extra controls beside the info button (a view switch). */
  tools?: ReactNode;
  /** Present on charts that can switch to a log scale. */
  scale?: ScaleMode;
  onScale?: (mode: ScaleMode) => void;
  legend?: LegendItem[];
  insight?: string | null;
  state?: CardState;
  className?: string;
  style?: React.CSSProperties;
  children?: ReactNode;
}) {
  const id = useId();
  const guide = useGuide(id);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => {
    guide.setOpen(false);
    buttonRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guide.setOpen]);
  return (
    <section className={`${s.card} ${className ?? ''}`} style={style} aria-label={title}>
      <header className={s.cardHead}>
        <div className={s.cardTitles}>
          <h3 className={s.cardTitle}>{title}</h3>
          {subtitle && <p className={s.cardSubtitle}>{subtitle}</p>}
        </div>
        <div className={s.cardTools}>
          {tools}
          {scale && onScale && state.status === 'ready' && <ScaleSwitch mode={scale} onChange={onScale} />}
          <InfoButton open={guide.open} onToggle={() => guide.setOpen(!guide.open)} controls={`${id}-guide`} buttonRef={buttonRef} />
        </div>
      </header>
      {guide.open && <GuidePanel id={`${id}-guide`} type={chartType} override={guideOverride} custom={customGuide} log={scale === 'log'} onClose={close} />}
      {state.status === 'loading' && <div className={s.skeleton} aria-label="Loading" />}
      {state.status === 'error' && (
        <p className={s.error}>
          Couldn’t load this chart.
          <button type="button" onClick={state.onRetry}>
            Retry
          </button>
        </p>
      )}
      {state.status === 'empty' && (
        <p className={s.empty}>
          {state.text}
          {state.href && <a href={state.href}>{state.linkText ?? 'Open'}</a>}
        </p>
      )}
      {state.status === 'ready' && (
        <>
          {legend && <Legend items={legend} />}
          {children}
          {insight && <p className={s.insight}>{insight}</p>}
        </>
      )}
    </section>
  );
}

// ---- KPI tile and the hero ----

export type PillTone = 'good' | 'bad' | 'neutral';
export interface Kpi {
  label: string;
  /** Before the label (the plans' lock). */
  icon?: ReactNode;
  value: string;
  pill: { text: string; tone: PillTone; arrow?: 'up' | 'down' | null } | null;
  sub?: string;
  /** 0 to 1: progress towards a plan or target. */
  bar?: number | null;
}

export function KpiTile({ kpi }: { kpi: Kpi }) {
  const id = useId();
  const guide = useGuide(id);
  const buttonRef = useRef<HTMLButtonElement>(null);
  return (
    <section className={s.kpi} aria-label={kpi.label}>
      <div className={s.cardHead}>
        <span className={s.kpiLabel}>
          {kpi.icon}
          {kpi.label}
        </span>
        <InfoButton small open={guide.open} onToggle={() => guide.setOpen(!guide.open)} controls={`${id}-guide`} buttonRef={buttonRef} />
      </div>
      {guide.open && (
        <GuidePanel
          id={`${id}-guide`}
          type="kpi"
          log={false}
          onClose={() => {
            guide.setOpen(false);
            buttonRef.current?.focus();
          }}
        />
      )}
      <span className={s.kpiValue}>{kpi.value}</span>
      {kpi.pill && (
        <span className={s.pill} data-tone={kpi.pill.tone}>
          {kpi.pill.arrow === 'up' ? '▲ ' : kpi.pill.arrow === 'down' ? '▼ ' : ''}
          {kpi.pill.text}
        </span>
      )}
      {typeof kpi.bar === 'number' && (
        <span className={s.miniBar} aria-hidden>
          <span style={{ width: `${Math.max(0, Math.min(1, kpi.bar)) * 100}%` }} />
        </span>
      )}
      {kpi.sub && <span className={s.kpiSub}>{kpi.sub}</span>}
    </section>
  );
}

export interface SplitSegment {
  label: string;
  value: number;
  color: string;
  hatch?: 'primary' | 'accent';
}

export function SplitBar({ segments, format }: { segments: SplitSegment[]; format: (n: number) => string }) {
  const total = segments.reduce((sum, x) => sum + Math.max(0, x.value), 0) || 1;
  return (
    <>
      <div className={s.split} role="img" aria-label={segments.map((x) => `${x.label} ${format(x.value)}`).join(', ')}>
        {segments.map((x) => (
          <span
            key={x.label}
            className={x.hatch === 'primary' ? s.hatch : x.hatch === 'accent' ? s.hatchAccent : undefined}
            style={{ width: `${(Math.max(0, x.value) / total) * 100}%`, background: x.color }}
          />
        ))}
      </div>
      <Legend items={segments.map((x) => ({ label: `${x.label} ${format(x.value)}`, color: x.color, hatch: x.hatch }))} />
    </>
  );
}

/** The hero: a big headline over a split bar. */
export function HeroCard({
  label,
  value,
  sub,
  segments,
  format,
  insight,
  style,
}: {
  label: string;
  value: string;
  sub: string;
  segments: SplitSegment[];
  format: (n: number) => string;
  insight?: string | null;
  style?: React.CSSProperties;
}) {
  return (
    <ChartCard title={label} chartType="splitBar" insight={insight} style={style}>
      <span className={s.heroValue}>{value}</span>
      <span className={s.kpiSub}>{sub}</span>
      <SplitBar segments={segments} format={format} />
    </ChartCard>
  );
}
