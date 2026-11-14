import { styleGuide } from './styleGuide';

// Single source of truth for color values.
// Do not import this file directly in components. Use the useColorTheme hook instead.

// The facelift (styleGuide.ts) ships light only: both schemes are its light
// values, so anything reading either looks the same.
const guide = {
  page: styleGuide.neutrals[50],
  background: styleGuide.neutrals[0],
  surface: styleGuide.neutrals[100],
  textPrimary: styleGuide.neutrals[900],
  textSecondary: styleGuide.neutrals[600],
  primary: styleGuide.brand.primary,
  primaryHover: styleGuide.brand.primaryHover,
  accent: styleGuide.brand.accent,
  secondary: styleGuide.brand.primaryLight,
  border: styleGuide.neutrals[200],
  success: styleGuide.status.success.solid,
  warning: styleGuide.status.warning.solid,
  danger: styleGuide.status.danger.solid,
};

export const colors = {
  light: guide,
  dark: guide,
} as const;

export type ColorScheme = keyof typeof colors;
// Record<...string>, not `typeof colors.light` — that would pin ColorTokens to
// light's literal hex values, which colors.dark (different literals, same
// shape) then fails to satisfy.
export type ColorTokens = Record<keyof typeof colors.light, string>;
