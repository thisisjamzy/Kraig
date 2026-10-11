'use client';

// A small '⋮' trigger that opens a compact card of actions anchored right
// next to the button itself — not a full-screen bottom sheet — each row
// with both an icon and a text label. Closes on picking an action, on
// Escape, or on a click/tap anywhere else.
//
// The card grows away from the nearer screen edge: a trigger in the right
// half (most '⋮' buttons) opens it leftward from its right edge; one in the
// left half (e.g. the Calendar's menu icon) opens it rightward from its
// left edge — otherwise it would open off-screen. Near the bottom of the
// screen it opens upward. The card is drawn at the end of <body> with
// fixed positioning, so a card or row after the trigger can never cover it;
// it closes on scroll and resize rather than drifting from its button.

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical } from 'lucide-react';
import styles from './ActionMenu.module.css';

export interface ActionMenuItem {
  key: string;
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  danger?: boolean;
}

export function ActionMenu({
  items,
  ariaLabel = 'Actions',
  triggerIcon,
  triggerClassName,
}: {
  items: ActionMenuItem[];
  title?: string;
  ariaLabel?: string;
  triggerIcon?: ReactNode;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<CSSProperties>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node;
      if (containerRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    }
    function handleKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    const close = () => setOpen(false);
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeydown);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeydown);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  return (
    <div className={styles.wrap} ref={containerRef}>
      <button
        type="button"
        className={triggerClassName ?? styles.trigger}
        onClick={(event) => {
          event.stopPropagation();
          if (!open) {
            // Placed at open time from where the trigger actually is.
            const rect = containerRef.current?.getBoundingClientRect();
            if (rect) {
              const start = rect.left + rect.width / 2 < window.innerWidth / 2;
              const up = rect.bottom > window.innerHeight * 0.65;
              setPlace({
                ...(start ? { left: rect.left } : { right: window.innerWidth - rect.right }),
                ...(up ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }),
              });
            }
          }
          setOpen((current) => !current);
        }}
        aria-label={ariaLabel}
        aria-expanded={open}
      >
        {triggerIcon ?? <MoreVertical size={16} strokeWidth={2} />}
      </button>

      {open &&
        createPortal(
          <div ref={popoverRef} className={styles.popover} style={place} onClick={(event) => event.stopPropagation()}>
            {items.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`${styles.item} ${item.danger ? styles.itemDanger : ''}`}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
              >
                <span className={styles.itemIcon}>{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
