'use client';

// Public booking on a phone (Dreda v1.0 70352, 70447, 70505): the host and
// the link with their note; the week's days (free ones tinted) and the
// day's times in two columns; Continue with the time. Then Your details
// with Book; then You are booked, with Add it to your calendar, Reschedule
// and Cancel. No account, no app chrome.

import { Check, ChevronRight } from 'lucide-react';
import { useLogic, type PublicBookingLogic } from '@/src/logic/publicBooking/useLogic';
import { hhmm } from '@/src/viewmodels/scheduling-links';
import { Logo } from '@/src/widgets/Logo/Logo';
import { Avatar } from '@/src/widgets/People/People';
import styles from '@/src/phone/screens/PublicBooking/PublicBookingScreen.module.css';

const short = (d: Date) => d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

export function PublicBookingScreen({ slug }: { slug: string }) {
  const b = useLogic(slug);
  const zone = b.zone;
  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <Logo height={40} />
        <span className={styles.muted}>{zone}</span>
      </header>
      {!b.link || !b.link.active ? (
        <section className={styles.card}>
          <h1 className={styles.big}>This link is not open</h1>
          <p className={styles.muted}>Ask the person who sent it for a new one.</p>
        </section>
      ) : b.step === 'pick' ? (
        <Pick b={b} />
      ) : b.step === 'details' ? (
        <Details b={b} />
      ) : (
        <Booked b={b} />
      )}
    </div>
  );
}

function Pick({ b }: { b: PublicBookingLogic }) {
  const l = b.link!;
  const freeDays = b.week.filter((d) => d.slots.length > 0).length;
  return (
    <>
      <section className={styles.card}>
        <div className={styles.hostRow}>
          <Avatar id={b.host.avatarId} size={48} alt="" />
          <span>
            <span className={styles.muted}>{b.host.name}</span>
            <h1 className={styles.title}>{l.name}</h1>
          </span>
        </div>
        <p className={styles.muted}>
          {l.minutes} minutes · {l.place === 'Video call' ? 'Video call, link sent after booking' : l.place}
        </p>
        {l.note && (
          <div className={styles.note}>
            <span>A note from {b.host.first}</span>
            <p>{l.note}</p>
          </div>
        )}
      </section>
      <section className={styles.card}>
        <h2 className={styles.head}>
          {b.week[3]?.date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })} <span className={styles.muted}>{freeDays} days free this week</span>
        </h2>
        <div className={styles.week}>
          {b.week.map((d) => (
            <button
              key={d.date.toISOString()}
              type="button"
              className={styles.day}
              data-free={d.slots.length > 0 || undefined}
              aria-pressed={b.day?.toDateString() === d.date.toDateString()}
              disabled={!d.slots.length}
              onClick={() => b.pickDay(d.date)}
            >
              <span>{d.date.toLocaleDateString('en-GB', { weekday: 'short' })}</span>
              <strong>{d.date.getDate()}</strong>
            </button>
          ))}
        </div>
        <button type="button" className={styles.link} onClick={() => b.shiftWeek(1)}>
          Next week <ChevronRight size={14} aria-hidden />
        </button>
      </section>
      {b.day && (
        <section className={styles.card}>
          <h2 className={styles.head}>
            {b.day.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} <span className={styles.muted}>{b.slots.length} times free</span>
          </h2>
          <div className={styles.slots}>
            {b.slots.map((t) => (
              <button key={t.getTime()} type="button" className={styles.slot} aria-pressed={b.time?.getTime() === t.getTime()} onClick={() => b.pickTime(t)}>
                {hhmm(t)}
              </button>
            ))}
          </div>
        </section>
      )}
      <p className={styles.muted}>No account or sign-up needed</p>
      <footer className={styles.footer}>
        <button type="button" className={styles.primary} disabled={!b.time} onClick={b.next}>
          {b.time ? `Continue with ${b.time.toLocaleDateString('en-GB', { weekday: 'short' })} ${hhmm(b.time)}` : 'Pick a time'}
        </button>
      </footer>
    </>
  );
}

function Details({ b }: { b: PublicBookingLogic }) {
  const l = b.link!;
  return (
    <>
      <section className={`${styles.card} ${styles.chosen}`}>
        <Avatar id={b.host.avatarId} size={40} alt="" />
        <span>
          <strong>
            {l.name} with {b.host.first}
          </strong>
          <span className={styles.muted}>
            {short(b.time!)} · {hhmm(b.time!)} to {hhmm(b.end!)}
          </span>
        </span>
        <button type="button" className={styles.link} onClick={b.back}>
          Change
        </button>
      </section>
      <form
        className={styles.card}
        onSubmit={(e) => {
          e.preventDefault();
          b.book();
        }}
      >
        <h2 className={styles.head}>Your details</h2>
        <label className={styles.field}>
          Name
          <input className={styles.input} value={b.name} onChange={(e) => b.setName(e.target.value)} autoComplete="name" />
        </label>
        <label className={styles.field}>
          Email
          <input className={styles.input} type="email" value={b.email} onChange={(e) => b.setEmail(e.target.value)} autoComplete="email" />
        </label>
        <label className={styles.field}>
          Anything {b.host.first === 'your host' ? 'they' : b.host.first} should know?
          <textarea className={styles.input} rows={3} value={b.note} onChange={(e) => b.setNote(e.target.value)} />
        </label>
        <p className={styles.muted}>{b.host.first} confirms each booking. You will get an email with the details once they do.</p>
        {b.error && (
          <p className={styles.error} role="alert">
            {b.error}
          </p>
        )}
        <footer className={styles.footer}>
          <button type="submit" className={styles.primary}>
            Book {b.time!.toLocaleDateString('en-GB', { weekday: 'short' })} {hhmm(b.time!)}
          </button>
        </footer>
      </form>
    </>
  );
}

function Booked({ b }: { b: PublicBookingLogic }) {
  const l = b.link!;
  const cancelled = b.step === 'cancelled';
  return (
    <section className={`${styles.card} ${styles.done}`}>
      <span className={styles.tick} aria-hidden>
        <Check size={24} />
      </span>
      <h1 className={styles.big}>{cancelled ? 'Booking cancelled' : 'You are booked'}</h1>
      <p className={styles.muted}>{cancelled ? `${b.host.first} will see the time is free again.` : `${b.host.first} will confirm shortly and email the invite to ${b.booking?.email ?? b.email}`}</p>
      {!cancelled && b.time && (
        <>
          <div className={styles.summary}>
            <Avatar id={b.host.avatarId} size={40} alt="" />
            <span>
              <strong>
                {l.name} with {b.host.name}
              </strong>
              <span className={styles.muted}>
                {short(b.time)} · {hhmm(b.time)} to {hhmm(b.end!)} · {l.place}
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
          <a className={styles.outline} href={b.invite?.google} target="_blank" rel="noopener noreferrer">
            Google Calendar
          </a>
          <button type="button" className={styles.outline} onClick={b.downloadIcs}>
            Apple Calendar
          </button>
          <a className={styles.outline} href={b.invite?.outlook} target="_blank" rel="noopener noreferrer">
            Outlook
          </a>
          <p className={styles.links}>
            <button type="button" className={styles.link} onClick={b.reschedule}>
              Reschedule
            </button>
            <button type="button" className={styles.link} onClick={b.cancel}>
              Cancel
            </button>
          </p>
        </>
      )}
    </section>
  );
}
