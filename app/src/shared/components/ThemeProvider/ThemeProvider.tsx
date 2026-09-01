'use client';

import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { colors, spacing, typography, radii, breakpoints } from '@/src/styles/tokens';
import type { ColorScheme, ThemeContextValue } from '@/src/shared/types/theme';

const STORAGE_KEY = 'theme-scheme';

export const ThemeContext = createContext<ThemeContextValue | null>(null);

interface ThemeProviderProps {
  children: ReactNode;
  defaultScheme?: ColorScheme;
}

export function ThemeProvider({ children, defaultScheme = 'light' }: ThemeProviderProps) {
  const [scheme, setSchemeState] = useState<ColorScheme>(defaultScheme);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY) as ColorScheme | null;
    if (stored === 'light' || stored === 'dark') {
      setSchemeState(stored);
    }
  }, []);

  const setScheme = useCallback((next: ColorScheme) => {
    setSchemeState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const toggleScheme = useCallback(() => {
    setScheme(scheme === 'light' ? 'dark' : 'light');
  }, [scheme, setScheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      scheme,
      colors: colors[scheme],
      spacing,
      typography,
      radii,
      breakpoints,
      toggleScheme,
      setScheme,
    }),
    [scheme, toggleScheme, setScheme]
  );

  return (
    <ThemeContext.Provider value={value}>
      <div data-theme={scheme}>{children}</div>
    </ThemeContext.Provider>
  );
}
