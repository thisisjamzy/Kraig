'use client';

// The plot frame (scale in the left gutter, gridlines, reference lines,
// labels along the bottom) and the column charts: ColumnChart (with a
// histogram mode), PairedColumnChart, StackedColumnChart and
// DivergingColumnChart. Heights come from a Scale (linear or log); labels
// stay HTML at fixed sizes. A null value is a slot still to come: an empty
// dashed outline, never a zero bar.

import type { ReactNode } from 'react';
import { makeScale, type Scale, type ScaleMode } from '@/src/shared/dashboard/scale';
import s from './Charts.module.css';

export interface RefLine {
  value: number;
  label: string;
  side?: 'left' | 'right';
  style?: 'dashed' | 'dotted';
}

export function Plot({
  scale,
  tick,
  refs = [],
  labels,
  sub,
  dense,
  footer,
  ariaLabel,
  children,
}: {
  scale: Scale;
  tick: (n: number) => string;
  refs?: RefLine[];
  labels?: { text: ReactNode; future?: boolean }[];
  sub?: { text: string; tone?: 'good' | 'bad' }[];
  dense?: boolean;
  /** Under the plot, in line with it (labels placed by the caller). */
  footer?: ReactNode;
  ariaLabel: string;
  children: ReactNode;
}) {
  return (
    <div className={s.plot}>
      <div className={s.ticks} aria-hidden>
        {scale.ticks.map((t) => (
          <span key={t} style={{ bottom: `${scale.pos(t)}%` }}>
            {tick(t)}
          </span>
        ))}
      </div>
      <div className={s.area} role="img" aria-label={ariaLabel}>
        {scale.ticks.map((t) => (
          <span key={t} className={s.gridline} style={{ bottom: `${scale.pos(t)}%` }} aria-hidden />
        ))}
        {refs.map((r) => (
          <span key={r.label} className={s.ref} data-style={r.style} style={{ bottom: `${scale.pos(r.value)}%` }} aria-hidden>
            {r.label && (
              <span className={s.refLabel} data-side={r.side ?? 'right'}>
                {r.label}
              </span>
            )}
          </span>
        ))}
        {children}
      </div>
      {labels && (
        <div className={s.xLabels} data-dense={dense || undefined} aria-hidden>
          {labels.map((l, i) => (
            <span key={i} data-future={l.future || undefined}>
              {l.text}
            </span>
          ))}
        </div>
      )}
      {sub && (
        <div className={s.xSub} data-dense={dense || undefined} aria-hidden>
          {sub.map((x, i) => (
            <span key={i} data-tone={x.tone}>
              {x.text}
            </span>
          ))}
        </div>
      )}
      {footer && <div className={s.plotFooter}>{footer}</div>}
    </div>
  );
}

const height = (scale: Scale, v: number) => `${Math.max(0, Math.min(100, scale.pos(v)))}%`;

// ---- Columns ----

export interface ColumnDatum {
  label: string;
  /** null: still to come. */
  value: number | null;
  color?: string;
}

export function ColumnChart({
  data,
  mode,
  format,
  tick,
  refs,
  histogram,
  valueLabels = true,
  ariaLabel,
}: {
  data: ColumnDatum[];
  mode: ScaleMode;
  format: (n: number) => string;
  tick: (n: number) => string;
  refs?: RefLine[];
  histogram?: boolean;
  valueLabels?: boolean;
  ariaLabel: string;
}) {
  const scale = makeScale([...data.map((d) => d.value), ...(refs ?? []).map((r) => r.value)], mode);
  const dense = data.length > 8;
  const max = Math.max(0, ...data.map((d) => d.value ?? 0));
  return (
    <Plot scale={scale} tick={tick} refs={refs} labels={data.map((d) => ({ text: d.label, future: d.value === null }))} dense={dense} ariaLabel={ariaLabel}>
      <div className={s.cols} data-dense={dense || histogram || undefined} style={histogram ? { gap: 3 } : undefined}>
        {data.map((d, i) => (
          <div key={`${d.label}-${i}`} className={s.col} title={d.value === null ? `${d.label}: still to come` : `${d.label}: ${format(d.value)}`}>
            {d.value === null ? (
              <span className={s.futureSlot} />
            ) : (
              <span
                className={s.bar}
                data-histogram={histogram || undefined}
                style={{ height: height(scale, d.value), background: d.color ?? (histogram && d.value === max && max > 0 ? 'var(--c-primary-dark)' : undefined) }}
              >
                {valueLabels && d.value > 0 && <span className={s.valueLabel}>{format(d.value)}</span>}
              </span>
            )}
          </div>
        ))}
      </div>
    </Plot>
  );
}

// ---- Paired: in (earned + borrowed) beside out ----

export interface PairedDatum {
  label: string;
  earned: number;
  borrowed: number;
  spent: number;
  future?: boolean;
}

export function PairedColumnChart({ data, mode, format, tick, ariaLabel }: { data: PairedDatum[]; mode: ScaleMode; format: (n: number) => string; tick: (n: number) => string; ariaLabel: string }) {
  const scale = makeScale(data.flatMap((d) => (d.future ? [] : [d.earned + d.borrowed, d.spent])), mode);
  const dense = data.length > 8;
  return (
    <Plot
      scale={scale}
      tick={tick}
      labels={data.map((d) => ({ text: d.label, future: d.future }))}
      sub={data.map((d) => {
        if (d.future) return { text: '' };
        const net = d.earned + d.borrowed - d.spent;
        return { text: format(net), tone: net >= 0 ? 'good' : 'bad' };
      })}
      dense={dense}
      ariaLabel={ariaLabel}
    >
      <div className={s.cols} data-dense={dense || undefined}>
        {data.map((d, i) => {
          const income = d.earned + d.borrowed;
          return (
            <div key={`${d.label}-${i}`} className={s.col} title={d.future ? `${d.label}: still to come` : `${d.label}: in ${format(income)}, out ${format(d.spent)}`}>
              {d.future ? (
                <span className={s.futureSlot} />
              ) : (
                <>
                  <span className={s.bar} data-pair data-stack style={{ height: height(scale, income) }}>
                    {income > 0 && <span className={s.seg} style={{ height: `${(d.earned / income) * 100}%`, background: 'var(--c-primary)' }} />}
                    {d.borrowed > 0 && <span className={`${s.seg} ${s.hatch}`} style={{ height: `${(d.borrowed / income) * 100}%` }} />}
                  </span>
                  <span className={s.bar} data-pair style={{ height: height(scale, d.spent), background: 'var(--c-accent)' }} />
                </>
              )}
            </div>
          );
        })}
      </div>
    </Plot>
  );
}

// ---- Stacked columns ----

export interface StackSeries {
  name: string;
  color: string;
}

export function StackedColumnChart({
  series,
  data,
  mode,
  format,
  tick,
  refs,
  ariaLabel,
}: {
  series: StackSeries[];
  /** Per column: one value per series, or null for a slot still to come. */
  data: { label: string; parts: number[] | null }[];
  mode: ScaleMode;
  format: (n: number) => string;
  tick: (n: number) => string;
  refs?: RefLine[];
  ariaLabel: string;
}) {
  const totals = data.map((d) => (d.parts ? d.parts.reduce((a, b) => a + b, 0) : null));
  const scale = makeScale([...totals, ...(refs ?? []).map((r) => r.value)], mode);
  const dense = data.length > 8;
  return (
    <Plot scale={scale} tick={tick} refs={refs} labels={data.map((d) => ({ text: d.label, future: d.parts === null }))} dense={dense} ariaLabel={ariaLabel}>
      <div className={s.cols} data-dense={dense || undefined}>
        {data.map((d, i) => {
          const total = totals[i];
          return (
            <div key={`${d.label}-${i}`} className={s.col} title={total === null ? `${d.label}: still to come` : `${d.label}: ${format(total)}`}>
              {total === null || !d.parts ? (
                <span className={s.futureSlot} />
              ) : (
                <span className={s.bar} data-stack style={{ height: height(scale, total), overflow: 'visible' }}>
                  {total > 0 && <span className={s.valueLabel}>{format(total)}</span>}
                  {d.parts.map((part, j) =>
                    part > 0 ? <span key={j} className={s.seg} style={{ height: `${(part / total) * 100}%`, background: series[j]?.color, borderRadius: 0 }} /> : null
                  )}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </Plot>
  );
}

// ---- Above and below zero ----

export function DivergingColumnChart({
  data,
  format,
  tick,
  ariaLabel,
}: {
  /** Signed: below zero is missing (accent), above is found (primary). null: still to come. */
  data: { label: string; value: number | null }[];
  format: (n: number) => string;
  tick: (n: number) => string;
  ariaLabel: string;
}) {
  const values = data.map((d) => d.value ?? 0);
  const scale = makeScale([...values, 0], 'linear', true);
  const zero = scale.pos(0);
  const dense = data.length > 8;
  return (
    <Plot scale={scale} tick={tick} labels={data.map((d) => ({ text: d.label, future: d.value === null }))} dense={dense} ariaLabel={ariaLabel}>
      <span className={s.zeroLine} style={{ bottom: `${zero}%` }} aria-hidden />
      <div className={s.cols} data-dense={dense || undefined}>
        {data.map((d, i) => {
          if (d.value === null)
            return (
              <div key={i} className={s.divCol}>
                <span className={`${s.divBar} ${s.futureSmall}`} style={{ bottom: `calc(${zero}% - 7px)` }} />
              </div>
            );
          const top = scale.pos(Math.max(0, d.value));
          const bottom = scale.pos(Math.min(0, d.value));
          const missing = d.value < 0;
          return (
            <div key={i} className={s.divCol} title={`${d.label}: ${format(d.value)}`}>
              {Math.abs(d.value) >= 0.5 && (
                <span
                  className={s.divBar}
                  style={{
                    bottom: `${bottom}%`,
                    height: `${top - bottom}%`,
                    background: missing ? 'var(--c-accent)' : 'var(--c-primary)',
                    borderRadius: missing ? '0 0 5px 5px' : '5px 5px 0 0',
                  }}
                >
                  <span className={`${s.valueLabel} ${missing ? s.valueBelow : ''}`}>{format(d.value)}</span>
                </span>
              )}
            </div>
          );
        })}
      </div>
    </Plot>
  );
}
