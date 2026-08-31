export const radii = {
  radiusSmall: '4px',
  radiusMedium: '8px',
  radiusLarge: '16px',
  radiusFull: '9999px',
} as const;

export type RadiiTokens = typeof radii;
