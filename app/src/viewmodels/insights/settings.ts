// Insights settings: daily capacity, working hours and every alert
// threshold, with the defaults from the brief. Stored in settings/insights
// (FirestoreInsightsSettings); anything missing falls back to these.

export interface InsightsThresholds {
  /** Day overload, red: more do-first tasks than this. */
  doFirstRedCount: number;
  /** Day overload, red: more hours of stacked free tasks than this. */
  stackedFreeRedHours: number;
  /** Day overload, amber: scheduled from this % of capacity up. */
  loadWatchPercent: number;
  /** Day overload, amber: no break longer than this inside working hours. */
  minBreakMinutes: number;
  /** Overdue, red: more overdue tasks than this. */
  overdueRedCount: number;
  /** Projects, amber: schedule slack of this many days or less. */
  slackWatchDays: number;
  /** Projects, amber: velocity down more than this % on the previous 14 days. */
  velocityDropPercent: number;
  /** Milestones, red: at risk within this many days of the due date. */
  milestoneRiskDays: number;
  /** Habits, amber: a recurring task's consistency below this %. */
  consistencyWatchPercent: number;
  /** Habits, amber: reschedule rate above this %. */
  rescheduleWatchPercent: number;
  /** Habits, amber: firefighting (do-first share of hours) above this %. */
  firefightingWatchPercent: number;
  /** Habits, amber: eliminate tasks above this % of hours. */
  eliminateWatchPercent: number;
  /** A streak day needs at least this % of its tasks done. */
  streakPercent: number;
  /** Evening nudge below this % done today. */
  eveningNudgePercent: number;
}

export interface InsightsSettings {
  capacityHours: number;
  workStart: string; // "HH:mm"
  workEnd: string;
  thresholds: InsightsThresholds;
  notifyMorning: boolean;
  notifyProjectRed: boolean;
  notifyEvening: boolean;
}

export const DEFAULT_THRESHOLDS: InsightsThresholds = {
  doFirstRedCount: 3,
  stackedFreeRedHours: 2,
  loadWatchPercent: 85,
  minBreakMinutes: 30,
  overdueRedCount: 3,
  slackWatchDays: 3,
  velocityDropPercent: 30,
  milestoneRiskDays: 7,
  consistencyWatchPercent: 60,
  rescheduleWatchPercent: 30,
  firefightingWatchPercent: 40,
  eliminateWatchPercent: 10,
  streakPercent: 80,
  eveningNudgePercent: 50,
};

export const INSIGHTS_DEFAULTS: InsightsSettings = {
  capacityHours: 8,
  workStart: '08:00',
  workEnd: '18:00',
  thresholds: DEFAULT_THRESHOLDS,
  notifyMorning: true,
  notifyProjectRed: true,
  notifyEvening: true,
};

/** Labels and units for the settings screen, in display order. */
export const THRESHOLD_FIELDS: { key: keyof InsightsThresholds; label: string; unit: string; min: number; max: number }[] = [
  { key: 'loadWatchPercent', label: 'Busy day warning from', unit: '% of capacity', min: 50, max: 100 },
  { key: 'doFirstRedCount', label: 'Too many do-first tasks in a day', unit: 'tasks', min: 1, max: 20 },
  { key: 'stackedFreeRedHours', label: 'Too many stacked free tasks', unit: 'hours', min: 1, max: 12 },
  { key: 'minBreakMinutes', label: 'Shortest acceptable break', unit: 'min', min: 5, max: 120 },
  { key: 'overdueRedCount', label: 'Overdue tasks before it turns red', unit: 'tasks', min: 1, max: 50 },
  { key: 'slackWatchDays', label: 'Project slack warning', unit: 'days', min: 0, max: 30 },
  { key: 'velocityDropPercent', label: 'Project slowdown warning', unit: '%', min: 5, max: 90 },
  { key: 'milestoneRiskDays', label: 'Milestone warning window', unit: 'days', min: 1, max: 30 },
  { key: 'consistencyWatchPercent', label: 'Recurring task consistency below', unit: '%', min: 10, max: 100 },
  { key: 'rescheduleWatchPercent', label: 'Reschedule rate above', unit: '%', min: 5, max: 100 },
  { key: 'firefightingWatchPercent', label: 'Do-first share of time above', unit: '%', min: 5, max: 100 },
  { key: 'eliminateWatchPercent', label: 'Eliminate share of time above', unit: '%', min: 1, max: 100 },
  { key: 'streakPercent', label: 'Streak day needs', unit: '% done', min: 10, max: 100 },
  { key: 'eveningNudgePercent', label: 'Evening nudge below', unit: '% done', min: 10, max: 100 },
];

export function resolveSettings(doc: {
  capacityHours?: number;
  workStart?: string;
  workEnd?: string;
  thresholds?: Partial<Record<string, number>>;
  notifyMorning?: boolean;
  notifyProjectRed?: boolean;
  notifyEvening?: boolean;
} | null | undefined): InsightsSettings {
  const thresholds = { ...DEFAULT_THRESHOLDS };
  for (const key of Object.keys(DEFAULT_THRESHOLDS) as (keyof InsightsThresholds)[]) {
    const value = doc?.thresholds?.[key];
    if (typeof value === 'number' && Number.isFinite(value)) thresholds[key] = value;
  }
  return {
    capacityHours: doc?.capacityHours && doc.capacityHours > 0 ? doc.capacityHours : INSIGHTS_DEFAULTS.capacityHours,
    workStart: doc?.workStart ?? INSIGHTS_DEFAULTS.workStart,
    workEnd: doc?.workEnd ?? INSIGHTS_DEFAULTS.workEnd,
    thresholds,
    notifyMorning: doc?.notifyMorning ?? true,
    notifyProjectRed: doc?.notifyProjectRed ?? true,
    notifyEvening: doc?.notifyEvening ?? true,
  };
}
