// PARA (Areas/Projects/Tasks) presentation config — PRD Files/PRD-PROJECTS.md
// section 9 explicitly says "no new tokens": this reuses the exact same
// swatches src/viewmodels/wallets.ts's WALLET_COLORS already established as
// this app's real color palette, just picked from a grid instead of
// assigned by list position, since an area/project's color is a deliberate
// user choice, not an auto-cycled one.

import { CircleDot, Users, CalendarDays, type LucideIcon } from 'lucide-react';
import type { TaskType, TaskStatus, Priority, GoalItemNecessity } from '@/src/shared/firestore/types';

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

// A task has no color of its own to pick (unlike an area/project) — TaskCard
// (Design/task1.jpg, task2.jpg's vivid gradient cards) instead hashes the
// task's own id into this same palette, same technique as
// viewmodels/categories.ts's categoryAccentColor, so the same task always
// lands on the same color without storing one.
export function taskCardColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return PROJECT_COLORS[Math.abs(hash) % PROJECT_COLORS.length];
}

function hashString(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

// Projects have no cover image of their own to pick — the Projects home
// carousel (Design/task5.JPG's "Welcome, Salung" frame) instead hashes the
// project's own id into a small curated set of real Unsplash photos, same
// technique as taskCardColor above, so a project keeps the same cover
// across renders/sessions without storing one. Direct images.unsplash.com
// CDN hotlinks (Unsplash's own recommended usage for this — no API key or
// download-tracking call needed just to display a photo), sized/compressed
// via Unsplash's own imgix query params rather than the full-resolution
// original.
const PROJECT_COVER_PHOTO_IDS = [
  '1517245386807-bb43f82c33c4', // desk/workspace
  '1522202176988-66273c2fd55f', // notebook + plant
  '1454165804606-c3d57bc86b40', // team workspace
  '1497215728101-856f4ea42174', // laptop on desk
  '1531403009284-440f080d1e12', // sticky notes planning
  '1460925895917-afdab827c52f', // analytics on laptop
  '1519389950473-47ba0277781c', // team meeting
  '1504384308090-c894fdcc538d', // office plants/desk
  '1508385082359-f38ae991e8f2', // workspace overhead
  '1552664730-d307ca884978', // team collaboration
  '1553877522-43269d4ea984', // charts/whiteboard
  '1542744173-8e7e53415bb0', // laptop coffee desk
] as const;

export function projectCoverImageUrl(id: string, width = 480): string {
  const photoId = PROJECT_COVER_PHOTO_IDS[hashString(id) % PROJECT_COVER_PHOTO_IDS.length];
  return `https://images.unsplash.com/photo-${photoId}?w=${width}&q=60&auto=format&fit=crop`;
}

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

export const TASK_STATUSES: TaskStatus[] = ['Pending', 'Stuck', 'In Review', 'Done'];

// A task's real status: the stored field when present, otherwise derived
// from `done` alone for a task written before status existed — never read
// task.status directly, always through this (TaskQuickActionsMenu, TaskCard,
// filters).
export function resolveTaskStatus(task: { status?: TaskStatus; done: boolean }): TaskStatus {
  return task.status ?? (task.done ? 'Done' : 'Pending');
}

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
