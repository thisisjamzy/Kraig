'use client';

// Search (Cmd/Ctrl + K, or the sidebar's "Search" row): pages, buckets,
// recent transactions and open tasks, in one list. Arrow keys move, Enter
// opens, Escape closes. Data is only listened to while the palette is open.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeftRight, CheckSquare, FileText, LayoutGrid, Search } from 'lucide-react';
import { limit, orderBy, query, where } from 'firebase/firestore';
import { PAGE_TREE, MODE_LABEL } from '@/src/shared/config/pageTree';
import { useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { bucketsRef, tasksRef, transactionsRef } from '@/src/shared/firestore/refs';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import type { FirestoreBucket, FirestoreTask, FirestoreTransaction } from '@/src/shared/firestore/types';
import styles from './Sidebar.module.css';

interface Result {
  id: string;
  group: string;
  label: string;
  hint: string;
  href: string;
  icon: typeof Search;
}

export function SearchPalette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const [text, setText] = useState('');
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: buckets } = useFirestoreCollection<FirestoreBucket>(useMemo(() => (uid ? query(bucketsRef(uid), where('archived', '==', false)) : null), [uid]));
  const { data: transactions } = useFirestoreCollection<FirestoreTransaction>(
    useMemo(() => (uid ? query(transactionsRef(uid), orderBy('date', 'desc'), limit(300)) : null), [uid])
  );
  const { data: tasks } = useFirestoreCollection<FirestoreTask>(useMemo(() => (uid ? query(tasksRef(uid), where('done', '==', false), limit(300)) : null), [uid]));

  const results = useMemo<Result[]>(() => {
    const q = text.trim().toLowerCase();
    const match = (s: string) => !q || s.toLowerCase().includes(q);
    const pages: Result[] = (['money', 'time'] as const).flatMap((mode) =>
      PAGE_TREE[mode]
        .filter((p) => match(p.label))
        .map((p) => ({ id: `page-${mode}-${p.id}`, group: 'Pages', label: p.label, hint: MODE_LABEL[mode], href: p.href, icon: p.icon }))
    );
    if (!q) return pages;
    const bucketHits: Result[] = buckets
      .filter((b) => match(b.name))
      .slice(0, 8)
      .map((b) => ({ id: `bucket-${b.id}`, group: 'Baskets', label: b.name, hint: `${b.type ?? 'Expense'} basket`, href: `/budget/basket/${b.id}`, icon: LayoutGrid }));
    const txHits: Result[] = transactions
      .filter((t) => match(t.description ?? ''))
      .slice(0, 8)
      .map((t) => ({
        id: `tx-${t.id}`,
        group: 'Transactions',
        label: t.description || t.type,
        hint: `${Math.round(t.amount).toLocaleString('en-US')} · ${t.date.toDate().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`,
        href: `/transactions/${t.id}`,
        icon: ArrowLeftRight,
      }));
    const taskHits: Result[] = tasks
      .filter((t) => match(t.title))
      .slice(0, 8)
      .map((t) => ({ id: `task-${t.id}`, group: 'Tasks', label: t.title, hint: 'Task', href: `/tasks/${t.id}/edit`, icon: CheckSquare }));
    return [...pages, ...bucketHits, ...txHits, ...taskHits];
  }, [text, buckets, transactions, tasks]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function go(result: Result | undefined) {
    if (!result) return;
    router.push(result.href);
    onClose();
  }

  let lastGroup = '';
  return (
    <div className={styles.paletteLayer} role="dialog" aria-modal="true" aria-label="Search">
      <button type="button" className={styles.paletteBackdrop} aria-label="Close search" tabIndex={-1} onClick={onClose} />
      <div className={styles.palette}>
        <label className={styles.paletteInput}>
          <Search size={18} strokeWidth={2} aria-hidden />
          <input
            ref={inputRef}
            value={text}
            placeholder="Search pages, baskets, transactions and tasks"
            aria-label="Search"
            onChange={(e) => {
              setText(e.target.value);
              setIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setIndex((i) => Math.min(results.length - 1, i + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setIndex((i) => Math.max(0, i - 1));
              } else if (e.key === 'Enter') go(results[index]);
            }}
          />
        </label>
        <ul className={styles.paletteList} role="listbox" aria-label="Results">
          {results.map((r, i) => {
            const header = r.group !== lastGroup ? r.group : null;
            lastGroup = r.group;
            const Icon = r.icon ?? FileText;
            return (
              <li key={r.id}>
                {header && <p className={styles.paletteGroup}>{header}</p>}
                <button
                  type="button"
                  role="option"
                  aria-selected={i === index}
                  className={styles.paletteRow}
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => go(r)}
                >
                  <Icon size={16} strokeWidth={1.75} aria-hidden />
                  <span className={styles.rowLabel}>{r.label}</span>
                  <span className={styles.paletteHint}>{r.hint}</span>
                </button>
              </li>
            );
          })}
          {!results.length && <li className={styles.paletteEmpty}>Nothing matches “{text}”.</li>}
        </ul>
      </div>
    </div>
  );
}
