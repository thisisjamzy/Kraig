'use client';

// Public booking (Dreda v1.0 `Public booking` 60952, 61159, 61287; phone
// 70352, 70447, 70505): the booker's three steps on /book/[slug], with no
// account and no app chrome. Pick a day and a time, give a name, email and
// note, then the booking is made as a request the host confirms (Calendar's
// booking request). Add it to a calendar, reschedule or cancel.
//
// The link and its bookings come from the scheduling store for now: the
// booking-link and booking documents wait on the owner (BUILD-KIT section
// 7.6 and 7.7), so a booking made here shows in this browser's Calendar and
// Scheduling, and no email is sent (section 7.8).

import { useMemo, useState } from 'react';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { PROFILE_AVATAR_ID } from '@/src/viewmodels/people';
import { daySlots, inviteLinks, type Booking } from '@/src/viewmodels/scheduling-links';
import { schedulingStore, useScheduling } from '@/src/logic/schedulingLinks/store';

export type Step = 'pick' | 'details' | 'booked' | 'cancelled';

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function useLogic(slug: string) {
  const { user } = useFirebaseUser();
  const { links, bookings } = useScheduling();
  const link = links.find((l) => l.slug === slug) ?? null;
  const [now] = useState(() => new Date());
  const [month, setMonth] = useState(() => startOfMonth(now));
  const [day, setDay] = useState<Date | null>(null);
  const [time, setTime] = useState<Date | null>(null);
  const [step, setStep] = useState<Step>('pick');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [reminder, setReminder] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [booking, setBooking] = useState<Booking | null>(null);

  const hostName = user?.displayName?.trim() || '';
  const host = { name: hostName || 'Your host', first: hostName ? hostName.split(/\s+/)[0] : 'your host', avatarId: PROFILE_AVATAR_ID };
  // "London, GMT", "Douala, GMT+1"
  const zone = useMemo(() => {
    const city = (Intl.DateTimeFormat().resolvedOptions().timeZone.split('/').pop() ?? '').replace(/_/g, ' ');
    const short = new Intl.DateTimeFormat('en-GB', { timeZoneName: 'short' }).formatToParts(now).find((p) => p.type === 'timeZoneName')?.value ?? '';
    return [city, short].filter(Boolean).join(', ');
  }, [now]);

  /** Every day of the month on the grid, Monday first, with its free times. */
  const days = useMemo(() => {
    if (!link) return [];
    const first = month;
    const lead = (first.getDay() + 6) % 7;
    const count = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    return [
      ...Array.from({ length: lead }, () => null),
      ...Array.from({ length: count }, (_, i) => {
        const date = new Date(first.getFullYear(), first.getMonth(), i + 1);
        return { date, slots: daySlots(link, date, bookings, now) };
      }),
    ];
  }, [link, month, bookings, now]);

  // The first day with free times is picked to start with.
  const firstFree = days.find((d) => d && d.slots.length > 0) ?? null;
  const shownDay = day ?? firstFree?.date ?? null;
  const slots = link && shownDay ? daySlots(link, shownDay, bookings, now) : [];
  const end = time && link ? new Date(time.getTime() + link.minutes * 60000) : null;

  /** The week around the picked day (the phone strip). */
  const week = useMemo(() => {
    if (!link) return [];
    const base = shownDay ?? now;
    const monday = new Date(base.getFullYear(), base.getMonth(), base.getDate() - ((base.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
      return { date, slots: daySlots(link, date, bookings, now) };
    });
  }, [link, shownDay, bookings, now]);

  function book() {
    if (!link || !time) return;
    if (!name.trim()) return setError('Add your name.');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Add an email we can send the invite to.');
    setError(null);
    const b: Booking = { id: `local-${Date.now().toString(36)}`, linkId: link.id, name: name.trim(), email: email.trim(), note: note.trim(), at: time, status: 'requested' };
    schedulingStore.addBooking(b);
    setBooking(b);
    setStep('booked');
  }

  const invite =
    link && time && end
      ? inviteLinks({ title: `${link.name} with ${host.name}`, start: time, end, details: link.note || `${link.name}, booked with Dreda.`, location: link.place })
      : null;

  return {
    link,
    host,
    zone,
    now,
    step,
    month,
    prevMonth: () => setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1)),
    nextMonth: () => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1)),
    canGoBack: month > startOfMonth(now),
    days,
    week,
    shiftWeek: (by: number) => {
      const base = shownDay ?? now;
      const next = new Date(base.getFullYear(), base.getMonth(), base.getDate() + 7 * by);
      setDay(next);
      setMonth(startOfMonth(next));
      setTime(null);
    },
    day: shownDay,
    pickDay: (d: Date) => {
      setDay(d);
      setTime(null);
    },
    slots,
    time,
    end,
    pickTime: setTime,
    next: () => time && setStep('details'),
    back: () => setStep('pick'),
    name,
    setName,
    email,
    setEmail,
    note,
    setNote,
    reminder,
    setReminder,
    error,
    book,
    booking,
    invite,
    downloadIcs: () => {
      if (!invite) return;
      const url = URL.createObjectURL(new Blob([invite.ics], { type: 'text/calendar' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${link?.slug ?? 'booking'}.ics`;
      a.click();
      URL.revokeObjectURL(url);
    },
    reschedule: () => {
      if (booking) schedulingStore.setBooking(booking.id, 'declined');
      setBooking(null);
      setTime(null);
      setStep('pick');
    },
    cancel: () => {
      if (booking) schedulingStore.setBooking(booking.id, 'declined');
      setStep('cancelled');
    },
  };
}

export type PublicBookingLogic = ReturnType<typeof useLogic>;
