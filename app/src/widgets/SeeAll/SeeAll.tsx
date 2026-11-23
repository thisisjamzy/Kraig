// The one "See all ↗" link a card uses to open its full list (owner,
// 23 Nov 2026): text link, arrow-up-right at text size, a 44px tap target.

import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import styles from './SeeAll.module.css';

export function SeeAll({ href, label = 'See all', className }: { href: string; label?: string; className?: string }) {
  return (
    <Link href={href} className={className ? `${styles.link} ${className}` : styles.link}>
      {label}
      <ArrowUpRight size="1em" strokeWidth={2.25} aria-hidden />
    </Link>
  );
}
