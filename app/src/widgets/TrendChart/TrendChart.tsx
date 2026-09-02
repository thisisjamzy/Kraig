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
  const xFor = (index: number) => (points.length > 1 ? (index / (points.length - 1)) * (width - 40) + 20 : width / 2);
  const yFor = (value: number) => 85 - (value / max) * 75;

  return (
    <div ref={containerRef} className={styles.scroll}>
      <svg viewBox={`0 0 ${width} 100`} width={width} height={90} className={styles.svg}>
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
      <div className={styles.labelsRow} style={{ width }}>
        {points.map((point, index) => (
          <span key={index} className={styles.label} style={{ flexBasis: width / points.length }}>
            {point.label}
          </span>
        ))}
      </div>
    </div>
  );
}
