// The Dreda design system (Design-System/Dreda.figcraft, generated into
// Design-System/tokens.css): the facelift's light values, which
// src/styles/base/globals.css applies at every width. Keep globals.css's
// `--sg-*` block in step with this file (test/styleGuide.test.ts checks).
//
// The keys the app already read (brand, neutrals, semantic, destructive) keep
// their names and take the facelift's values. Status, money and data sets are
// new with the facelift: problems are stated in colour as well as words.

export const styleGuide = {
  brand: {
    primary: '#553199', // purple-600: brand default, links
    primaryHover: '#45277D', // purple-700: brand hover
    primaryDark: '#342066', // purple-800: brand pressed, headers
    accent: '#D3FC72', // lime-300: highlights, badges (a fill, never text on white)
    accentHover: '#BDEF45', // lime-400
    accentSubtle: '#F4FED3', // lime-100
    accentFg: '#4A6717', // lime-800: accent as text
    accentOn: '#203008', // lime-950: text on the accent
    primaryLight: '#F4F0FB', // purple-50: brand subtle, selected states
    focus: '#7049BA', // purple-500: focus ring
    primaryMuted: '#D3C4EF', // purple-200: wallet card decor, muted text on purple
    primaryTint: '#E9E1F7', // purple-100: the lilac wallet card
    primaryInk: '#170E30', // purple-950: text on the lilac wallet card
  },
  neutrals: {
    0: '#FFFFFF',
    50: '#F9FAFB',
    100: '#F3F4F6',
    200: '#E5E7EB',
    300: '#D1D5DB',
    400: '#9CA3AF',
    500: '#6B7280',
    600: '#4B5563',
    700: '#374151',
    800: '#1F2937',
    900: '#111827',
    950: '#0B0F19',
  },
  semantic: {
    surface: '#FFFFFF', // bg-surface
    surfaceMuted: '#F9FAFB', // bg-page
    sunken: '#F3F4F6', // bg-sunken
    border: '#E5E7EB', // border-default
    borderSubtle: '#F3F4F6',
    borderStrong: '#D1D5DB',
    textDefault: '#111827', // text-primary
    textMuted: '#4B5563', // text-secondary
    textTertiary: '#6B7280',
    textDisabled: '#9CA3AF',
    textOnPrimary: '#FFFFFF', // brand-on
    inverse: '#111827', // bg-inverse: dark hero and total cards
  },
  // Status: fg (text), bg (tint), border, solid (fill), on (text on solid).
  status: {
    success: { fg: '#047857', bg: '#ECFDF5', border: '#A7F3D0', solid: '#047857', on: '#FFFFFF' },
    warning: { fg: '#B45309', bg: '#FFFBEB', border: '#FDE68A', solid: '#F59E0B', on: '#0B0F19' },
    danger: { fg: '#A11F1F', bg: '#FEF2F2', border: '#FECACA', solid: '#C62828', on: '#FFFFFF' },
    info: { fg: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE', solid: '#2563EB', on: '#FFFFFF' },
  },
  // One pair per flow type. The four money types stay separate.
  money: {
    income: { fg: '#047857', bg: '#ECFDF5' },
    expense: { fg: '#BE123C', bg: '#FFF1F2' },
    savings: { fg: '#0F766E', bg: '#F0FDFA' },
    debt: { fg: '#C2410C', bg: '#FFF7ED' },
    transfer: { fg: '#4B5563', bg: '#F3F4F6' },
  },
  // Destructive actions (Delete): the danger solid.
  destructive: '#C62828',
  fonts: {
    heading: 'Bricolage Grotesque',
    body: 'Figtree',
    mono: 'IBM Plex Mono', // amounts
  },
  // [size px, line height px, weight]: the Web mode of the Layout collection.
  type: {
    display: [48, 56, 700],
    h1: [36, 44, 700],
    h2: [28, 36, 700],
    h3: [22, 30, 600],
    bodyLarge: [18, 28, 400],
    body: [16, 24, 400],
    small: [14, 20, 400],
    caption: [12, 16, 500],
  },
  radius: { sm: 5, md: 10, lg: 20, full: 9999 },
  spacing: [4, 8, 12, 16, 24, 32, 48, 64],
  // Buttons: small, medium, large (density control heights).
  buttonHeight: { sm: 36, md: 44, lg: 56 },
  // Charts: the categorical ramp, in order.
  chart: ['#553199', '#0D9488', '#EA580C', '#3B82F6', '#F43F5E', '#5D8215', '#9070D0', '#6B7280'],
  data: {
    actual: '#553199',
    plan: '#D1D5DB',
    forecast: '#B49BE2',
    positive: '#10B981',
    negative: '#F43F5E',
    grid: '#F3F4F6',
    axis: '#6B7280',
    reference: '#111827',
  },
} as const;

export type StyleGuideTokens = typeof styleGuide;
