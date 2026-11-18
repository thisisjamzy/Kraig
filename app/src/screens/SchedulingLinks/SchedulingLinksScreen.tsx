'use client';

// Scheduling (Dreda v1.0 `Scheduling / Web` 60468).
//   Title "Scheduling"; under it "3 links. 6 bookings this week, 2 waiting
//   for a reply". Availability (Planning settings) beside New scheduling
//   link, which puts the cursor in the New link panel.
//   View bar: All links, Repeating, One-off, Paused. Each link: its letter,
//   length and where, Repeating or One-off, When and its next booking, the
//   address, how many booked this week, Copy link and Send (or Resume when
//   paused). Upcoming bookings, with Confirm on the ones to confirm.
//   On the right, New scheduling link: name, duration, cadence, weekly hours
//   set per day (more than one range a day), gap, most per day, where, the
//   note on the booking page, the address with Copy, Send by email and
//   Create link.

import { useRef } from 'react';
import Link from 'next/link';
import { AtSign, CalendarDays, MoreHorizontal, Plus, X } from 'lucide-react';
import { GAPS, LENGTHS, PER_DAY, useLogic, type LinkTab, type SchedulingLogic } from '@/src/logic/schedulingLinks/useLogic';
import { bookingWhen, PLACES, WEEKDAY_LETTER, whenWords, type Booking, type SchedLink, type Weekday } from '@/src/viewmodels/scheduling-links';
import { plural } from '@/src/viewmodels/organise';
import { NotionPage } from '@/src/widgets/Database/NotionPage';
import { HueTag } from '@/src/widgets/TaskChips/TypePill';
import { Initials } from '@/src/widgets/TaskChips/Initials';
import { HeaderPrimaryButton, HueTile, ViewTabs } from '@/src/screens/Organise/parts';
import { TopBarActions } from '@/src/widgets/AppShell/TopBarSlot';
import org from '@/src/screens/Organise/Organise.module.css';
import styles from './SchedulingLinksScreen.module.css';

export function SchedulingLinksScreen() {
  const s = useLogic();
  const nameRef = useRef<HTMLInputElement>(null);
  const week = s.bookedThisWeek(null);

  return (
    <NotionPage
      title="Scheduling"
      sub={`${plural(s.links.length, 'link')}. ${plural(week, 'booking')} this week, ${s.toConfirm} waiting for a reply`}
      crumbs={[{ label: 'Scheduling', href: '/projects/calendar/links' }]}
    >
      <TopBarActions>
        <Link href="/settings/planning" className={org.secondaryButton}>
          <CalendarDays size={20} strokeWidth={2} aria-hidden />
          Availability
        </Link>
      </TopBarActions>
      <HeaderPrimaryButton
        label="New scheduling link"
        onClick={() => {
          nameRef.current?.focus();
          nameRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }}
      />
      <div className={org.viewBar}>
        <ViewTabs<LinkTab>
          tabs={[
            { id: 'all', label: 'All links' },
            { id: 'repeating', label: 'Repeating' },
            { id: 'one-off', label: 'One-off' },
            { id: 'paused', label: 'Paused' },
          ]}
          value={s.tab}
          onChange={s.setTab}
        />
      </div>
      <div className={styles.split}>
        <div className={styles.main}>
          {s.shown.length === 0 ? <p className={org.empty}>No links here.</p> : s.shown.map((l) => <LinkCard key={l.id} link={l} s={s} />)}
          <Bookings s={s} />
        </div>
        <NewLinkPanel s={s} nameRef={nameRef} />
      </div>
    </NotionPage>
  );
}

function LinkCard({ link: l, s }: { link: SchedLink; s: SchedulingLogic }) {
  const next = s.nextBooking(l.id);
  const booked = s.bookedThisWeek(l.id);
  return (
    <article className={styles.card} data-paused={l.active ? undefined : ''}>
      <header className={styles.cardHead}>
        <HueTile hue={l.hue}>{l.name.trim()[0]?.toUpperCase() ?? '?'}</HueTile>
        <span className={styles.cardName}>
          <span className={styles.name}>{l.name}</span>
          <span className={styles.meta}>
            {l.minutes} min · {l.place}
          </span>
        </span>
        <span className={styles.badges}>
          <HueTag hue={l.cadence === 'repeating' ? 'blue' : 'amber'}>{l.cadence === 'repeating' ? 'Repeating' : 'One-off'}</HueTag>
          {!l.active && <HueTag hue="grey">● Paused</HueTag>}
        </span>
        <details className={styles.more}>
          <summary aria-label={`More for ${l.name}`}>
            <MoreHorizontal size={20} />
          </summary>
          <div className={styles.menu}>
            <button type="button" onClick={() => s.setActive(l, !l.active)}>
              {l.active ? 'Pause' : 'Resume'}
            </button>
            <button type="button" onClick={() => void s.copy(l)}>
              Copy link
            </button>
          </div>
        </details>
      </header>
      <div className={styles.facts}>
        <div>
          <span>When</span>
          <strong>{whenWords(l)}</strong>
        </div>
        <div>
          <span>{l.active ? (l.cadence === 'one-off' ? 'Booked' : 'Next booking') : 'Status'}</span>
          <strong>{!l.active ? l.pausedNote || 'Paused' : next ? `${bookingWhen(next.at)} with ${next.name}` : 'Nothing booked yet'}</strong>
        </div>
      </div>
      <footer className={styles.cardFoot}>
        <span className={styles.url}>{s.url(l)}</span>
        {l.active ? (
          <>
            {booked > 0 && <HueTag hue="green">{booked} booked{l.cadence === 'repeating' ? ' this week' : ''}</HueTag>}
            <button type="button" className={styles.outline} onClick={() => void s.copy(l)}>
              Copy link
            </button>
            <button type="button" className={styles.tonal} onClick={() => s.send(l)}>
              <AtSign size={18} aria-hidden />
              Send
            </button>
          </>
        ) : (
          <button type="button" className={styles.outline} onClick={() => s.setActive(l, true)}>
            Resume
          </button>
        )}
      </footer>
    </article>
  );
}

function Bookings({ s }: { s: SchedulingLogic }) {
  return (
    <section className={styles.card} aria-label="Upcoming bookings">
      <header className={styles.bookHead}>
        <h2 className={styles.name}>Upcoming bookings</h2>
        {s.toConfirm > 0 && <HueTag hue="amber">● {s.toConfirm} to confirm</HueTag>}
      </header>
      {s.upcoming.length === 0 ? (
        <p className={org.empty}>Nothing booked yet. Send a link to get the first one.</p>
      ) : (
        s.upcoming.map((b) => <BookingRow key={b.id} b={b} s={s} />)
      )}
    </section>
  );
}

function BookingRow({ b, s }: { b: Booking; s: SchedulingLogic }) {
  return (
    <div className={styles.booking}>
      <Initials name={b.name} />
      <span className={styles.cardName}>
        <span className={styles.bookName}>{b.name}</span>
        <span className={styles.meta}>{s.linkOf(b)?.name ?? 'Booking'}</span>
      </span>
      <span className={styles.when}>{bookingWhen(b.at)}</span>
      {b.status === 'confirmed' ? (
        <HueTag hue="green">Confirmed</HueTag>
      ) : (
        <button type="button" className={styles.primary} onClick={() => s.confirm(b)}>
          Confirm
        </button>
      )}
    </div>
  );
}

function NewLinkPanel({ s, nameRef }: { s: SchedulingLogic; nameRef: React.RefObject<HTMLInputElement | null> }) {
  const d = s.draft;
  return (
    <aside className={styles.panel} aria-label="New scheduling link">
      <h2 className={styles.panelTitle}>New scheduling link</h2>
      <p className={styles.panelSub}>People pick a time without signing up</p>

      <label className={styles.field}>
        <span>Name</span>
        <input ref={nameRef} className={styles.input} value={d.name} placeholder="Portfolio review" onChange={(e) => s.update('name', e.target.value)} />
      </label>

      <div className={styles.field}>
        <span>Duration</span>
        <div className={styles.segmented} role="radiogroup" aria-label="Duration">
          {LENGTHS.map((m) => (
            <button key={m} type="button" role="radio" aria-checked={d.minutes === m} onClick={() => s.update('minutes', m)}>
              {m} min
            </button>
          ))}
        </div>
      </div>

      <div className={styles.field}>
        <span>Cadence</span>
        <div className={styles.cadence} role="radiogroup" aria-label="Cadence">
          {(
            [
              ['one-off', 'One-off', 'One meeting, then the link closes'],
              ['repeating', 'Repeating', 'Open every week on set days'],
            ] as const
          ).map(([value, label, hint]) => (
            <button key={value} type="button" role="radio" aria-checked={d.cadence === value} onClick={() => s.update('cadence', value)}>
              <strong>{label}</strong>
              <span>{hint}</span>
            </button>
          ))}
        </div>
      </div>

      <div className={styles.field}>
        <span>Weekly hours, set per day</span>
        <div className={styles.days}>
          {d.hours.map((ranges, i) => {
            const day = i as Weekday;
            return (
              <div key={i} className={styles.day}>
                <button type="button" className={styles.dayDisc} data-on={ranges.length > 0 || undefined} onClick={() => (ranges.length ? s.clearDay(day) : s.openDay(day))} aria-label={ranges.length ? 'Make this day unavailable' : 'Open this day'}>
                  {WEEKDAY_LETTER[i]}
                </button>
                {ranges.length === 0 ? (
                  <span className={styles.unavailable}>Unavailable</span>
                ) : (
                  <span className={styles.ranges}>
                    {ranges.map((r, j) => (
                      <span key={j} className={styles.range}>
                        <input type="time" value={r.from} onChange={(e) => s.setRange(day, j, { ...r, from: e.target.value })} aria-label="From" />
                        to
                        <input type="time" value={r.to} onChange={(e) => s.setRange(day, j, { ...r, to: e.target.value })} aria-label="To" />
                        <button type="button" onClick={() => s.removeRange(day, j)} aria-label="Remove this range">
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </span>
                )}
                <button type="button" className={styles.addRange} onClick={() => (ranges.length ? s.addRange(day) : s.openDay(day))} aria-label="Add a range">
                  <Plus size={16} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className={styles.pair}>
        <label className={styles.field}>
          <span>Gap between</span>
          <select className={styles.input} value={d.gapMinutes} onChange={(e) => s.update('gapMinutes', Number(e.target.value))}>
            {GAPS.map((g) => (
              <option key={g} value={g}>
                {g === 0 ? 'No gap' : `${g} min`}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>Most per day</span>
          <select className={styles.input} value={d.perDay} onChange={(e) => s.update('perDay', Number(e.target.value))}>
            {PER_DAY.map((n) => (
              <option key={n} value={n}>
                {plural(n, 'meeting')}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className={styles.field}>
        <span>Where</span>
        <div className={styles.segmented} role="radiogroup" aria-label="Where">
          {PLACES.map((p) => (
            <button key={p} type="button" role="radio" aria-checked={d.place === p} onClick={() => s.update('place', p)}>
              {p}
            </button>
          ))}
        </div>
      </div>

      <label className={styles.field}>
        <span>Note on the booking page</span>
        <textarea className={styles.input} rows={3} value={d.note} placeholder="Anything they should bring or know" onChange={(e) => s.update('note', e.target.value)} />
        <small>Shown above the times and in the confirmation email.</small>
      </label>

      <div className={styles.preview}>
        <span className={styles.url}>{s.previewUrl}</span>
        <button type="button" className={styles.outline} onClick={() => void s.copyPreview()}>
          Copy
        </button>
      </div>

      <div className={styles.panelActions}>
        <button
          type="button"
          className={styles.outline}
          onClick={() => {
            const link = s.create();
            if (link) s.send(link);
          }}
        >
          Send by email
        </button>
        <button type="button" className={styles.primary} onClick={() => s.create()} disabled={Boolean(s.problem)} title={s.problem ?? undefined}>
          Create link
        </button>
      </div>
    </aside>
  );
}
