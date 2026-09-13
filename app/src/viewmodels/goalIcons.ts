// A stable, colorful circle per goal — GoalsScreen's own Explore row shows
// the goal name's first letter centered in it. Stable by name (not list
// position), so archiving/reordering never reshuffles a goal's own color.
// Reuses iconTint's existing "icon on a faint colored circle" convention
// (Settings rows, Home quick actions, etc.) rather than inventing a second
// color system.
import { iconTint } from './iconTint';

function hashString(label: string): number {
  let hash = 0;
  for (let i = 0; i < label.length; i++) {
    hash = (hash * 31 + label.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function goalIconTint(name: string): string {
  return iconTint(hashString(name));
}

export function goalInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?';
}
