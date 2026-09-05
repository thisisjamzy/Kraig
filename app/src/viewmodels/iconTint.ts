// A small set of distinct hues for "icon on a faint colored circle" badges
// throughout the app (Settings action rows, Home quick actions, task/agenda
// icons, the add-menu bottom sheet, etc.) — before this, every one of those
// badges used the same flat `var(--color-surface)` grey regardless of what
// icon sat on it. The icon glyph itself is untouched (still currentColor);
// only the circle behind it picks up a faint tint, cycled by list position
// (or some other stable attribute — see each call site) so a column of
// icons reads as varied rather than one flat grey stripe.
//
// Same color-mix(in srgb, <hue> 18%, transparent) formula
// src/widgets/TaskCard/TaskCard.module.css's priority/status chips already
// used for exactly this kind of faint chip — this just generalizes it to a
// rotating set of hues instead of one fixed semantic color per chip.
export const ICON_TINT_HUES = [
  '#7b7ef3', // indigo
  '#22c55e', // green
  '#f97316', // orange
  '#ec4899', // pink
  '#14b8a6', // teal
  '#eab308', // yellow
  '#3b82f6', // blue
  '#ef4444', // red
] as const;

export function iconTint(index: number): string {
  const hue = ICON_TINT_HUES[((index % ICON_TINT_HUES.length) + ICON_TINT_HUES.length) % ICON_TINT_HUES.length];
  return `color-mix(in srgb, ${hue} 18%, transparent)`;
}
