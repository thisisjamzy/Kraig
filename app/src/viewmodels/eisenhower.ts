// The Eisenhower matrix behind the Focus board: important × urgent.
//
// A task's quadrant is its stored `quadrant` when it has one (dragged on
// the board, or picked on the task form); otherwise it's derived live:
//   important = priority very important or important (Urgent / High)
//   urgent    = due within URGENT_WITHIN_DAYS days, or overdue
// so an unassigned task drifts into "Do first" as its deadline nears.

import type { Priority, Quadrant } from '@/src/shared/firestore/types';

export const URGENT_WITHIN_DAYS = 2;

export interface QuadrantMeta {
  id: Quadrant;
  label: string;
  hint: string;
  important: boolean;
  urgent: boolean;
}

export const QUADRANTS: QuadrantMeta[] = [
  { id: 'do', label: 'Do first', hint: 'Urgent and important', important: true, urgent: true },
  { id: 'schedule', label: 'Schedule', hint: 'Important, not urgent', important: true, urgent: false },
  { id: 'delegate', label: 'Delegate', hint: 'Urgent, not important', important: false, urgent: true },
  { id: 'eliminate', label: 'Eliminate', hint: 'Not urgent, not important', important: false, urgent: false },
];

export const QUADRANT_BY_ID: Record<Quadrant, QuadrantMeta> = Object.fromEntries(
  QUADRANTS.map((q) => [q.id, q])
) as Record<Quadrant, QuadrantMeta>;

export function isImportant(priority: Priority): boolean {
  return priority === 'Urgent' || priority === 'High';
}

export function isQuadrant(value: string | null | undefined): value is Quadrant {
  return value === 'do' || value === 'schedule' || value === 'delegate' || value === 'eliminate';
}

export function deriveQuadrant(priority: Priority, due: Date | null, now: Date): Quadrant {
  const urgent = due !== null && due.getTime() - now.getTime() <= URGENT_WITHIN_DAYS * 24 * 3600 * 1000;
  const important = isImportant(priority);
  return important ? (urgent ? 'do' : 'schedule') : urgent ? 'delegate' : 'eliminate';
}

export function taskQuadrant(
  task: { quadrant?: Quadrant | null; priority: Priority; dueDate: Date | null; startTime?: Date | null },
  now: Date
): Quadrant {
  return task.quadrant ?? deriveQuadrant(task.priority, task.dueDate ?? task.startTime ?? null, now);
}

/** Moving into a quadrant keeps priority (importance) in line with it:
 * into an important quadrant lifts normal/low to important; out of one
 * drops very important/important to normal. Otherwise unchanged. */
export function priorityForQuadrant(current: Priority, quadrant: Quadrant): Priority {
  const wantImportant = QUADRANT_BY_ID[quadrant].important;
  if (wantImportant === isImportant(current)) return current;
  return wantImportant ? 'High' : 'Medium';
}
