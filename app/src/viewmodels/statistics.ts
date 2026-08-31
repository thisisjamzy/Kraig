// statistics.dashboard's topCategories has no color of its own, so the donut
// and legend cycle through this fixed palette by list position instead —
// real presentation config, not placeholder data.
export const CATEGORY_COLORS = ['#ff9800', '#7b7ef3', '#111826', '#0097a7', '#9ca3af'] as const;

export function categoryColor(index: number) {
  return CATEGORY_COLORS[index % CATEGORY_COLORS.length];
}
