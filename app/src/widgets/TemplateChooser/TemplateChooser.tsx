'use client';

// "Download template": a small choice between the Time template (areas,
// sections, projects and tasks) and the Money template (baskets, basket
// items, income sources and wallets), each with one line on what it holds.
// A popover on wide screens; the BASELINE bottom sheet (Modal) on a phone.
// The file is made by useTemplateDownload.

import { useState } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { useLayout } from '@/src/shared/hooks/useLayout';
import { useTemplateDownload } from '@/src/logic/importData/useTemplateDownload';
import { TEMPLATE_ABOUT, TEMPLATE_LABEL, type TemplateKind } from '@/src/shared/import/templates';
import { Popover } from '@/src/widgets/ListQuery/Popover';
import { Modal } from '@/src/widgets/Modal/Modal';
import styles from './TemplateChooser.module.css';

const KINDS: TemplateKind[] = ['time', 'money'];

export function TemplateChooser({ anchor, onClose }: { anchor: HTMLElement | null; onClose: () => void }) {
  const { isWide } = useLayout();
  const t = useTemplateDownload();
  const body = (
    <div className={styles.list}>
      {KINDS.map((kind) => (
        <button
          key={kind}
          type="button"
          className={styles.option}
          data-row
          disabled={t.busy !== null}
          onClick={async () => {
            await t.download(kind);
            onClose();
          }}
        >
          <FileSpreadsheet size={18} strokeWidth={2} aria-hidden className={styles.icon} />
          <span className={styles.text}>
            <span className={styles.title}>{t.busy === kind ? 'Preparing…' : TEMPLATE_LABEL[kind]}</span>
            <span className={styles.about}>{TEMPLATE_ABOUT[kind]}</span>
          </span>
        </button>
      ))}
      {t.error && (
        <p className={styles.error} role="alert">
          {t.error}
        </p>
      )}
    </div>
  );
  if (isWide && anchor) {
    return (
      <Popover anchor={anchor} label="Download template" onClose={onClose}>
        <p className={styles.heading}>Download template</p>
        {body}
      </Popover>
    );
  }
  return (
    <Modal title="Download template" onClose={onClose}>
      {body}
    </Modal>
  );
}

/** A "Download template" button that opens the chooser. */
export function TemplateChooserButton({ className, label = 'Download template', children }: { className?: string; label?: string; children?: React.ReactNode }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={className}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={(e) => {
          setAnchor(e.currentTarget);
          setOpen(true);
        }}
      >
        {children ?? label}
      </button>
      {open && <TemplateChooser anchor={anchor} onClose={() => setOpen(false)} />}
    </>
  );
}
