// PARA (Areas/Projects/Tasks) presentation config — PRD Files/PRD-PROJECTS.md
// section 9 explicitly says "no new tokens": this reuses the exact same
// swatches src/viewmodels/wallets.ts's WALLET_COLORS already established as
// this app's real color palette, just picked from a grid instead of
// assigned by list position, since an area/project's color is a deliberate
// user choice, not an auto-cycled one.

import { CircleDot, Users, CalendarDays, type LucideIcon } from 'lucide-react';
import type { TaskType, Priority, GoalItemNecessity } from '@/src/shared/firestore/types';

export const PROJECT_COLORS = [
  '#7b7ef3',
  '#f88686',
  '#ff9800',
  '#3a81f8',
  '#0097a7',
  '#fac021',
  '#8bc34a',
  '#e91e63',
] as const;

// A small curated set rather than a full emoji-picker library (this app has
// none, and pulling one in for an optional decorative field on three
// collections isn't worth the dependency) — enough variety to cover a
// household's real areas/projects/tasks (Health, Home, Finance, Travel,
// Work, a fence-painting project, a gym task, ...). "No emoji" is always a
// separate explicit option in the picker UI itself, not one of these.
export const EMOJI_OPTIONS = [
  '🏠', '💼', '💰', '🏋️', '🩺', '📚', '✈️', '🚗',
  '🎨', '🎵', '🍳', '🌱', '🐾', '👨‍👩‍👧', '🎯', '⚡',
  '🛠️', '📅', '🧹', '🎓', '💻', '📷', '🎁', '⭐',
] as const;

export const TASK_TYPES: TaskType[] = ['ToDo', 'Meeting', 'Event'];
export const TASK_TYPE_LABEL: Record<TaskType, string> = {
  ToDo: 'To-do',
  Meeting: 'Meeting',
  Event: 'Event',
};
export const TASK_TYPE_ICON: Record<TaskType, LucideIcon> = {
  ToDo: CircleDot,
  Meeting: Users,
  Event: CalendarDays,
};

export const PRIORITY_LEVELS: Priority[] = ['High', 'Medium', 'Low'];
// Legacy projects/tasks written before priority existed default to Medium
// wherever they're read (never stored as undefined going forward).
export const DEFAULT_PRIORITY: Priority = 'Medium';

export const NECESSITY_OPTIONS: GoalItemNecessity[] = ['MustHave', 'NiceToHave'];
export const NECESSITY_LABEL: Record<GoalItemNecessity, string> = {
  MustHave: 'Must have',
  NiceToHave: 'Nice to have',
};
// Legacy goal line items written before necessity existed default to Nice
// to have wherever they're read — the safer assumption when a household
// never actually tagged something as essential.
export const DEFAULT_NECESSITY: GoalItemNecessity = 'NiceToHave';

// "Too many overdue tasks" for a project's At Risk indicator — 2 rather
// than 1, so a single slipped date doesn't flag a project that's otherwise
// on track; a real pattern of slippage does.
export const AT_RISK_OVERDUE_THRESHOLD = 2;
