'use client';

// Public booking on a wide screen (Dreda v1.0 `Public booking / Web` 60952,
// 61159, 61287): the logo and the time zone; a card with the host and the
// link on the left (length, where, zone, the host's note), then Pick a day
// (a month, days with free times tinted) and the day's times (pick one,
// Next); Your details (the time with Change, name, email, a note, a
// reminder, Back and Confirm booking); then You are booked, with Add it to
// your calendar, Reschedule and Cancel. No account, no app chrome.

import { CalendarDays, Check, ChevronLeft, ChevronRight, Sun, Users } from 'lucide-react';
import { useLogic, type PublicBookingLogic } from '@/src/logic/publicBooking/useLogic';
import { hhmm } from '@/src/viewmodels/scheduling-links';
import { Logo } from '@/src/widgets/Logo/Logo';
import { Avatar } from '@/src/widgets/People/People';
import styles from './PublicBookingScreen.module.css';

const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const longDay = (d: Date) => d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

export function PublicBookingScreen({ slug }: { slug: string }) {
  const b = useLogic(slug);
  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <Logo height={48} />
        <span className={styles.zone}>Times in {b.zone}</span>
      </header>
      {!b.link || !b.link.active ? (
        <main className={styles.done}>
          <h1 className={styles.doneTitle}>This link is not open</h1>
          <p className={styles.muted}>Ask the person who sent it for a new one.</p>
        </main>
      ) : b.step === 'booked' || b.step === 'cancelled' ? (
        <Booked b={b} />
      ) : (
        <main className={styles.card}>
          <About b={b} withNoteCard={b.step === 'pick'} />
          {b.step === 'pick' ? <Pick b={b} /> : <Details b={b} />}
        </main>
      )}
      <p className={styles.foot}>{b.step === 'booked' ? 'Want your own booking link? Try Dreda, it is free.' : 'Scheduling by Dreda'}</p>
    </div>
  );
}

function About({ b, withNoteCard }: { b: PublicBookingLogic; withNoteCard: boolean }) {
  const l = b.link!;
  return (
    <aside className={styles.about}>
      <Avatar id={b.host.avatarId} size={72} alt="" />
      <p className={styles.host}>{b.host.name}</p>
      <h1 className={styles.title}>{l.name}</h1>
      <ul className={styles.facts}>
        <li>
          <CalendarDays size={18} aria-hidden /> {l.minutes} minutes
        </li>
        <li>
          <Users size={18} aria-hidden /> {l.place === 'Video call' ? 'Video call, link sent after booking' : l.place}
        </li>
        <li>
          <Sun size={18} aria-hidden /> {b.zone}
        </li>
      </ul>
      {l.note &&
        (withNoteCard ? (
          <div className={styles.note}>
            <span>A note from {b.host.first}</span>
            <p>{l.note}</p>
          </div>
        ) : (
          <p className={styles.muted}>{l.note}</p>
        ))}
      <p className={styles.noAccount}>
        <Check size={16} aria-hidden /> No account or sign-up needed
      </p>
    </aside>
  );
}

function Pick({ b }: { b: PublicBookingLogic }) {
  return (
    <>
      <section className={styles.month} aria-label="Pick a day">
        <h2 className={styles.step}>Pick a day</h2>
        <div className={styles.monthHead}>
          <span className={styles.monthName}>{b.month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</span>
          <span className={styles.arrows}>
            <button type="button" onClick={b.prevMonth} disabled={!b.canGoBack} aria-label="Previous month">
              <ChevronLeft size={20} />
            </button>
            <button type="button" onClick={b.nextMonth} aria-label="Next month">
              <ChevronRight size={20} />
            </button>
          </span>
        </div>
        <div className={styles.grid} role="grid">
          {WEEK.map((w) => (
            <span key={w} className={styles.weekday}>
              {w}
            </span>
          ))}
          {b.days.map((d, i) =>
            d ? (
              <button
                key={i}
                type="button"
                className={styles.dayCell}
                data-free={d.slots.length > 0 || undefined}
                data-today={d.date.toDateString() === b.now.toDateString() || undefined}
                aria-pressed={b.day?.toDateString() === d.date.toDateString()}
                disabled={!d.slots.length}
                onClick={() => b.pickDay(d.date)}
                aria-label={`${longDay(d.date)}, ${d.slots.length} times free`}
              >
                {d.date.getDate()}
              </button>
            ) : (
              <span key={i} />
            )
          )}
        </div>
        <p className={styles.legend}>
          <span className={styles.dotFree} /> Has free times <span className={styles.dotPicked} /> Selected
        </p>
      </section>
      <section className={styles.times} aria-label="Times">
        {b.day ? (
          <>
            <h2 className={styles.dayTitle}>{longDay(b.day)}</h2>
            <p className={styles.muted}>{b.slots.length} times free</p>
            <div className={styles.slotList}>
              {b.slots.map((t) =>
                b.time?.getTime() === t.getTime() ? (
                  <span key={t.getTime()} className={styles.pickedRow}>
                    <span className={styles.picked}>{hhmm(t)}</span>
                    <button type="button" className={styles.next} onClick={b.next}>
                      Next
                    </button>
                  </span>
                ) : (
                  <button key={t.getTime()} type="button" className={styles.slot} onClick={() => b.pickTime(t)}>
                    {hhmm(t)}
                  </button>
                )
              )}
            </div>
          </>
        ) : (
          <p className={styles.muted}>No free times this month. Try the next one.</p>
        )}
      </section>
    </>
  );
}

function Details({ b }: { b: PublicBookingLogic }) {
  const l = b.link!;
  return (
    <section className={styles.details} aria-label="Your details">
      <h2 className={styles.step}>Your details</h2>
      <p className={styles.muted}>We only use these to send the invite</p>
      <div className={styles.chosen}>
        <CalendarDays size={22} aria-hidden />
        <span>
          <strong>
            {longDay(b.time!)}, {hhmm(b.time!)} to {hhmm(b.end!)}
          </strong>
          <span>
            {l.name} with {b.host.name}, {l.place.toLowerCase()}
          </span>
        </span>
        <button type="button" onClick={b.back}>
          Change
        </button>
      </div>
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          b.book();
        }}
      >
        <div className={styles.pair}>
          <label>
            Your name
            <input className={styles.input} value={b.name} onChange={(e) => b.setName(e.target.value)} autoComplete="name" />
          </label>
          <label>
            Email
            <input className={styles.input} type="email" value={b.email} onChange={(e) => b.setEmail(e.target.value)} autoComplete="email" />
          </label>
        </div>
        <label>
          Anything to share before the call? (optional)
          <textarea className={styles.input} rows={3} value={b.note} onChange={(e) => b.setNote(e.target.value)} />
        </label>
        <label className={styles.check}>
          <input type="checkbox" checked={b.reminder} onChange={(e) => b.setReminder(e.target.checked)} /> Email me a reminder an hour before
        </label>
        {b.error && (
          <p className={styles.error} role="alert">
            {b.error}
          </p>
        )}
        <div className={styles.formFoot}>
          <span className={styles.muted}>No account needed. You can cancel from the invite.</span>
          <button type="button" className={styles.outline} onClick={b.back}>
            Back
          </button>
          <button type="submit" className={styles.primary}>
            Confirm booking
          </button>
        </div>
      </form>
    </section>
  );
}

function Booked({ b }: { b: PublicBookingLogic }) {
  const l = b.link!;
  const cancelled = b.step === 'cancelled';
  return (
    <main className={styles.done}>
      <span className={styles.tick} aria-hidden>
        <Check size={26} />
      </span>
      <h1 className={styles.doneTitle}>{cancelled ? 'Booking cancelled' : 'You are booked'}</h1>
      <p className={styles.muted}>{cancelled ? `${b.host.first} will see the time is free again.` : `${b.host.first} will confirm shortly and email the invite to ${b.booking?.email ?? b.email}`}</p>
      {!cancelled && b.time && (
        <>
          <div className={styles.summary}>
            <Avatar id={b.host.avatarId} size={48} alt="" />
            <span>
              <strong>
                {l.name} with {b.host.name}
              </strong>
              <span>
                {longDay(b.time)}, {hhmm(b.time)} to {hhmm(b.end!)}, {l.place.toLowerCase()}
              </span>
            </span>
          </div>
          {l.note && (
            <div className={styles.note}>
              <span>A note from {b.host.first}</span>
              <p>{l.note}</p>
            </div>
          )}
          <p className={styles.addTitle}>Add it to your calendar</p>
          <div className={styles.addRow}>
            <a className={styles.outline} href={b.invite?.google} target="_blank" rel="noopener noreferrer">
              Google Calendar
            </a>
            <a className={styles.outline} href={b.invite?.outlook} target="_blank" rel="noopener noreferrer">
              Outlook
            </a>
            <button type="button" className={styles.outline} onClick={b.downloadIcs}>
              Apple (.ics)
            </button>
          </div>
          <p className={styles.links}>
            <button type="button" onClick={b.reschedule}>
              Reschedule
            </button>
            <button type="button" onClick={b.cancel}>
              Cancel
            </button>
          </p>
        </>
      )}
    </main>
  );
}
