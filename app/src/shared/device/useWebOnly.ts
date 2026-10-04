'use client';

import { useEffect } from 'react';

// Development guard for the two UI lines (docs/UI-LINES.md): a web-only
// component (Sidebar, TopBar, PropertiesGrid, DatabaseToolbar, SidePeek,
// MasonryGrid, NotionTable...) calls this, and if it ever mounts on a phone
// (viewport under 768 CSS px) the console says so. Checked after mount, on
// the real viewport, so the server render and first paint can't trip it.
const PHONE_BELOW = 768;

export function useWebOnly(name: string) {
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    if (window.innerWidth < PHONE_BELOW) {
      console.error(`[UI lines] Web-only component <${name}> rendered on a phone (${window.innerWidth}px). Phones render the BASELINE mobile UI; see docs/mobile-restore-inventory.md.`);
    }
  }, [name]);
}
