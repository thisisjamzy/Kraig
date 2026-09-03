'use client';

// A button showing the currently picked emoji (or a placeholder), opening a
// small Modal grid to change it — used by Area/Project/Task create and edit
// forms alike. Always optional: the grid's first cell is an explicit "no
// emoji" option, distinct from just not having picked one yet.

import { useState } from 'react';
import { Modal } from '@/src/widgets/Modal/Modal';
import { EMOJI_OPTIONS } from '@/src/viewmodels/projects';
import styles from './EmojiPicker.module.css';

export function EmojiPicker({
  value,
  onChange,
  label,
  noneLabel,
}: {
  value: string | null;
  onChange: (emoji: string | null) => void;
  label: string;
  noneLabel: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className={styles.trigger} onClick={() => setOpen(true)}>
        <span className={styles.triggerEmoji}>{value ?? '＋'}</span>
      </button>

      {open && (
        <Modal title={label} onClose={() => setOpen(false)}>
          <div className={styles.grid}>
            <button
              type="button"
              className={`${styles.cell} ${styles.noneCell} ${value === null ? styles.cellActive : ''}`}
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
              aria-label={noneLabel}
            >
              {noneLabel}
            </button>
            {EMOJI_OPTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className={`${styles.cell} ${value === emoji ? styles.cellActive : ''}`}
                onClick={() => {
                  onChange(emoji);
                  setOpen(false);
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}
