'use client';

// Time's Home on tablet and web (Dreda v1.0 `Home / Web` 59920).
//   "Good morning, James"; today in a sentence. Share availability beside
//   New task.
//   Four stat cards: free time today, meetings this week, tasks due this
//   week, projects at risk.
//   This week: a column a day, meetings, other blocks and free time inside
//   the working day; a full day reads red, and a banner names it with
//   Rebalance (that day on the Calendar). Today: the agenda with its free
//   gaps (Block focus adds a task there). Portfolio: the active projects,
//   riskiest first. Scheduling links: Copy link, New scheduling link.

import Link from 'next/link';
import { AlertCircle, AtSign, CalendarDays, Check, ChevronRight, Plus, Sun } from 'lucide-react';
import { useLogic, type TimeHomeLogic } from '@/src/logic/timeHome/useLogic';
import { useTaskPanel } from '@/src/shared/navigation/taskPanel';
import { crumbOf, plural } from '@/src/viewmodels/organise';
import { hueVars } from '@/src/viewmodels/projects';
import { linkUrl, whenWords } from '@/src/viewmodels/scheduling-links';
import { clockText, minuteText, shortDuration, WORKDAY } from '@/src/viewmodels/todayPlan';
import { NotionPage } from '@/src/widgets/Database/NotionPage';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { StatCards } from '@/src/widgets/Dashboard/StatCard';
import { HueTag } from '@/src/widgets/TaskChips/TypePill';
import { HealthTag } from '@/src/widgets/ProjectDb/projectDatabase';
import { TopBarActions } from '@/src/widgets/AppShell/TopBarSlot';
import { HueBar, HueTile } from '@/src/screens/Organise/parts';
import org from '@/src/screens/Organise/Organise.module.css';
import styles from './TimeDashboardScreen.module.css';

const PORTFOLIO = 5;

export function TimeDashboardScreen() {
  const v = useLogic();
  const date = v.now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const sub = `${date}. ${plural(v.todayLoad.meetings, 'meeting')}, ${plural(v.dueToday, 'task')} due and ${shortDuration(v.freeLeft)} free today.`;

  return (
    <NotionPage title={v.hello} sub={sub} crumbs={[{ label: 'Home', href: '/projects/insights' }]}>
      <TopBarActions>
        <Link href="/projects/calendar/links" className={org.secondaryButton}>
          <AtSign size={20} strokeWidth={2} aria-hidden />
          Share availability
        </Link>
      </TopBarActions>
      <ScreenState loading={v.loading} />
      <StatCards
        stats={[
          {
            label: 'Free time today',
            icon: <Sun size={18} />,
            value: shortDuration(v.freeLeft),
            chip: v.longestLeft ? { text: shortDuration(v.longestLeft.endMin - v.longestLeft.startMin), hue: 'green' } : null,
            caption: v.longestLeft ? `longest at ${minuteText(v.longestLeft.startMin)}` : 'nothing left today',
            href: '/projects',
          },
          {
            label: 'Meetings this week',
            icon: <CalendarDays size={18} />,
            value: String(v.meetingsWeek),
            chip: v.fullest ? { text: v.fullest.date.toLocaleDateString('en-GB', { weekday: 'short' }), hue: 'rose' } : null,
            caption: v.fullest ? `${v.fullest.date.toLocaleDateString('en-GB', { weekday: 'long' })} is full` : 'room every day',
            href: '/projects/calendar',
          },
          { label: 'Tasks due this week', icon: <Check size={18} />, value: String(v.dueWeek), chip: { text: `${v.dueToday}`, hue: 'grey' }, caption: `${v.dueToday} today`, href: '/tasks?view=upcoming' },
          {
            label: 'Projects at risk',
            icon: <AlertCircle size={18} />,
            value: String(v.atRisk.length),
            chip: v.atRisk.length ? { text: `${v.atRisk.filter((p) => p.overdue > 0).length}`, hue: 'rose' } : null,
            caption: v.atRisk.length ? `${v.atRisk.filter((p) => p.overdue > 0).length} with overdue tasks` : 'all on course',
            href: '/projects/all?view=board',
          },
        ]}
      />
      <div className={styles.grid}>
        <Week v={v} />
        <Today v={v} />
        <Portfolio v={v} />
        <Links v={v} />
      </div>
    </NotionPage>
  );
}

function Week({ v }: { v: TimeHomeLogic }) {
  const span = WORKDAY.endMin - WORKDAY.startMin;
  return (
    <section className={styles.card} aria-label="This week">
      <header className={styles.head}>
        <span>
          <h2 className={styles.title}>This week</h2>
          <p className={styles.sub}>
            Meetings, focus blocks and free time, {minuteText(WORKDAY.startMin)} to {minuteText(WORKDAY.endMin)}
          </p>
        </span>
        <span className={styles.legend}>
          <i data-k="meeting" /> Meetings <i data-k="focus" /> Focus <i data-k="free" /> Free
        </span>
      </header>
      <div className={styles.bars}>
        {v.week.map((d) => {
          const isToday = d.iso === v.today;
          const l = d.load;
          return (
            <Link key={d.iso} href={`/projects/calendar?date=${d.iso}`} className={styles.day} data-full={l.full || undefined} data-today={isToday || undefined}>
              <span className={styles.dayName}>
                <span>{d.date.toLocaleDateString('en-GB', { weekday: 'short' })} {d.date.getDate()}</span>
              </span>
              <span className={styles.column} aria-hidden>
                <span data-k="free" style={{ flexGrow: l.weekend ? 1 : l.freeMin / span }} />
                {!l.weekend && <span data-k="focus" style={{ flexGrow: l.focusMin / span }} />}
                {!l.weekend && <span data-k="meeting" style={{ flexGrow: l.meetingMin / span }} />}
              </span>
              {l.weekend && l.meetings === 0 ? (
                <span className={styles.dayNote}>Weekend</span>
              ) : (
                <>
                  <span className={styles.count} data-full={l.full || undefined}>
                    {l.full && '● '}
                    {plural(l.meetings, 'meeting')}
                  </span>
                  <span className={styles.dayNote} data-full={l.full || undefined}>
                    {l.full ? 'No free time' : `${shortDuration(l.freeMin)} free`}
                  </span>
                </>
              )}
            </Link>
          );
        })}
      </div>
      {v.fullest && (
        <div className={styles.alert} role="note">
          <AlertCircle size={18} aria-hidden />
          <span>
            {v.fullest.date.toLocaleDateString('en-GB', { weekday: 'long' })} has {plural(v.fullest.load.meetings, 'meeting')} and no free block. Move something to another day or decline a meeting.
          </span>
          <Link href={`/projects/calendar?date=${v.fullest.iso}`} className={styles.outline}>
            Rebalance
          </Link>
        </div>
      )}
    </section>
  );
}

function Today({ v }: { v: TimeHomeLogic }) {
  const taskPanel = useTaskPanel();
  const hm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return (
    <section className={styles.card} aria-label="Today">
      <header className={styles.head}>
        <span>
          <h2 className={styles.title}>Today</h2>
          <p className={styles.sub}>Now {clockText(v.now)}</p>
        </span>
        <Link href="/projects/calendar" className={styles.headLink}>
          Calendar <ChevronRight size={18} aria-hidden />
        </Link>
      </header>
      {v.agenda.length === 0 ? (
        <p className={styles.sub}>Nothing on today.</p>
      ) : (
        <ol className={styles.agenda}>
          {v.agenda.map((a) =>
            a.kind === 'free' ? (
              <li key={a.key} className={styles.line} data-free>
                <span>
                  <strong>Free for {shortDuration((a.end.getTime() - a.start.getTime()) / 60000)}</strong>
                  <small>
                    {hm(a.start)} to {hm(a.end)}
                  </small>
                </span>
                <button type="button" className={styles.tonal} onClick={() => taskPanel.open('new', { date: v.today, start: hm(a.start) })}>
                  Block focus
                </button>
              </li>
            ) : (
              <li key={a.key} className={styles.line} data-now={a.now || undefined} style={{ ['--bar' as string]: hueVars(a.item?.hue ?? 'purple').solid }}>
                <span>
                  <strong>{a.item?.title}</strong>
                  <small>
                    {hm(a.start)} to {hm(a.end)}
                  </small>
                </span>
                {a.now && <HueTag hue="purple">● Now</HueTag>}
              </li>
            )
          )}
        </ol>
      )}
    </section>
  );
}

function Portfolio({ v }: { v: TimeHomeLogic }) {
  const onTrack = v.portfolio.filter((p) => p.health === 'On track').length;
  return (
    <section className={styles.card} aria-label="Portfolio">
      <header className={styles.head}>
        <span>
          <h2 className={styles.title}>Portfolio</h2>
          <p className={styles.sub}>
            {plural(v.projectCount, 'project')} in {plural(v.areaCount, 'area')}. {onTrack} on track, {v.atRisk.length} at risk
          </p>
        </span>
        <Link href="/projects/all" className={styles.headLink}>
          All projects <ChevronRight size={18} aria-hidden />
        </Link>
      </header>
      <div>
        {v.portfolio.slice(0, PORTFOLIO).map((p) => (
          <Link key={p.id} href={`/projects/${p.id}`} className={styles.project}>
            <HueTile hue={p.hue}>{p.letter}</HueTile>
            <span className={styles.projectName}>
              <span>{p.name}</span>
              <small>{crumbOf(p)}</small>
            </span>
            <span className={styles.projectBar}>
              <HueBar hue={p.hue} value={p.progress} />
            </span>
            <span className={styles.ratio}>
              {p.done}/{p.total}
            </span>
            <span className={styles.status}>
              {p.overdue > 0 ? <HueTag hue="rose">● {p.overdue} overdue</HueTag> : p.health === 'On track' ? <HealthTag health="On track" /> : p.end ? <HueTag hue="grey">Due {p.end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</HueTag> : <HealthTag health={p.health} />}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function Links({ v }: { v: TimeHomeLogic }) {
  const host = typeof window !== 'undefined' ? window.location.host : 'dreda.app';
  return (
    <section className={styles.card} aria-label="Scheduling links">
      <header className={styles.head}>
        <span>
          <h2 className={styles.title}>Scheduling links</h2>
          <p className={styles.sub}>{plural(v.bookingsWeek, 'booking')} this week</p>
        </span>
      </header>
      {v.links.map((l) => (
        <div key={l.id} className={styles.link} style={{ ['--bar' as string]: hueVars(l.hue).solid }}>
          <span className={styles.linkHead}>
            <span>
              <strong>{l.name}</strong>
              <small>
                {l.minutes} min · {l.cadence === 'repeating' ? 'Repeats weekly' : 'One-off'}
              </small>
            </span>
            {v.bookedFor(l.id) > 0 && <HueTag hue="green">{v.bookedFor(l.id)} booked</HueTag>}
          </span>
          <span className={styles.linkFoot}>
            <small>{whenWords(l).replace('Every week, ', '')}</small>
            <button
              type="button"
              className={styles.outline}
              onClick={() => void navigator.clipboard?.writeText(`${window.location.protocol}//${linkUrl(host, l.slug)}`)}
            >
              Copy link
            </button>
          </span>
        </div>
      ))}
      <Link href="/projects/calendar/links" className={styles.tonalWide}>
        <Plus size={20} aria-hidden /> New scheduling link
      </Link>
    </section>
  );
}
