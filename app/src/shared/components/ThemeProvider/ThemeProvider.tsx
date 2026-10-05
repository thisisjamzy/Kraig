'use client';

import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { colors, spacing, typography, radii, breakpoints } from '@/src/styles/tokens';
import type { Appearance, ColorScheme, ThemeContextValue } from '@/src/shared/types/theme';

const STORAGE_KEY = 'theme-scheme';
// 'light', 'dark' or 'system' (follow the device); STORAGE_KEY keeps the resolved scheme.
const APPEARANCE_KEY = 'theme-appearance';

function systemScheme(): ColorScheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

interface ThemeProviderProps {
  children: ReactNode;
  defaultScheme?: ColorScheme;
}

export function ThemeProvider({ children, defaultScheme = 'light' }: ThemeProviderProps) {
  const [scheme, setSchemeState] = useState<ColorScheme>(defaultScheme);
  const [appearance, setAppearanceState] = useState<Appearance>('light');

  useEffect(() => {
    let chosen: Appearance | null = null;
    let stored: string | null = null;
    try {
      chosen = window.localStorage.getItem(APPEARANCE_KEY) as Appearance | null;
      stored = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      // Storage blocked: the default scheme stays.
    }
    const frame = requestAnimationFrame(() => {
      if (chosen === 'system') {
        setAppearanceState('system');
        setSchemeState(systemScheme());
      } else if (stored === 'light' || stored === 'dark') {
        setAppearanceState(stored);
        setSchemeState(stored);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  // Following the device: switch when it does.
  useEffect(() => {
    if (appearance !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setSchemeState(systemScheme());
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [appearance]);

  // Mirrored onto <html> itself, not just the wrapping div below — `body`
  // (styles/base/globals.css) reads `--color-background` too, but body is
  // an ANCESTOR of that div, and a CSS custom property only ever inherits
  // downward. Without this, body (and anything painted outside the app
  // frame — the letterboxed area beyond --app-max-width on a wide
  // viewport, iOS's rubber-band overscroll) never picked up the scheme:
  // only the div's own descendants (the app's content box) visibly
  // "switched" when toggling light/dark.
  useEffect(() => {
    document.documentElement.dataset.theme = scheme;
  }, [scheme]);

  const setScheme = useCallback((next: ColorScheme) => {
    setSchemeState(next);
    setAppearanceState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
      window.localStorage.setItem(APPEARANCE_KEY, next);
    } catch {
      // Not remembered on this device.
    }
  }, []);

  const setAppearance = useCallback((next: Appearance) => {
    setAppearanceState(next);
    const resolved = next === 'system' ? systemScheme() : next;
    setSchemeState(resolved);
    try {
      window.localStorage.setItem(APPEARANCE_KEY, next);
      window.localStorage.setItem(STORAGE_KEY, resolved);
    } catch {
      // Not remembered on this device.
    }
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
      appearance,
      setAppearance,
    }),
    [scheme, toggleScheme, setScheme, appearance, setAppearance]
  );

  return (
    <ThemeContext.Provider value={value}>
      <div data-theme={scheme}>{children}</div>
    </ThemeContext.Provider>
  );
}
