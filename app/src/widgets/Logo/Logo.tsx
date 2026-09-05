// The full "dreda" logo lockup (mark + wordmark) — only two source files
// exist for it (public/logo_primary.png, public/logo_alt.png), one per
// surface, not one per screen. logo_primary.png has dark text, for light
// surfaces; logo_alt.png has white text, for dark/colored surfaces. Since
// this app has a real light/dark theme toggle (ThemeProvider sets
// data-theme on a wrapping div, not just prefers-color-scheme), a screen's
// surface color can change at runtime — so both images render, and
// Logo.module.css shows only the one matching the current data-theme
// ancestor. This is the single place that decides which file to use;
// screens should never hardcode logo_primary.png/logo_alt.png directly.
//
// Neither source file is square (logo_primary.png is 140x52, logo_alt.png
// 266x87) — pass `height` and let width scale automatically, never a fixed
// width, or the wordmark distorts.

import styles from './Logo.module.css';

export function Logo({
  className,
  height,
  alt = 'Dreda',
  variant = 'auto',
}: {
  className?: string;
  height?: number;
  alt?: string;
  // 'auto' (default) follows the ThemeProvider's data-theme ancestor, same
  // as always. 'dark' forces the white-text lockup regardless of theme —
  // for a surface that's hardcoded dark/colored (e.g. a gradient card) no
  // matter which app theme is active.
  variant?: 'auto' | 'dark';
}) {
  const style = height ? { height, width: 'auto' as const } : undefined;
  const combinedClassName = (variant: string) => (className ? `${variant} ${className}` : variant);

  if (variant === 'dark') {
    return <img src="/logo_alt.png" alt={alt} style={style} className={className} />;
  }

  return (
    <>
      <img src="/logo_primary.png" alt={alt} style={style} className={combinedClassName(styles.light)} />
      <img src="/logo_alt.png" alt={alt} style={style} className={combinedClassName(styles.dark)} />
    </>
  );
}
