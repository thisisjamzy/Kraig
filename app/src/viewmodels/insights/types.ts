// Insights — the shapes the pure analytics functions work on. Kept free of
// Firestore types so every metric is unit-testable with plain objects
// (src/shared/insights/adapter.ts maps tasks and projects into these).

import type { Quadrant, TimeMode } from '../../shared/firestore/types';

export type InsightStatus = 'pending' | 'done' | 'cancelled';

/** A task, or one date of a recurring series. */
export interface InsightTask {
  id: string;
  /** Set on a date of a recurring series. */
  seriesId: string | null;
  title: string;
  projectId: string | null;
  status: InsightStatus;
  /** The schedule as it stands now. */
  start: Date | null;
  end: Date | null;
  allDay: boolean;
  mode: TimeMode;
  quadrant: Quadrant;
  createdAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  /** Moved later at least once. */
  rescheduled: boolean;
  /** Minutes it really took; null = the estimate. */
  actualMinutes: number | null;
}

export interface InsightMilestone {
  id: string;
  name: string;
  due: Date;
  taskIds: string[];
  status: 'pending' | 'done';
}

export interface InsightProject {
  id: string;
  name: string;
  color: string;
  status: 'Active' | 'Completed' | 'Archived';
  startDate: Date | null;
  deadline: Date | null;
  createdAt: Date | null;
  milestones: InsightMilestone[];
}

/** Inclusive: from the start of `from`'s day to the end of `to`'s. */
export interface DateRange {
  from: Date;
  to: Date;
}

export type RangeKind = 'today' | 'week' | 'month' | 'custom';
