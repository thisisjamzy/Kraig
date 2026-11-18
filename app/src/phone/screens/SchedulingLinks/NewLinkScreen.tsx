'use client';

// New scheduling link on the phone (Dreda v1.0 `Scheduling / Phone / New
// link` 70256): Details (name, length, where), Hours by day (each day on or
// off with its ranges; more than one range a day), the note for the
// booker, and a footer with Cancel and Create link in place of the tab bar.

import { useRouter } from 'next/navigation';
import { Plus, X } from 'lucide-react';
import { LENGTHS, useLogic } from '@/src/logic/schedulingLinks/useLogic';
import { PLACES, WEEKDAY_SHORT, type Place, type Weekday } from '@/src/viewmodels/scheduling-links';
import { Switch } from '@/src/widgets/TaskChips/Switch';
import { TimeHeader } from '@/src/phone/widgets/TimeHeader/TimeHeader';
import styles from '@/src/phone/screens/SchedulingLinks/SchedulingLinksScreen.module.css';

export function NewLinkScreen() {
  const router = useRouter();
  const s = useLogic();
  const d = s.draft;
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    <div className={styles.formPage}>
      <TimeHeader title="New link" crumb={{ label: 'Scheduling', href: '/projects/calendar/links' }} />
      <section className={styles.section} aria-label="Details">
        <h2 className={styles.sectionTitle}>Details</h2>
        <label className={styles.field}>
          Name
          <input className={styles.input} value={d.name} placeholder="Intro call" onChange={(e) => s.update('name', e.target.value)} />
        </label>
        <div className={styles.pair}>
          <label className={styles.field}>
            Length
            <select className={styles.input} value={d.minutes} onChange={(e) => s.update('minutes', Number(e.target.value))}>
              {LENGTHS.map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            Where
            <select className={styles.input} value={d.place} onChange={(e) => s.update('place', e.target.value as Place)}>
              {PLACES.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className={styles.section} aria-label="Hours by day">
        <h2 className={styles.sectionTitle}>
          Hours by day <span className={styles.hint}>{zone}</span>
        </h2>
        <div>
          {d.hours.map((ranges, i) => {
            const day = i as Weekday;
            const on = ranges.length > 0;
            return (
              <div key={i} className={styles.dayRow} data-off={on ? undefined : ''}>
                <Switch checked={on} onChange={(v) => (v ? s.openDay(day) : s.clearDay(day))} label={`${WEEKDAY_SHORT[i]} ${on ? 'open' : 'unavailable'}`} />
                <span className={styles.dayName}>{WEEKDAY_SHORT[i]}</span>
                <span className={styles.dayRanges}>
                  {on ? (
                    ranges.map((r, j) => (
                      <span key={j} className={styles.range}>
                        <input type="time" value={r.from} onChange={(e) => s.setRange(day, j, { ...r, from: e.target.value })} aria-label="From" />
                        to
                        <input type="time" value={r.to} onChange={(e) => s.setRange(day, j, { ...r, to: e.target.value })} aria-label="To" />
                        {ranges.length > 1 && (
                          <button type="button" className={styles.link} onClick={() => s.removeRange(day, j)} aria-label="Remove this range">
                            <X size={14} />
                          </button>
                        )}
                      </span>
                    ))
                  ) : (
                    <span className={styles.unavailable}>Unavailable</span>
                  )}
                </span>
                {on && (
                  <button type="button" className={styles.link} onClick={() => s.addRange(day)} aria-label={`Add a range on ${WEEKDAY_SHORT[i]}`}>
                    <Plus size={18} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className={styles.section} aria-label="Note for the booker">
        <h2 className={styles.sectionTitle}>Note for the booker</h2>
        <label className={styles.field}>
          Shown on your booking page
          <textarea className={styles.input} rows={3} value={d.note} placeholder="Tell me a little about the project so I can come prepared." onChange={(e) => s.update('note', e.target.value)} />
        </label>
        <p className={styles.hint}>Bookers can add their own note too. You confirm each booking.</p>
      </section>

      <footer className={styles.footer}>
        <button type="button" className={styles.cancel} onClick={() => router.push('/projects/calendar/links')}>
          Cancel
        </button>
        <button
          type="button"
          className={styles.create}
          disabled={Boolean(s.problem)}
          onClick={() => {
            if (s.create()) router.push('/projects/calendar/links');
          }}
        >
          Create link
        </button>
      </footer>
    </div>
  );
}
