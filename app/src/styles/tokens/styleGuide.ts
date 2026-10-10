// The Dreda style guide (Remix/Dreda Remix.free and Remix/Style Guide),
// phone first: src/styles/base/globals.css applies these under 768px.
// Only what the guide defines: four brand colours, the fixed neutrals, the
// one red it uses (destructive actions such as Delete), its type scale,
// corners and spacing. No status colours and no dark theme: the guide has
// neither. Keep globals.css's phone block in step with this file.

export const styleGuide = {
  brand: {
    primary: '#553199', // main actions, links
    primaryDark: '#342066', // hover, pressed, headers
    accent: '#D3FC72', // highlights, badges, charts (a fill, never text on white)
    primaryLight: '#E6EEF8', // tints, selected states
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
  },
  // Named roles, as the guide maps them.
  semantic: {
    surface: '#FFFFFF', // neutral-0
    surfaceMuted: '#F9FAFB', // neutral-50
    border: '#E5E7EB', // neutral-200
    textDefault: '#111827', // neutral-900
    textMuted: '#4B5563', // neutral-600
    textOnPrimary: '#FFFFFF', // neutral-0
  },
  // The action menu's Delete: the only red in the guide.
  destructive: '#C62828',
  fonts: {
    heading: 'Bricolage Grotesque',
    body: 'Figtree',
    mono: 'IBM Plex Mono', // amounts
  },
  // [size px, line height px, weight]
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
  // Buttons: small, medium, large.
  buttonHeight: { sm: 36, md: 48, lg: 56 },
  // Charts, in order: the guide's charts use these.
  chart: ['#553199', '#D3FC72', '#342066', '#9CA3AF', '#E6EEF8'],
} as const;

export type StyleGuideTokens = typeof styleGuide;
