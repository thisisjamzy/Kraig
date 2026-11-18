'use client';

// Time's Home (Dreda v1.0 `Home` 59920, phone 68414): the greeting and
// today in a sentence; free time today, meetings this week, tasks due this
// week, projects at risk; the week's load day by day (meetings, other
// blocks, free time in the working day) with the fullest day called out;
// today's agenda with its free gaps; the portfolio; scheduling links.

import { useMemo } from 'react';
import { useLogic as useCalendar } from '@/src/logic/timeCalendar/useLogic';
import { useOrganise } from '@/src/logic/organise/useOrganise';
import { useScheduling } from '@/src/logic/schedulingLinks/store';
import { useFirebaseUser } from '@/src/shared/hooks/useFirebaseUser';
import { useNowMinute } from '@/src/shared/insights/useNow';
import { dayFromIso, isoDay, mondayOf, shiftDay, type CalItem } from '@/src/viewmodels/calendarItems';
import { bookedThisWeek } from '@/src/viewmodels/scheduling-links';
import { dayLoad, freeGaps, greeting, busySpans, WORKDAY, type DayLoad } from '@/src/viewmodels/todayPlan';

export interface AgendaLine {
  key: string;
  kind: 'item' | 'free';
  start: Date;
  end: Date;
  item?: CalItem;
  now: boolean;
}

export function useLogic() {
  const cal = useCalendar();
  const o = useOrganise();
  const { links, bookings } = useScheduling();
  const { user } = useFirebaseUser();
  const minute = useNowMinute();
  const now = new Date(minute * 60000);
  const today = cal.today;

  const week = useMemo(() => {
    const monday = mondayOf(today);
    return Array.from({ length: 7 }, (_, i) => {
      const iso = shiftDay(monday, i);
      const items = cal.itemsOn(iso).filter((it) => !it.allDay && (it.start || it.end));
      return { iso, date: dayFromIso(iso), load: dayLoad(items, dayFromIso(iso)) };
    });
  }, [cal, today]);

  const todayLoad: DayLoad = week.find((d) => d.iso === today)?.load ?? dayLoad([], dayFromIso(today));
  const fullest = week.filter((d) => d.load.full).sort((a, b) => b.load.meetings - a.load.meetings)[0] ?? null;
  const meetingsWeek = week.reduce((s, d) => s + d.load.meetings, 0);

  // Free time today counts from now on.
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const todayDate = dayFromIso(today);
  const todayItems = cal.itemsOn(today).filter((it) => !it.allDay && it.start).sort((a, b) => a.start!.getTime() - b.start!.getTime());
  const gapsLeft = freeGaps(busySpans(todayItems, todayDate), Math.max(WORKDAY.startMin, nowMin));
  const freeLeft = gapsLeft.reduce((s, g) => s + g.endMin - g.startMin, 0);
  const longestLeft = gapsLeft.reduce<(typeof gapsLeft)[number] | null>((b, g) => (!b || g.endMin - g.startMin > b.endMin - b.startMin ? g : b), null);

  /** Today's items and free gaps of half an hour or more, in time order. */
  const agenda: AgendaLine[] = useMemo(() => {
    const at = (m: number) => new Date(todayDate.getTime() + m * 60000);
    const lines: AgendaLine[] = [
      ...todayItems.map((it) => {
        const end = it.end ?? new Date(it.start!.getTime() + 3600000);
        return { key: it.key, kind: 'item' as const, start: it.start!, end, item: it, now: it.start!.getTime() <= now.getTime() && end.getTime() > now.getTime() };
      }),
      ...gapsLeft.filter((g) => g.endMin - g.startMin >= 30).map((g) => ({ key: `free-${g.startMin}`, kind: 'free' as const, start: at(g.startMin), end: at(g.endMin), now: false })),
    ];
    return lines.sort((a, b) => a.start.getTime() - b.start.getTime());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recomputed each minute with `now`
  }, [cal, today, minute]);

  // Tasks due this week (open) and today.
  const sunday = dayFromIso(shiftDay(mondayOf(today), 7));
  const open = cal.db.actionable.filter((r) => r.status === 'Pending' && r.date);
  const dueWeek = open.filter((r) => r.date! >= todayDate && r.date! < sunday).length;
  const dueToday = open.filter((r) => isoDay(r.date!) === today).length;

  const live = o.projects.filter((p) => p.status === 'Active');
  const atRisk = live.filter((p) => p.health === 'At risk');
  const portfolio = [...live].sort((a, b) => Number(b.health === 'At risk') - Number(a.health === 'At risk') || b.overdue - a.overdue || (a.end?.getTime() ?? Infinity) - (b.end?.getTime() ?? Infinity));

  const first = (user?.displayName ?? '').trim().split(/\s+/)[0];

  return {
    loading: cal.loading || o.loading,
    now,
    today,
    hello: first ? `${greeting(now)}, ${first}` : greeting(now),
    greetingWord: greeting(now),
    firstName: first,
    todayLoad,
    freeLeft,
    longestLeft,
    meetingsWeek,
    dueWeek,
    dueToday,
    week,
    fullest,
    agenda,
    portfolio,
    atRisk,
    projectCount: live.length,
    areaCount: o.areas.length,
    links: links.filter((l) => l.active),
    bookingsWeek: bookedThisWeek(bookings, null, now),
    bookedFor: (linkId: string) => bookedThisWeek(bookings, linkId, now),
  };
}

export type TimeHomeLogic = ReturnType<typeof useLogic>;
