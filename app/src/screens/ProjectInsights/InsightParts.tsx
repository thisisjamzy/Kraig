// The risk chip and progress ring used on a project's insights page
// (moved here from the old Time Insights screen, now the Time dashboard),
// with that screen's shared styles (InsightBase.module.css).

import { AlertOctagon, AlertTriangle, CheckCircle2, type LucideIcon } from 'lucide-react';
import type { ProjectRisk } from '@/src/viewmodels/insights/metrics';
import styles from './InsightBase.module.css';

const RISK_TEXT: Record<ProjectRisk, string> = {
  done: 'Done',
  'on track': 'On track',
  watch: 'Watch',
  'at risk': 'At risk',
  overdue: 'Overdue',
};
const RISK_ICON: Record<ProjectRisk, LucideIcon> = {
  done: CheckCircle2,
  'on track': CheckCircle2,
  watch: AlertTriangle,
  'at risk': AlertOctagon,
  overdue: AlertOctagon,
};

export function RiskChip({ risk }: { risk: ProjectRisk }) {
  const Icon = RISK_ICON[risk];
  return (
    <span className={styles.chip} data-risk={risk}>
      <Icon size={12} strokeWidth={2.5} aria-hidden />
      {RISK_TEXT[risk]}
    </span>
  );
}

export function ProgressRing({ value, size = 48, color }: { value: number; size?: number; color?: string }) {
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span className={styles.ring} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--i-grid)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color ?? 'var(--i-done)'}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - value)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className={styles.ringLabel}>{Math.round(value * 100)}%</span>
    </span>
  );
}
