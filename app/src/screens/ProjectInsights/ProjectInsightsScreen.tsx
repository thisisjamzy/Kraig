'use client';

// One project's Insights: status and stats, a burndown chart (remaining
// tasks, the ideal line to the deadline, and the forecast from today —
// red when it passes the deadline — with milestones as dots on the axis),
// and a milestone timeline that's edited from here.

import Link from 'next/link';
import { CalendarDays, Check, ChevronLeft, Circle, Flag, Plus, X } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ReferenceDot, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import { useLogic } from '@/src/logic/projectInsights/useLogic';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { Modal } from '@/src/widgets/Modal/Modal';
import { ScreenHeader } from '@/src/widgets/ScreenHeader/ScreenHeader';
import { dayKey, shortDate } from '@/src/viewmodels/insights/dates';
import type { MilestoneState } from '@/src/viewmodels/insights/metrics';
import { ProgressRing, RiskChip } from '@/src/screens/Insights/InsightsScreen';
import insightStyles from '@/src/screens/Insights/InsightsScreen.module.css';
import styles from './ProjectInsightsScreen.module.css';
import { useHasTopBar } from '@/src/widgets/AppShell/TopBarSlot';
import { useOwnsTitle } from '@/src/widgets/AppShell/breadcrumb';

const MILESTONE_TEXT: Record<MilestoneState, string> = {
  done: 'Done',
  'on track': 'On track',
  'at risk': 'At risk',
  missed: 'Missed',
};
const MILESTONE_COLOR: Record<MilestoneState, string> = {
  done: 'var(--i-done)',
  'on track': 'var(--color-brand)',
  'at risk': 'var(--i-amber)',
  missed: 'var(--i-cancel)',
};

export function ProjectInsightsScreen({ projectId }: { projectId: string }) {
  // Draws its own title: the shell adds none on wide screens.
  useOwnsTitle(useHasTopBar());
  const {
    project,
    stat,
    points,
    tasks,
    draft,
    setDraft,
    newMilestone,
    editMilestone,
    saveDraft,
    deleteDraft,
    saving,
    goBack,
    loading,
  } = useLogic(projectId);

  const late = Boolean(stat?.forecast && project?.endDate && stat.forecast > project.endDate.toDate());
  const keys = new Set(points.map((p) => p.key));
  const rows = points.map((p) => ({ ...p, label: shortDate(p.date) }));

  return (
    <div className={`${insightStyles.page} ${styles.page}`}>
      <ScreenHeader
        sticky={false}
        left={
          <button type="button" className={insightStyles.iconLink} onClick={goBack} aria-label="Back">
            <ChevronLeft size={20} strokeWidth={2} />
          </button>
        }
        right={
          <Link href={`/projects/${projectId}`} className={styles.openProject}>
            Open project
          </Link>
        }
      />

      <ScreenState loading={loading} error={!loading && !project ? 'This project could not be found.' : null} />

      {project && stat && (
        <>
          <div className={styles.titleRow}>
            <ProgressRing value={stat.progress} size={64} color={project.color} />
            <div className={styles.titleText}>
              <h1 className={styles.title}>{project.name}</h1>
              <RiskChip risk={stat.risk} />
            </div>
          </div>
          {stat.reasons.length > 0 && <p className={styles.reasons}>{stat.reasons.join(' · ')}</p>}

          <div className={insightStyles.tiles}>
            <Stat label="Velocity" value={`${stat.velocity.toFixed(1)}/day`} sub="Tasks done, last 14 days" />
            <Stat
              label="Forecast finish"
              value={stat.forecast ? shortDate(stat.forecast) : '—'}
              sub={stat.forecast ? `${stat.remaining} tasks left` : 'Nothing done lately'}
              tone={late ? 'bad' : undefined}
            />
            <Stat
              label="Slack"
              value={stat.slackDays === null ? '—' : `${stat.slackDays > 0 ? '+' : ''}${stat.slackDays} ${Math.abs(stat.slackDays) === 1 ? 'day' : 'days'}`}
              sub={project.endDate ? `Deadline ${shortDate(project.endDate.toDate())}` : 'No deadline set'}
              tone={stat.slackDays !== null && stat.slackDays < 0 ? 'bad' : undefined}
            />
            <Stat label="Overdue" value={String(stat.overdue)} sub="Tasks past their end" tone={stat.overdue ? 'bad' : undefined} />
          </div>

          <section className={insightStyles.card}>
            <header className={insightStyles.cardHead}>
              <h2 className={insightStyles.cardTitle}>Burndown</h2>
            </header>
            <p className={insightStyles.takeaway}>
              {stat.total === 0
                ? 'Add tasks to this project to see its burndown.'
                : stat.remaining === 0
                  ? 'Every task is done.'
                  : !stat.forecast
                    ? 'No tasks finished in the last two weeks, so there is no forecast yet.'
                    : late
                      ? `At this pace it finishes ${shortDate(stat.forecast)}, ${-(stat.slackDays ?? 0)} days after the deadline.`
                      : `At this pace it finishes ${shortDate(stat.forecast)}${stat.slackDays !== null ? `, ${stat.slackDays} days early` : ''}.`}
            </p>
            {stat.total > 0 && (
              <div className={insightStyles.chart}>
                <LineChart responsive style={{ width: '100%', height: 220 }} data={rows} margin={{ top: 10, right: 12, bottom: 0, left: -20 }}>
                  <CartesianGrid vertical={false} stroke="var(--i-grid)" />
                  <XAxis dataKey="key" tickFormatter={(k: string) => shortDate(new Date(`${k}T00:00:00`))} tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis allowDecimals={false} tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ background: 'var(--color-background)', border: '1px solid var(--color-border)', borderRadius: 12, fontSize: 12 }}
                    labelFormatter={(k) => shortDate(new Date(`${k}T00:00:00`))}
                    formatter={(value, name) => [value === null || value === undefined ? '—' : Math.round(Number(value) * 10) / 10, name]}
                  />
                  <ReferenceLine x={dayKey(new Date())} stroke="var(--color-text-secondary)" strokeDasharray="2 3" label={{ value: 'Today', position: 'insideTopLeft', fill: 'var(--color-text-secondary)', fontSize: 11 }} />
                  <Line dataKey="ideal" name="Ideal" stroke="var(--i-planned)" strokeWidth={2} strokeDasharray="6 5" dot={false} connectNulls isAnimationActive={false} />
                  <Line dataKey="remaining" name="Remaining" stroke="var(--color-brand)" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                  <Line dataKey="forecast" name="Forecast" stroke={late ? 'var(--i-cancel)' : 'var(--i-done)'} strokeWidth={2} strokeDasharray="4 4" dot={false} connectNulls isAnimationActive={false} />
                  {stat.milestones
                    .filter((m) => keys.has(dayKey(m.milestone.due)))
                    .map((m) => (
                      <ReferenceDot
                        key={m.milestone.id}
                        x={dayKey(m.milestone.due)}
                        y={0}
                        r={6}
                        fill={MILESTONE_COLOR[m.state]}
                        stroke="var(--i-card)"
                        strokeWidth={2}
                        ifOverflow="visible"
                      />
                    ))}
                </LineChart>
                <ul className={insightStyles.legend}>
                  <li>
                    <span className={insightStyles.legendSwatch} style={{ background: 'var(--color-brand)' }} aria-hidden /> Remaining
                  </li>
                  <li>
                    <span className={insightStyles.legendSwatch} data-pattern="dashed" style={{ borderColor: 'var(--i-planned)' }} aria-hidden /> Ideal
                  </li>
                  <li>
                    <span className={insightStyles.legendSwatch} data-pattern="dashed" style={{ borderColor: late ? 'var(--i-cancel)' : 'var(--i-done)' }} aria-hidden />
                    Forecast{late ? ' (late)' : ''}
                  </li>
                  {stat.milestones.length > 0 && (
                    <li>
                      <Flag size={12} strokeWidth={2.5} aria-hidden /> Milestones
                    </li>
                  )}
                </ul>
              </div>
            )}
          </section>

          <section className={insightStyles.card}>
            <header className={insightStyles.cardHead}>
              <h2 className={insightStyles.cardTitle}>Milestones</h2>
              <button type="button" className={styles.addButton} onClick={newMilestone}>
                <Plus size={16} strokeWidth={2.5} aria-hidden />
                Add
              </button>
            </header>
            {stat.milestones.length === 0 ? (
              <p className={insightStyles.takeaway}>Add checkpoints on the way to the deadline — each is forecast from its linked tasks.</p>
            ) : (
              <ol className={styles.timeline}>
                {stat.milestones.map((m) => (
                  <li key={m.milestone.id}>
                    <button type="button" className={styles.milestone} onClick={() => editMilestone(m.milestone.id)}>
                      <span className={styles.milestoneDot} style={{ background: MILESTONE_COLOR[m.state] }} aria-hidden>
                        {m.state === 'done' ? <Check size={12} strokeWidth={3} /> : <Circle size={6} fill="currentColor" strokeWidth={0} />}
                      </span>
                      <span className={styles.milestoneText}>
                        <span className={styles.milestoneName}>{m.milestone.name}</span>
                        <span className={styles.milestoneMeta}>
                          <CalendarDays size={12} strokeWidth={2} aria-hidden />
                          {shortDate(m.milestone.due)} · {m.linkedDone}/{m.linked} linked {m.linked === 1 ? 'task' : 'tasks'}
                        </span>
                      </span>
                      <span className={styles.milestoneChip} style={{ color: MILESTONE_COLOR[m.state] }}>
                        {MILESTONE_TEXT[m.state]}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}

      {draft && (
        <Modal title={draft.id ? 'Edit milestone' : 'New milestone'} onClose={() => setDraft(null)}>
          <form
            className={styles.form}
            onSubmit={(e) => {
              e.preventDefault();
              saveDraft();
            }}
          >
            <label className={styles.field}>
              Name
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Beta launch" autoFocus />
            </label>
            <label className={styles.field}>
              Due date
              <input type="date" value={draft.due} onChange={(e) => e.target.value && setDraft({ ...draft, due: e.target.value })} />
            </label>
            <fieldset className={styles.field}>
              <legend>Linked tasks</legend>
              {tasks.length === 0 ? (
                <p className={styles.hint}>This project has no tasks yet.</p>
              ) : (
                <div className={styles.taskList}>
                  {tasks.map((t) => {
                    const checked = draft.taskIds.includes(t.id);
                    return (
                      <label key={t.id} className={styles.taskOption}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setDraft({
                              ...draft,
                              taskIds: checked ? draft.taskIds.filter((id) => id !== t.id) : [...draft.taskIds, t.id],
                            })
                          }
                        />
                        <span data-done={t.status === 'done' || undefined}>{t.title}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </fieldset>
            <label className={styles.doneToggle}>
              <input
                type="checkbox"
                checked={draft.status === 'done'}
                onChange={(e) => setDraft({ ...draft, status: e.target.checked ? 'done' : 'pending' })}
              />
              Mark as reached
            </label>
            <button type="submit" className={styles.save} disabled={!draft.name.trim() || saving}>
              {saving ? 'Saving…' : 'Save milestone'}
            </button>
            {draft.id && (
              <button type="button" className={styles.remove} onClick={deleteDraft}>
                <X size={14} strokeWidth={2.5} aria-hidden />
                Remove milestone
              </button>
            )}
          </form>
        </Modal>
      )}
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: 'bad' }) {
  return (
    <div className={insightStyles.tile}>
      <span className={insightStyles.tileValue} data-tone={tone} style={tone ? { color: 'var(--i-cancel)' } : undefined}>
        {value}
      </span>
      <span className={insightStyles.tileLabel}>{label}</span>
      <span className={styles.statSub}>{sub}</span>
    </div>
  );
}
