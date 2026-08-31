#!/usr/bin/env bash
#
# setup-structure.sh
#
# Scaffolds the project's file structure: a layered (feature-sliced) folder
# layout, a token-driven theme system exposed through hooks, and the
# skeleton for the Notion / Apps Script / PWA integration.
#
# Run this from the root of your existing Next.js project:
#
#   bash setup-structure.sh
#
# Safe to re-run: existing files are left untouched, only missing ones are
# created.

set -euo pipefail

if [ ! -f "package.json" ]; then
  echo "No package.json found here. Run this from your Next.js project root."
  exit 1
fi

echo "Setting up project structure..."
echo ""

# ---------------------------------------------------------------------------
# Helper: write a file only if it doesn't already exist. Content comes from
# the heredoc piped into this function's stdin.
# ---------------------------------------------------------------------------
write_file() {
  local filepath="$1"
  if [ -f "$filepath" ]; then
    echo "  exists, skipping: $filepath"
    cat > /dev/null
  else
    mkdir -p "$(dirname "$filepath")"
    cat > "$filepath"
    echo "  created: $filepath"
  fi
}

# ---------------------------------------------------------------------------
# Style tokens: the single source of truth for every visual constant.
# ---------------------------------------------------------------------------

write_file "styles/tokens/colors.ts" <<'EOF'
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
    secondary: '#60a5fa',
    border: '#2c2c33',
    success: '#22c55e',
    warning: '#f59e0b',
    danger: '#ef4444',
  },
} as const;

export type ColorScheme = keyof typeof colors;
export type ColorTokens = typeof colors.light;
EOF

write_file "styles/tokens/spacing.ts" <<'EOF'
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
EOF

write_file "styles/tokens/typography.ts" <<'EOF'
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
EOF

write_file "styles/tokens/radii.ts" <<'EOF'
export const radii = {
  radiusSmall: '4px',
  radiusMedium: '8px',
  radiusLarge: '16px',
  radiusFull: '9999px',
} as const;

export type RadiiTokens = typeof radii;
EOF

write_file "styles/tokens/breakpoints.ts" <<'EOF'
// Approved breakpoints. Keep every responsive rule in the app aligned to these.

export const breakpoints = {
  mobile: 0,
  tablet: 640,
  laptop: 1024,
  desktop: 1280,
  largeDesktop: 1536,
} as const;

export type BreakpointTokens = typeof breakpoints;
EOF

write_file "styles/tokens/index.ts" <<'EOF'
export * from './colors';
export * from './spacing';
export * from './typography';
export * from './radii';
export * from './breakpoints';
EOF

write_file "styles/base/globals.css" <<'EOF'
:root {
  --font-family-body: 'Inter', system-ui, sans-serif;
  --font-family-heading: 'Inter', system-ui, sans-serif;

  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;

  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 16px;
  --radius-full: 9999px;
}

/* Mirrors styles/tokens/colors.ts. If you change one, change the other. */
[data-theme='light'] {
  --color-background: #ffffff;
  --color-surface: #f5f5f7;
  --color-text-primary: #111114;
  --color-text-secondary: #5c5c66;
  --color-primary: #2563eb;
  --color-primary-hover: #1d4ed8;
  --color-border: #e2e2e7;
}

[data-theme='dark'] {
  --color-background: #111114;
  --color-surface: #1b1b20;
  --color-text-primary: #f5f5f7;
  --color-text-secondary: #a3a3ad;
  --color-primary: #3b82f6;
  --color-primary-hover: #60a5fa;
  --color-border: #2c2c33;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: var(--font-family-body);
  background: var(--color-background);
  color: var(--color-text-primary);
}
EOF

# ---------------------------------------------------------------------------
# Theme system: context, provider, and the hooks that expose it.
# ---------------------------------------------------------------------------

write_file "shared/types/theme.ts" <<'EOF'
import type { ColorScheme, ColorTokens } from '@/styles/tokens/colors';
import type { SpacingTokens } from '@/styles/tokens/spacing';
import type { TypographyTokens } from '@/styles/tokens/typography';
import type { RadiiTokens } from '@/styles/tokens/radii';
import type { BreakpointTokens } from '@/styles/tokens/breakpoints';

export interface Theme {
  scheme: ColorScheme;
  colors: ColorTokens;
  spacing: SpacingTokens;
  typography: TypographyTokens;
  radii: RadiiTokens;
  breakpoints: BreakpointTokens;
}

export interface ThemeContextValue extends Theme {
  toggleScheme: () => void;
  setScheme: (scheme: ColorScheme) => void;
}
EOF

write_file "shared/components/ThemeProvider/ThemeProvider.tsx" <<'EOF'
'use client';

import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { colors, spacing, typography, radii, breakpoints } from '@/styles/tokens';
import type { ColorScheme, ThemeContextValue } from '@/shared/types/theme';

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
EOF

write_file "shared/components/ThemeProvider/index.ts" <<'EOF'
export * from './ThemeProvider';
EOF

write_file "shared/hooks/useTheme.ts" <<'EOF'
'use client';

import { useContext } from 'react';
import { ThemeContext } from '@/shared/components/ThemeProvider/ThemeProvider';
import type { ThemeContextValue } from '@/shared/types/theme';

// The single source of truth for anything theme related.
// Every other theme hook (useColorTheme, useFontTheme, useSpacing) reads through this one,
// so constants never get copied or moved around by hand.
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
EOF

write_file "shared/hooks/useColorTheme.ts" <<'EOF'
'use client';

import { useTheme } from './useTheme';

export function useColorTheme() {
  const { colors, scheme, toggleScheme, setScheme } = useTheme();
  return { colors, scheme, toggleScheme, setScheme };
}
EOF

write_file "shared/hooks/useFontTheme.ts" <<'EOF'
'use client';

import { useTheme } from './useTheme';

export function useFontTheme() {
  const { typography } = useTheme();
  return typography;
}
EOF

write_file "shared/hooks/useSpacing.ts" <<'EOF'
'use client';

import { useTheme } from './useTheme';

export function useSpacing() {
  const { spacing } = useTheme();
  return spacing;
}
EOF

write_file "shared/hooks/index.ts" <<'EOF'
export * from './useTheme';
export * from './useColorTheme';
export * from './useFontTheme';
export * from './useSpacing';
EOF

# ---------------------------------------------------------------------------
# Notion / Apps Script integration.
# ---------------------------------------------------------------------------

write_file "shared/config/env.ts" <<'EOF'
// Centralized environment access. Do not call process.env directly anywhere else.

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  appsScriptUrl: process.env.APPS_SCRIPT_WEB_APP_URL ?? '',
  notionDatabaseId: process.env.NOTION_DATABASE_ID ?? '',
  firebase: {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? '',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? '',
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? '',
  },
};

export { required };
EOF

write_file "shared/api/appsScriptClient.ts" <<'EOF'
// Thin client for calling the Google Apps Script web app that syncs data with Notion.
// Keep all request and response shaping here so the rest of the app never has to know
// the endpoint exists.

import { env, required } from '@/shared/config/env';

interface AppsScriptRequest {
  action: string;
  payload?: Record<string, unknown>;
}

export async function callAppsScript<T>(request: AppsScriptRequest): Promise<T> {
  const url = required('APPS_SCRIPT_WEB_APP_URL', env.appsScriptUrl);

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`Apps Script request failed: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}
EOF

write_file "app/api/apps-script-sync/route.ts" <<'EOF'
// Server side proxy for the Apps Script sync endpoint. Routing requests through here
// keeps the Apps Script URL, and any auth token added later, out of client side code.

import { NextRequest, NextResponse } from 'next/server';
import { callAppsScript } from '@/shared/api/appsScriptClient';

export async function POST(request: NextRequest) {
  const body = await request.json();

  try {
    const result = await callAppsScript(body);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
EOF

# ---------------------------------------------------------------------------
# PWA: dynamic manifest and icon placeholder.
# ---------------------------------------------------------------------------

write_file "app/manifest.ts" <<'EOF'
import type { MetadataRoute } from 'next';
import { colors } from '@/styles/tokens/colors';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'App Name',
    short_name: 'App',
    description: 'Replace with a real description before shipping.',
    start_url: '/',
    display: 'standalone',
    background_color: colors.light.background,
    theme_color: colors.light.primary,
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
EOF

write_file "public/icons/README.md" <<'EOF'
Drop the real app icons here before shipping:

- icon-192.png            192x192
- icon-512.png            512x512
- icon-maskable-512.png   512x512, with safe zone padding for maskable display
- apple-touch-icon.png    180x180, referenced from the root layout head, not the manifest
EOF

# ---------------------------------------------------------------------------
# Layer placeholders, so every folder explains itself even before it has code.
# ---------------------------------------------------------------------------

write_file "processes/README.md" <<'EOF'
Cross-feature workflows. Nothing goes here until two or more features need to be
sequenced together (for example: create record, sync to Notion, confirm on screen).
EOF

write_file "screens/README.md" <<'EOF'
Route-level composition. Each folder here assembles widgets and features into a full
screen. Files under app should stay thin and just render a screen from here.
EOF

write_file "widgets/README.md" <<'EOF'
Large, reusable UI sections built from multiple entities and features, for example a
dashboard panel or a data table with its own filters.
EOF

write_file "features/README.md" <<'EOF'
One folder per user action: CreateRecord, EditRecord, SyncWithNotion, and so on. Everything
a feature needs (UI, api calls, state) lives inside its own folder.
EOF

write_file "entities/README.md" <<'EOF'
Business objects, each owning its own model/, api/, ui/, types/, and utils/. Empty for now
since the Notion schema isn't defined yet.
EOF

# ---------------------------------------------------------------------------
# Environment template.
# ---------------------------------------------------------------------------

write_file ".env.local.example" <<'EOF'
# Google Apps Script web app URL, used to sync data with Notion
APPS_SCRIPT_WEB_APP_URL=

# Notion database id, if the app ever needs to reference it directly
NOTION_DATABASE_ID=

# Firebase, for once data starts flowing into it
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
EOF

# ---------------------------------------------------------------------------
# next.config: wire up the PWA plugin without clobbering an existing config.
# ---------------------------------------------------------------------------

echo ""
if [ -f "next.config.mjs" ] || [ -f "next.config.js" ] || [ -f "next.config.ts" ]; then
  echo "An existing next.config file was found, it was left untouched."
  echo "Wrap its export with withPWA from @ducanh2912/next-pwa, for example:"
  echo ""
  echo "  import withPWA from '@ducanh2912/next-pwa';"
  echo "  const withPWAConfig = withPWA({ dest: 'public' });"
  echo "  export default withPWAConfig(nextConfig);"
else
  write_file "next.config.mjs" <<'EOF'
import withPWA from '@ducanh2912/next-pwa';

/** @type {import('next').NextConfig} */
const nextConfig = {};

const withPWAConfig = withPWA({
  dest: 'public',
});

export default withPWAConfig(nextConfig);
EOF
fi

write_file "README-STRUCTURE.md" <<'EOF'
# Project structure

This follows a layered, feature-sliced approach. A module may only import from the
layers below it in this list, never sideways or upward.

1. app          Next.js routing, root layout, global providers.
2. processes       Cross-feature workflows, used once two or more features need coordinating.
3. screens         Route-level composition. Files under app should stay thin and just
                    render a screen from here.
4. widgets         Large reusable UI sections built from multiple entities and features.
5. features        One folder per user action (CreateX, EditX, SyncX).
6. entities        Business objects, each with model/, api/, ui/, types/, utils/.
7. shared          Reusable, app agnostic code: api clients, hooks, config, types, utilities.
8. styles          Single source of truth for visual design: tokens, base, layouts, themes.

## Theme system

- styles/tokens holds the raw values: colors, spacing, typography, radii, breakpoints.
- shared/components/ThemeProvider wraps the raw tokens into a Theme object and handles
  light and dark switching.
- shared/hooks/useTheme is the one hook that reads the theme context. Every other theme
  hook (useColorTheme, useFontTheme, useSpacing) is a thin wrapper around it, so there is
  a single place every constant comes from.

Usage in a component:

  const { paddingMedium } = useSpacing();
  const { primary } = useColorTheme();

## PWA

- app/manifest.ts generates the manifest dynamically from the color tokens.
- Add real icons to public/icons (see the README there) before shipping.
- next.config wires up @ducanh2912/next-pwa for the service worker. Check the setup
  script's console output for whether this needs a manual step in your case.

## Notion and Apps Script

- shared/config/env.ts centralizes environment variable access.
- shared/api/appsScriptClient.ts is a thin fetch wrapper around the Apps Script web app URL.
- app/api/apps-script-sync/route.ts proxies requests server side, so the Apps Script URL
  never reaches the client.

## Still manual

- Wrap the app in <ThemeProvider> inside your root layout, and import
  styles/base/globals.css there.
- Fill in .env.local from .env.local.example.
- Deploy the Apps Script project as a web app and put its URL in APPS_SCRIPT_WEB_APP_URL.
- Add real icons to public/icons.
EOF

# ---------------------------------------------------------------------------
# Dependencies.
# ---------------------------------------------------------------------------

echo ""
echo "Installing dependencies..."
if grep -q '"@ducanh2912/next-pwa"' package.json 2>/dev/null; then
  echo "  @ducanh2912/next-pwa already in package.json, skipping install"
else
  npm install @ducanh2912/next-pwa
fi

# ---------------------------------------------------------------------------
# tsconfig sanity check.
# ---------------------------------------------------------------------------

echo ""
if [ -f "tsconfig.json" ]; then
  if grep -q '"@/\*"' tsconfig.json; then
    echo "tsconfig.json already has the @/* path alias."
  else
    echo "tsconfig.json does not seem to have the @/* path alias. Add this under compilerOptions.paths:"
    echo '  "@/*": ["./*"]'
  fi
else
  echo "No tsconfig.json found. These files are written as TypeScript, if this is a"
  echo "JavaScript project they will need to be renamed to .js/.jsx or TypeScript added."
fi

echo ""
echo "Done. See README-STRUCTURE.md for the layout and the manual steps left to do."
