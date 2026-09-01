import type { ColorScheme, ColorTokens } from '@/src/styles/tokens/colors';

export type { ColorScheme };
import type { SpacingTokens } from '@/src/styles/tokens/spacing';
import type { TypographyTokens } from '@/src/styles/tokens/typography';
import type { RadiiTokens } from '@/src/styles/tokens/radii';
import type { BreakpointTokens } from '@/src/styles/tokens/breakpoints';

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
