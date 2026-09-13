// Single source of truth for color values.
// Do not import this file directly in components. Use the useColorTheme hook instead.

export const colors = {
  light: {
    page: 'rgba(247, 251, 255, 0.85)',
    background: '#ffffff',
    surface: '#f3f4fb',
    textPrimary: '#1b1b39',
    textSecondary: '#5c5f82',
    primary: '#3965fa',
    primaryHover: '#2748d6',
    accent: '#3965fa',
    secondary: '#99b7fc',
    border: 'rgba(27, 27, 57, 0.12)',
    success: '#3f8f2f',
    warning: '#a3671c',
    danger: '#d3502f',
  },
  dark: {
    page: '#14152b',
    background: '#14152b',
    surface: '#1f2140',
    textPrimary: '#f2f3ff',
    textSecondary: '#aeb2da',
    primary: '#6e8cff',
    primaryHover: '#99b7fc',
    accent: '#6e8cff',
    secondary: '#3965fa',
    border: 'rgba(233, 235, 255, 0.12)',
    success: '#7fce68',
    warning: '#ffd16b',
    danger: '#ff8b6b',
  },
} as const;

export type ColorScheme = keyof typeof colors;
// Record<...string>, not `typeof colors.light` — that would pin ColorTokens to
// light's literal hex values, which colors.dark (different literals, same
// shape) then fails to satisfy.
export type ColorTokens = Record<keyof typeof colors.light, string>;
