'use client';

// Time's Home on the phone (Dreda v1.0 `Home / Phone` 68414): the same
// header as Money's Home (your face, opening Profile, then the greeting;
// the bell on the right), quick actions to every Time page, four small
// figures, the week's load (a full day in red, with Rebalance),
// the portfolio and the scheduling links.

import Link from 'next/link';
import { useLogic } from '@/src/logic/timeHome/useLogic';
import { plural } from '@/src/viewmodels/organise';
import { hueVars } from '@/src/viewmodels/projects';
import { linkUrl } from '@/src/viewmodels/scheduling-links';
import { minuteText, shortDuration, WORKDAY } from '@/src/viewmodels/todayPlan';
import { HueTag } from '@/src/widgets/TaskChips/TypePill';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { GreetingHeader } from '@/src/phone/widgets/GreetingHeader/GreetingHeader';
import { TimeQuickActions } from '@/src/phone/widgets/TimeQuickActions/TimeQuickActions';
import { Tile } from '@/src/phone/widgets/OrganiseCards/OrganiseCards';
import styles from '@/src/phone/screens/TimeDashboard/TimeDashboardScreen.module.css';

const HEALTH_HUE = { 'On track': 'green', Watch: 'amber', 'At risk': 'orange', Done: 'grey' } as const;

export function TimeDashboardScreen() {
  const v = useLogic();
  const span = WORKDAY.endMin - WORKDAY.startMin;
  const host = typeof window !== 'undefined' ? window.location.host : 'dreda.app';

  return (
    <div className={styles.page}>
      <GreetingHeader module="time" />
      <ScreenState loading={v.loading} />
      <div className={styles.tiles}>
        <Figure label="Free time today" value={shortDuration(v.freeLeft)} note={v.longestLeft ? `Longest at ${minuteText(v.longestLeft.startMin)}` : 'Nothing left today'} />
        <Figure label="Meetings this week" value={String(v.meetingsWeek)} note={v.fullest ? `${v.fullest.date.toLocaleDateString('en-GB', { weekday: 'long' })} is full` : 'Room every day'} alert={Boolean(v.fullest)} />
        <Figure label="Tasks due this week" value={String(v.dueWeek)} note={`${v.dueToday} today`} />
        <Figure label="Projects at risk" value={String(v.atRisk.length)} note={`${v.atRisk.filter((p) => p.overdue > 0).length} with overdue tasks`} />
      </div>

      <TimeQuickActions />

      <section className={styles.card} aria-label="This week">
        <h2 className={styles.title}>
          This week{' '}
          <span className={styles.muted}>
            {minuteText(WORKDAY.startMin)} to {minuteText(WORKDAY.endMin)}
          </span>
        </h2>
        <p className={styles.legend}>
          <i data-k="meeting" /> Meetings <i data-k="focus" /> Focus <i data-k="free" /> Free
        </p>
        <div className={styles.bars}>
          {v.week.map((d) => (
            <Link key={d.iso} href={`/projects/calendar?date=${d.iso}`} className={styles.day} data-full={d.load.full || undefined}>
              <span className={styles.dayName} data-today={d.iso === v.today || undefined}>
                {d.date.toLocaleDateString('en-GB', { weekday: 'short' })}
              </span>
              <span className={styles.column} aria-hidden>
                <span data-k="free" style={{ flexGrow: d.load.weekend ? 1 : d.load.freeMin / span }} />
                {!d.load.weekend && <span data-k="focus" style={{ flexGrow: d.load.focusMin / span }} />}
                {!d.load.weekend && <span data-k="meeting" style={{ flexGrow: d.load.meetingMin / span }} />}
              </span>
              <span className={styles.free} data-full={d.load.full || undefined}>
                {d.load.weekend ? '' : d.load.full ? 'None' : shortDuration(d.load.freeMin).replace(' m', '').replace(' h ', ' h ')}
              </span>
            </Link>
          ))}
        </div>
        {v.fullest && (
          <div className={styles.alert}>
            <span>
              {v.fullest.date.toLocaleDateString('en-GB', { weekday: 'long' })} has {plural(v.fullest.load.meetings, 'meeting')} and no free block.
            </span>
            <Link href={`/projects/calendar?date=${v.fullest.iso}`}>Rebalance</Link>
          </div>
        )}
      </section>

      <section className={styles.card} aria-label="Portfolio">
        <h2 className={styles.title}>
          Portfolio <span className={styles.muted}>{plural(v.projectCount, 'project')}</span>
          <Link href="/projects/all" className={styles.link}>
            All
          </Link>
        </h2>
        {v.portfolio.slice(0, 4).map((p) => (
          <Link key={p.id} href={`/projects/${p.id}`} className={styles.project}>
            <Tile hue={p.hue}>{p.letter}</Tile>
            <span className={styles.projectText}>
              <span>{p.name}</span>
              <span className={styles.bar}>
                <span style={{ width: `${Math.round(p.progress * 100)}%`, background: hueVars(p.hue).solid }} />
              </span>
            </span>
            {p.overdue > 0 ? <HueTag hue="rose">● {p.overdue} overdue</HueTag> : p.health === 'On track' || !p.end ? <HueTag hue={HEALTH_HUE[p.health]}>{p.health}</HueTag> : <HueTag hue="grey">Due {p.end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</HueTag>}
          </Link>
        ))}
      </section>

      {v.links.length > 0 && (
        <section className={styles.card} aria-label="Scheduling links">
          <h2 className={styles.title}>
            Scheduling links <span className={styles.muted}>{plural(v.bookingsWeek, 'booking')} this week</span>
          </h2>
          {v.links.map((l) => (
            <div key={l.id} className={styles.schedLink} style={{ ['--bar' as string]: hueVars(l.hue).solid }}>
              <span>
                <strong>{l.name}</strong>
                <small>
                  {l.minutes} min · {l.cadence === 'repeating' ? 'Repeats weekly' : 'One-off'}
                </small>
              </span>
              <button type="button" className={styles.outline} onClick={() => void navigator.clipboard?.writeText(`${window.location.protocol}//${linkUrl(host, l.slug)}`)}>
                Copy link
              </button>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function Figure({ label, value, note, alert }: { label: string; value: string; note: string; alert?: boolean }) {
  return (
    <div className={styles.figure}>
      <span className={styles.muted}>{label}</span>
      <strong>{value}</strong>
      <span className={alert ? styles.alertText : styles.muted}>{note}</span>
    </div>
  );
}
