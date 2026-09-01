// Spacing scale. Access through useSpacing(), never hardcode padding or margin values.

export const spacing = {
  paddingXs: '4px',
  paddingSmall: '8px',
  paddingMedium: '16px',
  paddingLarge: '24px',
  paddingXl: '32px',
  marginXs: '4px',
  marginSmall: '8px',
  marginMedium: '16px',
  marginLarge: '24px',
  marginXl: '32px',
} as const;

export type SpacingTokens = typeof spacing;
