'use client';

// A small SVG donut — the standard stroke-dasharray-per-segment technique,
// each segment's share of the circle proportional to its value. Rotated so
// the first segment starts at 12 o'clock. Zero-value input renders nothing
// (an empty ring reads as "no data", not as data).

import styles from './DonutChart.module.css';

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

export function DonutChart({
  segments,
  size = 120,
  thickness = 16,
  legendPosition = 'right',
  centerValue,
  centerLabel,
  legendWrap = false,
}: {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  legendPosition?: 'right' | 'bottom';
  // Optional callout text over the ring's own hole — e.g. a total amount +
  // what it represents (see Design/goal1.jpg's "$2,482 / Your savings").
  centerValue?: string;
  centerLabel?: string;
  // A 'bottom' legend normally stacks one row per segment full-width —
  // legendWrap instead lets each label+value chip flow left-to-right and
  // wrap, for a bottom legend with more than a couple of segments (see
  // Goals' priority/type/category breakdown).
  legendWrap?: boolean;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  if (total <= 0) return null;
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;

  // Each segment's dash length and its cumulative offset before it — built
  // with pure map/slice/reduce (no mutation during render, which React's
  // purity rules disallow). Segment counts here are always small (a
  // handful of wallets), so the O(n^2) prefix sum is a non-issue.
  const dashes = segments.map((segment) => (segment.value / total) * circumference);
  const offsets = dashes.map((_, index) => dashes.slice(0, index).reduce((sum, dash) => sum + dash, 0));

  return (
    <div className={`${styles.wrap} ${legendPosition === 'bottom' ? styles.wrapBottom : ''}`}>
      <div className={styles.svgWrap}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={styles.svg}>
          <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            {segments.map((segment, index) => (
              <circle
                key={index}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={segment.color}
                strokeWidth={thickness}
                strokeDasharray={`${dashes[index]} ${circumference - dashes[index]}`}
                strokeDashoffset={-offsets[index]}
              />
            ))}
          </g>
        </svg>
        {(centerValue || centerLabel) && (
          <div className={styles.center}>
            {centerValue && <span className={styles.centerValue}>{centerValue}</span>}
            {centerLabel && <span className={styles.centerLabel}>{centerLabel}</span>}
          </div>
        )}
      </div>
      <div
        className={`${styles.legend} ${legendPosition === 'bottom' ? styles.legendBottom : ''} ${legendPosition === 'bottom' && legendWrap ? styles.legendWrap : ''}`}
      >
        {segments.map((segment, index) => (
          <div key={index} className={styles.legendRow}>
            <span className={styles.legendDot} style={{ background: segment.color }} />
            <span className={styles.legendLabel}>{segment.label}</span>
            <span className={styles.legendValue}>{Math.round((segment.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
