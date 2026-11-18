'use client';

// A booked event, opened (Dreda v1.0 `Booking details` 67330, phone 70753;
// BUILD-KIT section 4, new piece 2): the link with its time and where, To
// confirm until it is answered, who booked it (name, email, when, from
// which link), their note, then Decline, New time and Confirm. A popover on
// web, a sheet on the phone.

import { useEffect } from 'react';
import { hueVars } from '@/src/viewmodels/projects';
import type { Booking, SchedLink } from '@/src/viewmodels/scheduling-links';
import { Modal } from '@/src/widgets/Modal/Modal';
import { Initials } from '@/src/widgets/TaskChips/Initials';
import { HueTag } from '@/src/widgets/TaskChips/TypePill';
import styles from './BookingRequest.module.css';

function ago(d: Date, now: Date) {
  const h = Math.round((now.getTime() - d.getTime()) / 3600000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h} h ago`;
  const days = Math.round(h / 24);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}

export function BookingRequest({
  booking: b,
  link,
  bookedAt,
  sheet = false,
  onAnswer,
  onClose,
}: {
  booking: Booking;
  link: SchedLink | null;
  /** When the booking was made, when known. */
  bookedAt?: Date | null;
  sheet?: boolean;
  onAnswer: (answer: 'confirm' | 'decline' | 'newTime') => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (sheet) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [sheet, onClose]);

  const minutes = link?.minutes ?? 30;
  const end = new Date(b.at.getTime() + minutes * 60000);
  const t = (d: Date) => `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  const when = `${b.at.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}, ${t(b.at)} to ${t(end)}${link ? `, ${link.place.toLowerCase()}` : ''}`;
  const first = b.name.split(/\s+/)[0];
  const body = (
    <div className={styles.body}>
      <div className={styles.head}>
        <span className={styles.bar} style={{ background: hueVars(link?.hue ?? 'blue').solid }} aria-hidden />
        <span className={styles.headText}>
          <span className={styles.title}>{link?.name ?? 'Booking'}</span>
          <span className={styles.when}>{when}</span>
        </span>
        {b.status === 'requested' ? <HueTag hue="amber">● To confirm</HueTag> : b.status === 'confirmed' ? <HueTag hue="green">Confirmed</HueTag> : <HueTag hue="grey">Declined</HueTag>}
      </div>
      <div className={styles.who}>
        <Initials name={b.name} size={40} />
        <span>
          <strong>Booked by {b.name}</strong>
          <span className={styles.meta}>
            {[b.email, bookedAt ? ago(bookedAt, new Date()) : null, link ? `from your ${link.name} link` : null].filter(Boolean).join(' · ')}
          </span>
        </span>
      </div>
      {b.note && (
        <div className={styles.note}>
          <span>Their note</span>
          <p>{b.note}</p>
        </div>
      )}
      {b.status === 'requested' && (
        <>
          <div className={styles.actions}>
            <button type="button" className={styles.outline} onClick={() => onAnswer('decline')}>
              Decline
            </button>
            <button type="button" className={styles.ghost} onClick={() => onAnswer('newTime')}>
              New time
            </button>
            <button type="button" className={styles.primary} onClick={() => onAnswer('confirm')}>
              Confirm
            </button>
          </div>
          <p className={styles.foot}>Confirming opens an email to {first} with the details, ready to send.</p>
        </>
      )}
    </div>
  );

  if (sheet) {
    return (
      <Modal sheet titleHidden title={`Booking: ${link?.name ?? b.name}`} onClose={onClose}>
        {body}
      </Modal>
    );
  }
  return (
    <div className={styles.layer} onClick={onClose}>
      <div className={styles.popover} role="dialog" aria-label={`Booking: ${link?.name ?? b.name}`} onClick={(e) => e.stopPropagation()}>
        {body}
      </div>
    </div>
  );
}
