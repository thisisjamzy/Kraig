'use client';

// A module's page tree, Notion style: one row per page under the module's
// section label; Buckets and Projects expand into their own sub-pages
// (buckets grouped Income / Expenses / Savings / Transfers). Hovering a row
// shows "..." (rename where allowed, add to favorites, open in a new tab,
// copy link) and "+" where a child can be created; on touch both are always
// shown. Rows can be dragged to reorder; the order and what's expanded are
// remembered on this device. Used by the sidebar and the phone's More sheet.

import { useEffect, useMemo, useState, type DragEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, Copy, ExternalLink, FileText, MoreHorizontal, Pencil, Plus, Star, StarOff } from 'lucide-react';
import { query, updateDoc, where, serverTimestamp } from 'firebase/firestore';
import { PAGE_TREE, MODE_LABEL, pageForPath, type AppMode, type TreePage } from '@/src/shared/config/pageTree';
import { useFirestoreCollection } from '@/src/shared/firestore/hooks';
import { areasRef, bucketsRef, projectRef, projectsRef } from '@/src/shared/firestore/refs';
import { updateBucketFields } from '@/src/shared/firestore/bucketBudget';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { useFavorites, type Favorite } from '@/src/shared/hooks/useFavorites';
import { FLOW_LABEL, FLOW_TYPES } from '@/src/shared/budget/flow';
import { useLocationSearch } from '@/src/shared/navigation/locationSearch';
import { Popover } from '@/src/widgets/ListQuery/Popover';
import { showToast } from '@/src/widgets/Toast/Toast';
import type { FirestoreArea, FirestoreBucket, FirestoreProject } from '@/src/shared/firestore/types';
import styles from './Sidebar.module.css';

const ORDER_KEY = (mode: AppMode) => `dreda.tree.order.${mode}`;
const OPEN_KEY = 'dreda.tree.open';

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Not remembered.
  }
}

interface RowMenu {
  anchor: HTMLElement;
  href: string;
  label: string;
  kind: string;
  rename?: (name: string) => Promise<void>;
}

export function PageTree({ mode, touch, onNavigate }: { mode: AppMode; touch: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const search = useLocationSearch(pathname);
  const { user } = useFirebaseUser();
  const uid = user?.uid;
  const favorites = useFavorites();
  const [order, setOrder] = useState<string[]>([]);
  const [open, setOpen] = useState<string[]>([]);
  const [menu, setMenu] = useState<RowMenu | null>(null);
  const [renaming, setRenaming] = useState<{ href: string; value: string; save: (name: string) => Promise<void> } | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  // Restore after mount (no localStorage on the server).
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setOrder(readJson<string[]>(ORDER_KEY(mode), []));
      setOpen(readJson<string[]>(OPEN_KEY, []));
    });
    return () => cancelAnimationFrame(frame);
  }, [mode]);

  const { data: buckets } = useFirestoreCollection<FirestoreBucket>(
    useMemo(() => (uid && mode === 'money' ? query(bucketsRef(uid), where('archived', '==', false)) : null), [uid, mode])
  );
  const { data: projects } = useFirestoreCollection<FirestoreProject>(
    useMemo(() => (uid && mode === 'time' ? query(projectsRef(uid), where('status', '==', 'Active')) : null), [uid, mode])
  );
  const { data: areas } = useFirestoreCollection<FirestoreArea>(useMemo(() => (uid && mode === 'time' ? query(areasRef(uid)) : null), [uid, mode]));
  // Active projects grouped by area (areas by name, "No area" last).
  const projectGroups = useMemo(() => {
    const name = new Map(areas.map((a) => [a.id, a.name]));
    const groups = new Map<string, { label: string; list: FirestoreProject[] }>();
    for (const p of projects) {
      const key = p.areaId && name.has(p.areaId) ? p.areaId : 'none';
      const g = groups.get(key) ?? { label: key === 'none' ? 'No area' : name.get(key)!, list: [] };
      g.list.push(p);
      groups.set(key, g);
    }
    return [...groups.entries()]
      .sort(([a, x], [b, y]) => (a === 'none' ? 1 : b === 'none' ? -1 : x.label.localeCompare(y.label)))
      .map(([key, g]) => ({ key, label: g.label, list: g.list.sort((a, b) => a.name.localeCompare(b.name)) }));
  }, [projects, areas]);

  const pages = useMemo(() => {
    const base = PAGE_TREE[mode];
    const rank = (p: TreePage) => {
      const i = order.indexOf(p.id);
      return i < 0 ? order.length + base.indexOf(p) : i;
    };
    return [...base].sort((a, b) => rank(a) - rank(b));
  }, [mode, order]);

  const active = pageForPath(pathname, search);

  function toggleOpen(id: string) {
    const next = open.includes(id) ? open.filter((x) => x !== id) : [...open, id];
    setOpen(next);
    writeJson(OPEN_KEY, next);
  }

  function onDrop(e: DragEvent, targetId: string) {
    e.preventDefault();
    if (!dragging || dragging === targetId) return;
    const ids = pages.map((p) => p.id).filter((id) => id !== dragging);
    ids.splice(ids.indexOf(targetId), 0, dragging);
    setOrder(ids);
    writeJson(ORDER_KEY(mode), ids);
    setDragging(null);
  }

  function rowActions(fav: Favorite, create?: { label: string; href: string }, rename?: (name: string) => Promise<void>) {
    return (
      <span className={styles.rowActions} data-touch={touch || undefined}>
        <button
          type="button"
          className={styles.rowIcon}
          aria-label={`More for ${fav.label}`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setMenu({ anchor: e.currentTarget, href: fav.href, label: fav.label, kind: fav.kind, rename });
          }}
        >
          <MoreHorizontal size={15} strokeWidth={2} />
        </button>
        {create && (
          <Link href={create.href} className={styles.rowIcon} aria-label={create.label} title={create.label} onClick={onNavigate}>
            <Plus size={15} strokeWidth={2} />
          </Link>
        )}
      </span>
    );
  }

  function subRow(key: string, href: string, label: string, kind: string, rename: (name: string) => Promise<void>): ReactNode {
    const isActive = pathname === href.split('?')[0];
    if (renaming?.href === href) {
      return <RenameRow key={key} value={renaming.value} onDone={() => setRenaming(null)} onSave={renaming.save} />;
    }
    return (
      <li key={key}>
        <div className={styles.row} data-depth="1" data-active={isActive || undefined}>
          <Link href={href} className={styles.rowLink} aria-current={isActive ? 'page' : undefined} onClick={onNavigate}>
            <FileText size={16} strokeWidth={1.75} aria-hidden className={styles.rowGlyph} />
            <span className={styles.rowLabel}>{label}</span>
          </Link>
          {rowActions({ href, label, kind }, undefined, rename)}
        </div>
      </li>
    );
  }

  return (
    <div className={styles.tree}>
      <p className={styles.sectionLabel}>{MODE_LABEL[mode]}</p>
      <ul className={styles.list}>
        {pages.map((page) => {
          const Icon = page.icon;
          const expanded = Boolean(page.children) && open.includes(page.id);
          const isActive = active?.id === page.id && (page.id !== 'buckets' || !search.includes('type=Savings'));
          return (
            <li
              key={page.id}
              draggable={!touch}
              onDragStart={() => setDragging(page.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => onDrop(e, page.id)}
              onDragEnd={() => setDragging(null)}
              data-dragging={dragging === page.id || undefined}
            >
              <div className={styles.row} data-active={isActive || undefined}>
                {page.children ? (
                  <button
                    type="button"
                    className={styles.caret}
                    data-touch={touch || undefined}
                    aria-expanded={expanded}
                    aria-label={expanded ? `Collapse ${page.label}` : `Expand ${page.label}`}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      toggleOpen(page.id);
                    }}
                  >
                    <ChevronRight size={14} strokeWidth={2.25} style={{ transform: expanded ? 'rotate(90deg)' : undefined }} />
                  </button>
                ) : null}
                <Link href={page.href} className={styles.rowLink} aria-current={isActive ? 'page' : undefined} onClick={onNavigate}>
                  <Icon size={18} strokeWidth={1.75} aria-hidden className={styles.rowGlyph} data-has-caret={page.children ? true : undefined} />
                  <span className={styles.rowLabel}>{page.label}</span>
                </Link>
                {rowActions({ href: page.href, label: page.label, kind: page.id }, page.create)}
              </div>
              {expanded && page.children === 'buckets' && (
                <ul className={styles.list}>
                  {FLOW_TYPES.map((type) => {
                    const list = buckets.filter((b) => (b.type ?? 'Expense') === type).sort((a, b) => a.name.localeCompare(b.name));
                    if (!list.length) return null;
                    return (
                      <li key={type}>
                        <p className={styles.groupLabel}>{FLOW_LABEL[type]}</p>
                        <ul className={styles.list}>
                          {list.map((b) =>
                            subRow(b.id, `/budget/basket/${b.id}`, b.name, 'bucket', async (name) => {
                              if (uid) await updateBucketFields(uid, b.id, { name });
                            })
                          )}
                        </ul>
                      </li>
                    );
                  })}
                  {!buckets.length && <li className={styles.emptyChild}>No baskets yet</li>}
                </ul>
              )}
              {expanded && page.children === 'projects' && (
                <ul className={styles.list}>
                  {projectGroups.map((g) => (
                    <li key={g.key}>
                      {projectGroups.length > 1 && <p className={styles.groupLabel}>{g.label}</p>}
                      <ul className={styles.list}>
                        {g.list.map((p) =>
                          subRow(p.id, `/projects/${p.id}`, p.name, 'project', async (name) => {
                            if (uid) await updateDoc(projectRef(uid, p.id), { name, updatedAt: serverTimestamp() });
                          })
                        )}
                      </ul>
                    </li>
                  ))}
                  {!projects.length && <li className={styles.emptyChild}>No active projects</li>}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      {menu && (
        <Popover anchor={menu.anchor} label={menu.label} onClose={() => setMenu(null)}>
          <div className={styles.menu}>
            {menu.rename && (
              <button
                type="button"
                className={styles.menuRow}
                data-row
                onClick={() => {
                  setRenaming({ href: menu.href, value: menu.label, save: menu.rename! });
                  setMenu(null);
                }}
              >
                <Pencil size={15} strokeWidth={2} aria-hidden /> Rename
              </button>
            )}
            <button
              type="button"
              className={styles.menuRow}
              data-row
              onClick={() => {
                void favorites.toggle({ href: menu.href, label: menu.label, kind: menu.kind });
                setMenu(null);
              }}
            >
              {favorites.isFavorite(menu.href) ? <StarOff size={15} strokeWidth={2} aria-hidden /> : <Star size={15} strokeWidth={2} aria-hidden />}
              {favorites.isFavorite(menu.href) ? 'Remove from Favorites' : 'Add to Favorites'}
            </button>
            <button
              type="button"
              className={styles.menuRow}
              data-row
              onClick={() => {
                window.open(menu.href, '_blank', 'noopener');
                setMenu(null);
              }}
            >
              <ExternalLink size={15} strokeWidth={2} aria-hidden /> Open in new tab
            </button>
            <button
              type="button"
              className={styles.menuRow}
              data-row
              onClick={() => {
                void navigator.clipboard?.writeText(`${window.location.origin}${menu.href}`).then(() => showToast('Link copied'));
                setMenu(null);
              }}
            >
              <Copy size={15} strokeWidth={2} aria-hidden /> Copy link
            </button>
          </div>
        </Popover>
      )}
    </div>
  );
}

function RenameRow({ value, onSave, onDone }: { value: string; onSave: (name: string) => Promise<void>; onDone: () => void }) {
  const [text, setText] = useState(value);
  async function save() {
    const name = text.trim();
    if (name && name !== value) {
      try {
        await onSave(name);
      } catch (caught) {
        showToast(caught instanceof Error ? caught.message : 'Could not rename that.');
      }
    }
    onDone();
  }
  return (
    <li>
      <input
        className={styles.renameInput}
        autoFocus
        value={text}
        aria-label="Name"
        onChange={(e) => setText(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void save();
          if (e.key === 'Escape') onDone();
        }}
      />
    </li>
  );
}

/** The Favorites section: hidden when empty. */
export function FavoritesSection({ onNavigate, touch }: { onNavigate?: () => void; touch: boolean }) {
  const pathname = usePathname();
  const favorites = useFavorites();
  if (!favorites.items.length) return null;
  return (
    <div className={styles.tree}>
      <p className={styles.sectionLabel}>Favorites</p>
      <ul className={styles.list}>
        {favorites.items.map((f) => {
          const page = [...PAGE_TREE.money, ...PAGE_TREE.time].find((p) => p.id === f.kind);
          const Icon = page?.icon ?? FileText;
          return (
            <li key={f.href}>
              <div className={styles.row} data-active={pathname === f.href.split('?')[0] || undefined}>
                <Link href={f.href} className={styles.rowLink} aria-current={pathname === f.href.split('?')[0] ? 'page' : undefined} onClick={onNavigate}>
                  <Icon size={18} strokeWidth={1.75} aria-hidden className={styles.rowGlyph} />
                  <span className={styles.rowLabel}>{f.label}</span>
                </Link>
                <span className={styles.rowActions} data-touch={touch || undefined}>
                  <button
                    type="button"
                    className={styles.rowIcon}
                    aria-label={`Remove ${f.label} from Favorites`}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void favorites.remove(f.href);
                    }}
                  >
                    <StarOff size={14} strokeWidth={2} />
                  </button>
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
