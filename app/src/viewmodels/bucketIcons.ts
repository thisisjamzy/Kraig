// A stable, colorful circle per bucket — BucketsScreen's own Explore row shows
// the bucket name's first letter centered in it. Stable by name (not list
// position), so archiving/reordering never reshuffles a bucket's own color.
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

export function bucketIconTint(name: string): string {
  return iconTint(hashString(name));
}

export function bucketInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?';
}
