// The full "dreda" logo lockup (mark + wordmark): the style guide's lockups
// in public/brand (from Remix/Logos), at every width. dreda-full.png has a
// dark wordmark, for light surfaces; dreda-full-reversed.png is white, for
// dark or coloured surfaces. The app is light only (docs/STYLE-MIGRATION.md),
// so 'auto' is the light-surface lockup. This is the single place that
// decides which file to use; screens never hardcode the files directly.
//
// Neither file is square: pass `height` and let width scale automatically,
// never a fixed width, or the wordmark distorts.

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
  // 'dark' is for a dark or coloured surface (a hero card): the reversed
  // lockup. 'light' and 'auto' are for light surfaces.
  variant?: 'auto' | 'dark' | 'light';
}) {
  const style = height ? { height, width: 'auto' as const } : undefined;
  const src = variant === 'dark' ? '/brand/dreda-full-reversed.png' : '/brand/dreda-full.png';
  return <img src={src} alt={alt} style={style} className={className ? `${styles.logo} ${className}` : styles.logo} />;
}
