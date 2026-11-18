// PARA (Areas/Projects/Tasks) presentation config — PRD Files/PRD-PROJECTS.md
// section 9 explicitly says "no new tokens": this reuses the exact same
// swatches src/viewmodels/wallets.ts's WALLET_COLORS already established as
// this app's real color palette, just picked from a grid instead of
// assigned by list position, since an area/project's color is a deliberate
// user choice, not an auto-cycled one.

import { CircleDot, Users, CalendarDays, type LucideIcon } from 'lucide-react';
import type { TaskType, TaskStatus, Priority, BucketItemNecessity } from '@/src/shared/firestore/types';

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

// Dreda v1.0 label hues (BUILD-KIT section 3). A project or area keeps its
// stored swatch, but every coloured surface (chip, block, bar, dot) renders
// from the hue's --label-<hue>-bg / -fg / -border / -solid, never the raw
// swatch behind text. Lime is kept for "now", so no swatch maps to it.
export const LABEL_HUES = ['purple', 'blue', 'teal', 'green', 'lime', 'amber', 'orange', 'rose', 'grey'] as const;
export type LabelHue = (typeof LABEL_HUES)[number];

const SWATCH_HUE: Record<(typeof PROJECT_COLORS)[number], LabelHue> = {
  '#7b7ef3': 'purple',
  '#f88686': 'rose',
  '#ff9800': 'orange',
  '#3a81f8': 'blue',
  '#0097a7': 'teal',
  '#fac021': 'amber',
  '#8bc34a': 'green',
  '#e91e63': 'rose',
};

/** The label hue for a stored project or area colour: the swatch's own hue,
 *  or for an older stored hex, the hue of the nearest swatch. */
export function labelHue(color: string | null | undefined): LabelHue {
  const hex = (color ?? '').trim().toLowerCase();
  if (hex in SWATCH_HUE) return SWATCH_HUE[hex as keyof typeof SWATCH_HUE];
  const rgb = /^#([0-9a-f]{6})$/.exec(hex);
  if (!rgb) return 'grey';
  const n = parseInt(rgb[1], 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255];
  let best: LabelHue = 'grey';
  let bestDistance = Infinity;
  for (const swatch of PROJECT_COLORS) {
    const m = parseInt(swatch.slice(1), 16);
    const d = (r - (m >> 16)) ** 2 + (g - ((m >> 8) & 255)) ** 2 + (b - (m & 255)) ** 2;
    if (d < bestDistance) [best, bestDistance] = [SWATCH_HUE[swatch], d];
  }
  return best;
}

/** CSS variables for a label hue, for inline `style` on chips, blocks and dots. */
export function labelVars(color: string | null | undefined): { bg: string; fg: string; border: string; solid: string } {
  return hueVars(labelHue(color));
}

/** The app variables of one label hue. */
export function hueVars(hue: LabelHue): { bg: string; fg: string; border: string; solid: string } {
  return {
    bg: `var(--label-${hue}-bg)`,
    fg: `var(--label-${hue}-fg)`,
    border: `var(--label-${hue}-border)`,
    solid: `var(--label-${hue}-solid)`,
  };
}

function hashString(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

// Areas, projects, and sections have no cover image of their own to pick —
// every card for the three (ProjectCard, SectionCard,
// ProjectsScreen's own area cards) instead hashes the record's own id into
// a small curated set of real Unsplash photos, same technique as
// viewmodels/categories.ts's categoryAccentColor, so a given area/project/section keeps the same cover
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

// The built-in presets — always offered, never stored in settings/taskTypes
// (a household's own custom types are, see FirestoreTaskTypesSettings).
export const TASK_TYPES: TaskType[] = ['ToDo', 'Meeting', 'Event'];
export const TASK_TYPE_LABEL: Record<string, string> = {
  ToDo: 'To-do',
  Meeting: 'Meeting',
  Event: 'Event',
};
export const TASK_TYPE_ICON: Record<string, LucideIcon> = {
  ToDo: CircleDot,
  Meeting: Users,
  Event: CalendarDays,
};

// A custom type has no display label of its own to look up — it IS its own
// label, one capitalized word (see isValidCustomTaskType), so this only
// ever needs to translate the three built-ins' own PascalCase storage
// value ("ToDo") into their nicer display form.
export function taskTypeLabel(type: TaskType): string {
  return TASK_TYPE_LABEL[type] ?? type;
}

export function taskTypeIcon(type: TaskType): LucideIcon {
  return TASK_TYPE_ICON[type] ?? CircleDot;
}

// A custom task type (settings/taskTypes) must be exactly one capitalized
// word — enforced here once so every entry point (the Details page's own
// "add a type" field) agrees on what's valid.
export function isValidCustomTaskType(name: string): boolean {
  return /^[A-Z][a-zA-Z]*$/.test(name);
}

export const PRIORITY_LEVELS: Priority[] = ['Urgent', 'High', 'Medium', 'Low'];
// How each level reads in the UI — lowercase, per the task form's design.
// Stored values stay 'Urgent' | 'High' | 'Medium' | 'Low'.
export const PRIORITY_LABEL: Record<Priority, string> = {
  Urgent: 'very important',
  High: 'important',
  Medium: 'normal',
  Low: 'low',
};
export function priorityLabel(priority: Priority): string {
  return PRIORITY_LABEL[priority] ?? priority;
}
// Most urgent first — for sorting lists by priority.
export const PRIORITY_RANK: Record<Priority, number> = { Urgent: 0, High: 1, Medium: 2, Low: 3 };
// Legacy projects/tasks written before priority existed default to Medium
// wherever they're read (never stored as undefined going forward).
export const DEFAULT_PRIORITY: Priority = 'Medium';

export const TASK_STATUSES: TaskStatus[] = ['Pending', 'Stuck', 'In Review', 'Done', 'Cancelled'];

// A task's real status: the stored field when present, otherwise derived
// from `done` alone for a task written before status existed — never read
// task.status directly, always through this (TaskQuickActionsMenu, TaskCard,
// filters).
export function resolveTaskStatus(task: { status?: TaskStatus; done: boolean }): TaskStatus {
  return task.status ?? (task.done ? 'Done' : 'Pending');
}

export const NECESSITY_OPTIONS: BucketItemNecessity[] = ['MustHave', 'NiceToHave'];
export const NECESSITY_LABEL: Record<BucketItemNecessity, string> = {
  MustHave: 'Must have',
  NiceToHave: 'Nice to have',
};
// Legacy bucket line items written before necessity existed default to Nice
// to have wherever they're read — the safer assumption when a household
// never actually tagged something as essential.
export const DEFAULT_NECESSITY: BucketItemNecessity = 'NiceToHave';

// "Too many overdue tasks" for a project's At Risk indicator — 2 rather
// than 1, so a single slipped date doesn't flag a project that's otherwise
// on track; a real pattern of slippage does.
export const AT_RISK_OVERDUE_THRESHOLD = 2;
