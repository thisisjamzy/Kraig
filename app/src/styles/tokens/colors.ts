// Single source of truth for color values.
// Do not import this file directly in components. Use the useColorTheme hook instead.

export const colors = {
  light: {
    background: '#ffffff',
    surface: '#f5f5f7',
    textPrimary: '#111114',
    textSecondary: '#5c5c66',
    primary: '#2563eb',
    primaryHover: '#1d4ed8',
    accent: '#2563eb',
    secondary: '#1e40af',
    border: '#e2e2e7',
    success: '#16a34a',
    warning: '#d97706',
    danger: '#dc2626',
  },
  dark: {
    background: '#111114',
    surface: '#1b1b20',
    textPrimary: '#f5f5f7',
    textSecondary: '#a3a3ad',
    primary: '#3b82f6',
    primaryHover: '#60a5fa',
    accent: '#3b82f6',
    secondary: '#60a5fa',
    border: '#2c2c33',
    success: '#22c55e',
    warning: '#f59e0b',
    danger: '#ef4444',
  },
} as const;

export type ColorScheme = keyof typeof colors;
// Record<...string>, not `typeof colors.light` — that would pin ColorTokens to
// light's literal hex values, which colors.dark (different literals, same
// shape) then fails to satisfy.
export type ColorTokens = Record<keyof typeof colors.light, string>;
