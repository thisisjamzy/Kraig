'use client';

// A half-donut (semicircle) gauge with a value centered under the arc —
// screen2's "Activity" card look, adapted to a half circle. Segments are
// drawn as stroked arcs along one shared semicircle path; `pathLength={100}`
// normalizes that path to 100 units regardless of its actual geometry, so
// each segment's dash length is just its own percentage — no manual
// circumference math or a ref + getTotalLength() measurement needed.

import styles from './GaugeChart.module.css';

export interface GaugeSegment {
  label: string;
  value: number;
  color: string;
}

export function GaugeChart({
  segments,
  centerValue,
  centerLabel,
  size = 180,
  thickness = 18,
}: {
  segments: GaugeSegment[];
  centerValue: string;
  centerLabel: string;
  size?: number;
  thickness?: number;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const r = size / 2 - thickness / 2;
  const cx = size / 2;
  const cy = size / 2;
  // The arc's endpoints are nudged a hair short of a true 180°/0° diameter
  // on purpose — when an SVG elliptical arc's two endpoints land exactly on
  // a diameter (rx===ry and they're exactly 2r apart), several browsers'
  // arc-to-bezier conversion hits a degenerate case and silently renders a
  // full circle instead of the intended semicircle. A microscopic epsilon
  // keeps the two points a hair off-diameter, which is visually identical
  // to a true half circle but sidesteps that bug entirely.
  const EPSILON_DEG = 0.01;
  const toPoint = (angleDeg: number) => {
    const rad = (angleDeg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
  };
  const arcStart = toPoint(180 - EPSILON_DEG);
  const arcEnd = toPoint(EPSILON_DEG);
  const d = `M ${arcStart.x},${arcStart.y} A ${r},${r} 0 0 1 ${arcEnd.x},${arcEnd.y}`;
  const height = cy + thickness / 2 + 4;

  // Pure map/slice/reduce prefix sum (no mutation during render, which
  // React's purity rules disallow) — same technique as DonutChart's own
  // dashes/offsets, just against percentages instead of dash lengths.
  const visible = segments.filter((segment) => segment.value > 0);
  const pcts = visible.map((segment) => (total > 0 ? (segment.value / total) * 100 : 0));
  const arcs = visible.map((segment, index) => ({
    ...segment,
    pct: pcts[index],
    offset: pcts.slice(0, index).reduce((sum, pct) => sum + pct, 0),
  }));

  // Segments sit flush against each other (butt caps, no gaps) so a color
  // only ever shows on its own stretch of the arc, never bleeding a rounded
  // "bump" onto its neighbor at an internal boundary. Only the two true
  // outer ends of the whole gauge get a rounded look — done by overlaying a
  // small filled circle at each endpoint (in the first/last segment's own
  // color) rather than a round linecap on every segment, which would round
  // both ends of each one.
  const leftPoint = { x: cx - r, y: cy };
  const rightPoint = { x: cx + r, y: cy };

  return (
    <div className={styles.wrap}>
      <svg viewBox={`0 0 ${size} ${height}`} width={size} height={height} className={styles.svg}>
        <path d={d} pathLength={100} fill="none" stroke="var(--color-border)" strokeWidth={thickness} strokeLinecap="round" />
        {arcs.map((arc) => (
          <path
            key={arc.label}
            d={d}
            pathLength={100}
            fill="none"
            stroke={arc.color}
            strokeWidth={thickness}
            strokeDasharray={`${arc.pct} ${100 - arc.pct}`}
            strokeDashoffset={-arc.offset}
            strokeLinecap="butt"
          />
        ))}
        {arcs.length > 0 && (
          <>
            <circle cx={leftPoint.x} cy={leftPoint.y} r={thickness / 2} fill={arcs[0].color} />
            <circle cx={rightPoint.x} cy={rightPoint.y} r={thickness / 2} fill={arcs[arcs.length - 1].color} />
          </>
        )}
      </svg>
      <div className={styles.centerText}>
        <p className={styles.centerValue}>{centerValue}</p>
        <p className={styles.centerLabel}>{centerLabel}</p>
      </div>
    </div>
  );
}
