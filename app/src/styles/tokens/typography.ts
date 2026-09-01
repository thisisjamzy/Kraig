// Placeholder typeface. Swap for your chosen fonts before shipping.

export const typography = {
  fontFamilyBody: "'Inter', system-ui, sans-serif",
  fontFamilyHeading: "'Inter', system-ui, sans-serif",
  fontSizeSmall: '0.875rem',
  fontSizeMedium: '1rem',
  fontSizeLarge: '1.25rem',
  fontSizeXl: '1.5rem',
  fontSizeXxl: '2rem',
  fontWeightRegular: 400,
  fontWeightMedium: 500,
  fontWeightBold: 700,
  lineHeightTight: 1.2,
  lineHeightNormal: 1.5,
} as const;

export type TypographyTokens = typeof typography;
