'use client';

// A small "⋮" trigger that opens a compact card of actions anchored right
// next to the button itself — not a full-screen bottom sheet — each row
// with both an icon and a text label. Closes on picking an action, on
// Escape, or on a click/tap anywhere else.

import { useEffect, useRef, useState, type ReactNode } from 'react';
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
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent | TouchEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeydown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeydown);
    };
  }, [open]);

  return (
    <div className={styles.wrap} ref={containerRef}>
      <button
        type="button"
        className={triggerClassName ?? styles.trigger}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
        aria-label={ariaLabel}
        aria-expanded={open}
      >
        {triggerIcon ?? <MoreVertical size={16} strokeWidth={2} />}
      </button>

      {open && (
        <div className={styles.popover} onClick={(event) => event.stopPropagation()}>
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
        </div>
      )}
    </div>
  );
}
