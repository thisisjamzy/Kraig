'use client';

// A small SVG line chart — one point per month. Spreads points evenly
// across the full width of whatever card it's in (measured via
// ResizeObserver) when there's room; once there are enough points that a
// readable 40px-per-point spacing would overflow that width, it switches to
// a fixed per-point width and the card scrolls horizontally instead of
// squeezing points together. Used by DebtDetailScreen (one debt's balance)
// and GoalsScreen's Debt tab (every debt's balance combined).

import { useLayoutEffect, useRef, useState } from 'react';
import styles from './TrendChart.module.css';

export interface TrendPoint {
  label: string;
  value: number;
}

const MIN_POINT_SPACING = 40;

// Keeps a large axis value (a wallet/debt balance can run into the
// millions) from overflowing the label gutter or overlapping the plotted
// line — same K/M abbreviation convention as src/logic/home/useLogic.ts's
// formatCompact, kept local here since this is the only shared widget that
// needs it on an SVG axis rather than a bar-chart value label.
function formatAxisValue(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return `${Math.round(value)}`;
}

export function TrendChart({ points, color }: { points: TrendPoint[]; color: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setContainerWidth(width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (points.length === 0) return null;
  const max = Math.max(...points.map((point) => point.value), 1);
  const naturalWidth = Math.max(points.length * MIN_POINT_SPACING, 120);
  const width = Math.max(naturalWidth, containerWidth);
  // Left gutter reserved for the vertical axis's value labels — the plotted
  // line and its gridlines both start after it, not at x=0.
  const AXIS_GUTTER = 26;
  const plotWidth = width - AXIS_GUTTER - 12;
  const CHART_HEIGHT = 170;
  const xFor = (index: number) =>
    points.length > 1 ? (index / (points.length - 1)) * plotWidth + AXIS_GUTTER : AXIS_GUTTER + plotWidth / 2;
  const yFor = (value: number) => CHART_HEIGHT * 0.85 - (value / max) * CHART_HEIGHT * 0.75;

  // Three horizontal gridlines (0%, 50%, 100% of max) — the vertical axis's
  // indicator lines, each labeled with the value it represents.
  const gridSteps = [0, 0.5, 1];

  return (
    <div ref={containerRef} className={styles.scroll}>
      <svg
        viewBox={`0 0 ${width} ${CHART_HEIGHT}`}
        width={width}
        height={CHART_HEIGHT - 10}
        className={styles.svg}
      >
        {gridSteps.map((step) => {
          const y = yFor(max * step);
          return (
            <g key={step}>
              <line
                x1={AXIS_GUTTER}
                y1={y}
                x2={width}
                y2={y}
                stroke="var(--color-border)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
              <text x={0} y={y} dy="3" className={styles.axisLabel}>
                {formatAxisValue(max * step)}
              </text>
            </g>
          );
        })}
        <polyline
          points={points.map((point, index) => `${xFor(index)},${yFor(point.value)}`).join(' ')}
          fill="none"
          stroke={color}
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
        {points.map((point, index) => (
          <circle key={index} cx={xFor(index)} cy={yFor(point.value)} r={3} fill={color} />
        ))}
      </svg>
      <div className={styles.labelsRow} style={{ width, paddingLeft: AXIS_GUTTER }}>
        {points.map((point, index) => (
          <span key={index} className={styles.label} style={{ flexBasis: plotWidth / points.length }}>
            {point.label}
          </span>
        ))}
      </div>
    </div>
  );
}
