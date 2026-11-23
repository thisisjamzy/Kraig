'use client';

// Templates in the Add transaction form (owner, 23 Nov 2026): "Create new
// template" first, then the user's templates, most recently used first,
// with a search field once there are more than eight. Choosing one fills
// the form; nothing is recorded until the user saves.

import { useState } from 'react';
import Link from 'next/link';
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, PiggyBank, Plus, Search } from 'lucide-react';
import type { FirestoreTransactionTemplate } from '@/src/shared/firestore/types';
import { searchTemplates } from '@/src/viewmodels/templates';
import { Modal } from '@/src/widgets/Modal/Modal';
import styles from './TemplatePicker.module.css';

const TYPE_ICON = { expense: ArrowUpRight, income: ArrowDownLeft, transfer: ArrowLeftRight, savings: PiggyBank } as const;
const TYPE_WORD = { expense: 'Expense', income: 'Income', transfer: 'Transfer', savings: 'Savings' } as const;

/** One template as a row: name, type arrow, amount and wallet. */
export function TemplateRowText({ t, walletName }: { t: FirestoreTransactionTemplate; walletName: (id: string | null) => string | null }) {
  const Icon = TYPE_ICON[t.type] ?? ArrowUpRight;
  const from = walletName(t.accountId);
  const to = walletName(t.toAccountId);
  return (
    <>
      <span className={styles.icon} data-type={t.type} aria-label={TYPE_WORD[t.type]}>
        <Icon size={16} strokeWidth={2.25} />
      </span>
      <span className={styles.text}>
        <span className={styles.name}>{t.name}</span>
        <span className={styles.meta}>{[from && to ? `${from} to ${to}` : from, TYPE_WORD[t.type]].filter(Boolean).join(' · ')}</span>
      </span>
      <span className={styles.amount}>{t.amount != null ? Math.round(t.amount).toLocaleString('en-US') : 'Ask'}</span>
    </>
  );
}

export function TemplatePicker({
  templates,
  walletName,
  onPick,
  onClose,
}: {
  templates: FirestoreTransactionTemplate[];
  walletName: (id: string | null) => string | null;
  onPick: (t: FirestoreTransactionTemplate) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const live = templates.filter((t) => !t.archived);
  const shown = live.length > 8 ? searchTemplates(live, text) : live;
  return (
    <Modal title="Use a template" onClose={onClose}>
      <div className={styles.list}>
        <Link href="/transaction-templates/new" className={styles.row}>
          <span className={styles.icon} data-type="new" aria-hidden>
            <Plus size={16} strokeWidth={2.25} />
          </span>
          <span className={styles.text}>
            <span className={styles.name}>Create new template</span>
            <span className={styles.meta}>A transaction you record often</span>
          </span>
        </Link>
        {live.length > 8 && (
          <label className={styles.search}>
            <Search size={16} strokeWidth={2} aria-hidden />
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search templates" aria-label="Search templates" autoFocus />
          </label>
        )}
        {shown.map((t) => (
          <button key={t.id} type="button" className={styles.row} onClick={() => onPick(t)}>
            <TemplateRowText t={t} walletName={walletName} />
          </button>
        ))}
        {live.length === 0 && <p className={styles.empty}>No templates yet. Create one, or use “Save as template” after filling in a transaction.</p>}
        {live.length > 8 && shown.length === 0 && <p className={styles.empty}>No template matches “{text}”.</p>}
      </div>
    </Modal>
  );
}
