'use client';

// Pieces the web Organise pages share (Dreda v1.0 Projects 57627, Areas
// 62644, Folders 64279 and the detail pages): the top bar buttons, the
// lettered or iconed tile on a label hue, the hue progress bar, and the
// About card.

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronRight, Plus } from 'lucide-react';
import { hueVars, type LabelHue } from '@/src/viewmodels/projects';
import { durationText } from '@/src/viewmodels/todayPlan';
import { TopBarActions, TopBarPrimary } from '@/src/widgets/AppShell/TopBarSlot';
import styles from './Organise.module.css';

/** The page's buttons in the top bar: an outlined one, then the main one. */
export function HeaderActions({ secondary, primary }: { secondary?: { label: string; href: string; icon?: ReactNode }; primary: { label: string; href: string } }) {
  return (
    <>
      {secondary && (
        <TopBarActions>
          <Link href={secondary.href} className={styles.secondaryButton}>
            {secondary.icon}
            {secondary.label}
          </Link>
        </TopBarActions>
      )}
      <TopBarPrimary>
        <Link href={primary.href} className={styles.primaryButton} scroll={false}>
          <Plus size={20} strokeWidth={2.25} aria-hidden />
          {primary.label}
        </Link>
      </TopBarPrimary>
    </>
  );
}

/** The main action as a button (opens a dialog or panel), not a link. */
export function HeaderPrimaryButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <TopBarPrimary>
      <button type="button" className={styles.primaryButton} onClick={onClick}>
        <Plus size={20} strokeWidth={2.25} aria-hidden />
        {label}
      </button>
    </TopBarPrimary>
  );
}

/** An outlined button in the top bar beside the main action. */
export function TopBarActionsButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <TopBarActions>
      <button type="button" className={styles.secondaryButton} onClick={onClick}>
        {children}
      </button>
    </TopBarActions>
  );
}

/** A 36px rounded tile on the hue: a letter (projects) or an icon (areas, folders). */
export function HueTile({ hue, children, size = 36 }: { hue: LabelHue; children: ReactNode; size?: number }) {
  const v = hueVars(hue);
  return (
    <span className={styles.tile} style={{ width: size, height: size, background: v.bg, color: v.fg }} aria-hidden>
      {children}
    </span>
  );
}

/** A thin bar in the hue's solid colour, the rest light grey. */
export function HueBar({ hue, value, label }: { hue: LabelHue; value: number; label?: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <span className={styles.bar} role="img" aria-label={label ?? `${pct}% done`}>
      <span style={{ width: `${pct}%`, background: hueVars(hue).solid }} />
    </span>
  );
}

/** About: the description, then label and value rows; Edit opens the form. */
export function AboutCard({ text, rows, editHref }: { text: string; rows: [string, ReactNode][]; editHref?: string }) {
  return (
    <section className={styles.sideCard} aria-label="About">
      <div className={styles.sideHead}>
        <h2 className={styles.sideTitle}>About</h2>
        {editHref && (
          <Link href={editHref} className={styles.textButton}>
            Edit
          </Link>
        )}
      </div>
      {text && <p className={styles.aboutText}>{text}</p>}
      <dl className={styles.facts}>
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function SectionHead({ title, meta }: { title: string; meta?: ReactNode }) {
  return (
    <div className={styles.sectionHead}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {meta && <span className={styles.sectionMeta}>{meta}</span>}
    </div>
  );
}

/** A one-row view bar: tabs on the left. */
export function ViewTabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string; icon?: ReactNode }[]; value: T; onChange: (id: T) => void }) {
  return (
    <div className={styles.viewTabs} role="tablist" aria-label="View">
      {tabs.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}>
          {t.icon}
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** Time booked this week as the tables write it: "14 h", "30 min", "0 h". */
export const weekText = (m: number) => (m ? durationText(m) : '0 h');

export const shortDate = (d: Date | null) => (d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : null);
export const longDate = (d: Date | null) => (d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null);

/** An area or folder as a card: always the same size (a name, a two-line
 * brief, counts and progress). What is inside shows on its own page. */
export function ContainerCard({ href, hue, icon, name, description, meta, progress }: { href: string; hue: LabelHue; icon: ReactNode; name: string; description: string; meta: string; progress: number }) {
  return (
    <Link href={href} className={styles.containerCard}>
      <span className={styles.containerHead}>
        <HueTile hue={hue} size={40}>
          {icon}
        </HueTile>
        <span className={styles.containerName}>{name}</span>
        <span className={styles.round} aria-hidden>
          <ChevronRight size={18} />
        </span>
      </span>
      <span className={styles.containerDesc}>{description}</span>
      <span className={styles.containerMeta}>{meta}</span>
      <span className={styles.progressCell}>
        <HueBar hue={hue} value={progress} />
        <span className={styles.pct}>{Math.round(progress * 100)}%</span>
      </span>
    </Link>
  );
}

/** Cards in rows that all share one height. */
export function CardGrid({ children }: { children: ReactNode }) {
  return <div className={styles.cardGrid}>{children}</div>;
}
