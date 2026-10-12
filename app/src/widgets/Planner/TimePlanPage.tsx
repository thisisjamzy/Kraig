'use client';

// The time plan (Remix/Priorities/priorities-forecasting-brief.md, section
// 6), one responsive page for phone and web: the title and what the locked
// layer means, the controls (this week or two weeks, auto-plan, clear,
// reset hours, scenario, send to calendar, save hours), six KPIs, the daily
// load with deadline warnings and "Add the hours", the hours waterfall,
// hours by project, the week board and the deadline check.

import { useState } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { GripVertical, Minus, Plus } from 'lucide-react';
import { ChartCard, GuideProvider, KpiTile } from '@/src/widgets/Charts/ChartCard';
import charts from '@/src/widgets/Charts/Charts.module.css';
import { PLAN_GUIDE } from '@/src/shared/planner/guides';
import { dayLabel, WEEKDAY, weekdayOf, ymd, type Day } from '@/src/viewmodels/planner/days';
import { capacityOn, freeOn, meetingHours, meetingsOn, type PlanTask } from '@/src/viewmodels/planner/time';
import type { TimePlanLogic } from '@/src/logic/timePlan/useTimePlan';
import { Modal } from '@/src/widgets/Modal/Modal';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { BarRows, ColumnWaterfall, DailyLoad, LockGlyph } from './PlanCharts';
import { ScenarioBar } from './ScenarioBar';
import p from './Planner.module.css';
import { styleGuide } from '@/src/styles/tokens/styleGuide';

const h = (x: number) => `${Math.round(x * 10) / 10} h`;
const short = (d: Day) => `${WEEKDAY[weekdayOf(d)]} ${ymd(d).d}`;

export function TimePlanPage({ logic, web = false }: { logic: TimePlanLogic; web?: boolean }) {
  const { input, scenario, view, actions, store } = logic;
  const [confirm, setConfirm] = useState<'calendar' | 'hours' | null>(null);
  if (logic.loading) return <ScreenState loading />;
  const { kpis, waterfall: wf } = view;
  const span = scenario.horizon === 7 ? 'this week' : 'over 2 weeks';
  const projects = [...new Map(view.load.flatMap((d) => d.parts).map((x) => [x.project, x.color])).entries()];

  return (
    <div className={`${p.root} ${charts.palette}`} data-web={web || undefined}>
      <GuideProvider resetKey="time-plan">
        <header className={p.intro}>
          <h1 className={p.title}>Plan your time</h1>
          <p className={p.lede}>
            Your recurring meetings are the <b>locked layer</b>: they happen every week and take their hours first. Set how many hours you work each day, spread your tasks over what is left, and check that every deadline is met. Nothing here changes your calendar until you send it.
          </p>
        </header>

        <div className={p.controls}>
          <div className={p.seg} role="group" aria-label="Horizon">
            <button type="button" aria-pressed={scenario.horizon === 7} onClick={() => actions.setHorizon(7)}>
              This week
            </button>
            <button type="button" aria-pressed={scenario.horizon === 14} onClick={() => actions.setHorizon(14)}>
              2 weeks
            </button>
          </div>
          <button type="button" className={p.button} data-primary onClick={actions.autoPlan}>
            Auto-plan
          </button>
          <button type="button" className={p.button} onClick={actions.clear}>
            Clear plan
          </button>
          <button type="button" className={p.button} onClick={actions.resetHours} disabled={!Object.keys(scenario.capacity).length}>
            Reset hours
          </button>
          <ScenarioBar store={store} />
          <button type="button" className={p.button} onClick={() => setConfirm('calendar')} disabled={!logic.calendarBlocks.length}>
            Send to calendar
          </button>
          {logic.capacityChanges.length > 0 && (
            <button type="button" className={p.button} onClick={() => setConfirm('hours')}>
              Save hours
            </button>
          )}
        </div>

        <div className={p.kpis}>
          <KpiTile kpi={{ label: 'Working hours', value: h(kpis.capacity), pill: null, sub: `Across ${scenario.horizon} days` }} />
          <KpiTile kpi={{ label: 'Meetings', icon: <LockGlyph />, value: h(kpis.meetings), pill: null, sub: 'Recurring, locked' }} />
          <KpiTile kpi={{ label: 'Planned', value: h(kpis.planned), pill: null, sub: 'Task hours on the calendar' }} />
          <KpiTile kpi={{ label: 'Free', value: h(kpis.free), pill: kpis.free < 0 ? { text: 'Over your hours', tone: 'bad' } : null, sub: 'Still available' }} />
          <KpiTile kpi={{ label: 'Not yet planned', value: h(kpis.notPlanned), pill: null, sub: `${kpis.notPlannedCount} task${kpis.notPlannedCount === 1 ? '' : 's'}` }} />
          <KpiTile kpi={{ label: 'Deadlines at risk', value: String(kpis.risks), pill: kpis.risks ? { text: 'Need more hours', tone: 'bad' } : { text: 'All on track', tone: 'good' }, sub: undefined }} />
        </div>

        <div className={p.grid}>
          <ChartCard
            className={p.span12}
            title="Daily load"
            subtitle="Planned hours each day against the hours you set"
            chartType="stacked"
            guide={PLAN_GUIDE.load}
            legend={[{ label: 'Meetings (locked)', color: styleGuide.brand.primaryLight }, ...projects.map(([name, color]) => ({ label: name, color })), { label: 'Your hours', line: true }]}
          >
            <DailyLoad ariaLabel="Daily load" days={view.load.map((d) => ({ label: short(d.day), capacity: d.capacity, meetings: d.meetings, parts: d.parts, total: d.total }))} />
            {view.risks.length || view.over.length ? (
              <div className={p.warn}>
                {view.risks.length > 0 && (
                  <p>
                    <b>
                      {view.risks.length} deadline{view.risks.length > 1 ? 's' : ''} at risk.
                    </b>{' '}
                    Some options:
                  </p>
                )}
                {view.risks.map((x) => (
                  <div key={x.task.id} className={p.fix}>
                    <span>
                      <b>{x.task.name}</b> is {h(x.short)} short before {dayLabel(x.task.due!)}.{' '}
                      {x.day !== null ? `Work ${h(x.short)} extra on ${dayLabel(x.day)} (a ${h(capacityOn(input, scenario, x.day) + x.short)} day).` : 'Ask to move the deadline.'}
                    </span>
                    {x.day !== null && (
                      <button type="button" className={p.small} data-primary onClick={() => actions.addTheHours(x)}>
                        Add the hours
                      </button>
                    )}
                  </div>
                ))}
                {view.over.length > 0 && (
                  <p>
                    <b>Overloaded:</b> {view.over.map((o) => `${dayLabel(o.day)} by ${h(o.by)}`).join(', ')}. Move a chunk to a lighter day or raise that day&rsquo;s hours.
                  </p>
                )}
              </div>
            ) : (
              <p className={charts.insight}>Every deadline in this period is covered within the hours you set.</p>
            )}
          </ChartCard>

          <ChartCard
            className={p.span6}
            title="Where your hours go"
            subtitle={`From the hours you plan to work to what is spare, ${span}`}
            chartType="waterfall"
            guide={PLAN_GUIDE.hoursWaterfall}
            insight={`Meetings take ${h(wf.meetings)} (${Math.round((wf.meetings / Math.max(wf.capacity, 1)) * 100)}%) of your ${h(wf.capacity)}. Tasks due in this period need ${h(wf.due)}, leaving ${wf.spare < 0 ? `${h(-wf.spare)} short` : `${h(wf.spare)} for the ${h(wf.later)} of tasks due later`}.`}
          >
            <ColumnWaterfall
              format={(v) => `${Math.round(v * 10) / 10}h`}
              ariaLabel="Hours waterfall"
              steps={[
                { label: 'Working', kind: 'total', value: wf.capacity, color: 'var(--c-grey)' },
                { label: 'Meetings', kind: 'delta', value: -wf.meetings, color: styleGuide.brand.primary, lock: true },
                { label: 'For tasks', kind: 'sub', color: 'var(--c-primary-light)' },
                { label: 'Tasks due', kind: 'delta', value: -wf.due, color: 'var(--c-primary)' },
                { label: wf.spare < 0 ? 'Short' : 'Spare', kind: 'total', color: wf.spare < 0 ? 'var(--c-bad)' : 'var(--c-primary-dark)' },
              ]}
            />
          </ChartCard>

          <ChartCard
            className={p.span6}
            title="Hours by project"
            subtitle={`Planned hours ${span}, with meetings for comparison`}
            chartType="bars"
            guide={PLAN_GUIDE.byProject}
            insight={`Free after meetings and planned tasks: ${h(kpis.free)}.`}
          >
            <BarRows
              format={h}
              ariaLabel="Hours by project"
              rows={[{ label: 'Meetings', value: kpis.meetings, color: styleGuide.brand.primary, lock: true }, ...view.byProject.map((x) => ({ label: x.project, value: x.hours, color: x.color }))].filter((r) => r.value > 0).sort((a, b) => b.value - a.value)}
            />
          </ChartCard>
        </div>

        <ChartCard title="Week board" subtitle={'Drag tasks from "To plan" onto a day. Use − and + on a chunk to change its hours, and − and + in a day’s header to change how long you work that day.'} chartType="gantt" guide={PLAN_GUIDE.board}>
          <WeekBoard logic={logic} />
        </ChartCard>

        <ChartCard title="Deadline check" subtitle="Hours planned before each deadline against the estimate" chartType="transactions" guide={PLAN_GUIDE.deadlines} state={view.deadlines.length ? undefined : { status: 'empty', text: 'No tasks to plan in this period.' }}>
          <div className={p.tableWrap}>
            <table className={p.table}>
              <thead>
                <tr>
                  <th scope="col">Task</th>
                  <th scope="col">Project</th>
                  <th scope="col" data-num>
                    Estimate
                  </th>
                  <th scope="col" data-num>
                    Planned in time
                  </th>
                  <th scope="col">Deadline</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {view.deadlines.map((r) => (
                  <tr key={r.task.id}>
                    <td>
                      <b>{r.task.name}</b>
                    </td>
                    <td>{r.task.project}</td>
                    <td data-num>
                      {h(r.task.estimate)}
                      {r.task.estimated === false ? <em> (assumed)</em> : null}
                    </td>
                    <td data-num>{h(r.plannedInTime)}</td>
                    <td>{r.task.due === null ? 'None' : dayLabel(r.task.due)}</td>
                    <td>
                      <span className={charts.pill} data-tone={r.status.tone}>
                        {r.status.text}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>

        {confirm === 'calendar' && (
          <Modal title="Send to calendar" onClose={() => setConfirm(null)}>
            <div className={p.dialog}>
              <p className={p.muted}>Each planned chunk becomes a blocked task at the first free time that day. Your meetings and existing tasks stay where they are.</p>
              <ul className={p.changeList}>
                {logic.calendarBlocks.map((b, i) => (
                  <li key={i}>
                    <span>
                      {b.title}, {b.start.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} {b.start.toTimeString().slice(0, 5)} to {b.end.toTimeString().slice(0, 5)}
                    </span>
                  </li>
                ))}
              </ul>
              <div className={p.dialogActions}>
                <button type="button" className={p.button} onClick={() => setConfirm(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className={p.button}
                  data-primary
                  onClick={async () => {
                    setConfirm(null);
                    await logic.sendToCalendar();
                  }}
                >
                  Add {logic.calendarBlocks.length} block{logic.calendarBlocks.length === 1 ? '' : 's'}
                </button>
              </div>
            </div>
          </Modal>
        )}
        {confirm === 'hours' && (
          <Modal title="Save working hours" onClose={() => setConfirm(null)}>
            <div className={p.dialog}>
              <p className={p.muted}>These become your usual hours for each weekday.</p>
              <ul className={p.changeList}>
                {logic.capacityChanges.map(([wd, hours]) => (
                  <li key={wd}>
                    <span>
                      {WEEKDAY[wd]}: {h(hours)}
                    </span>
                  </li>
                ))}
              </ul>
              <div className={p.dialogActions}>
                <button type="button" className={p.button} onClick={() => setConfirm(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className={p.button}
                  data-primary
                  onClick={async () => {
                    setConfirm(null);
                    await logic.saveCapacity();
                  }}
                >
                  Save hours
                </button>
              </div>
            </div>
          </Modal>
        )}
      </GuideProvider>
    </div>
  );
}

// ---- Week board ----

function Draggable({ id, label, children, className, style }: { id: string; label: string; children: React.ReactNode; className: string; style?: React.CSSProperties }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id });
  return (
    <div ref={setNodeRef} className={className} data-dragging={isDragging || undefined} style={{ ...style, ...(transform ? { transform: `translate(${transform.x}px, ${transform.y}px)`, zIndex: 30 } : {}) }}>
      <button type="button" className={p.grip} aria-label={label} {...listeners} {...attributes}>
        <GripVertical size={14} />
      </button>
      {children}
    </div>
  );
}

function Drop({ id, className, children }: { id: string; className: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={className} data-over={isOver || undefined}>
      {children}
    </div>
  );
}

function WeekBoard({ logic }: { logic: TimePlanLogic }) {
  const { input, scenario, view, actions } = logic;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor));
  const taskById = new Map<string, PlanTask>(input.tasks.map((t) => [t.id, t]));
  const onEnd = (e: DragEndEvent) => {
    if (!e.over) return;
    const src = String(e.active.id);
    const target = String(e.over.id);
    if (target === 'tray') {
      if (src.startsWith('alloc:')) actions.removeChunk(src.slice(6));
      return;
    }
    const day = Number(target.slice(4));
    if (src.startsWith('task:')) actions.planTaskOn(src.slice(5), day);
    else if (src.startsWith('alloc:')) actions.moveChunk(src.slice(6), day);
  };
  return (
    <DndContext sensors={sensors} onDragEnd={onEnd} autoScroll>
      <Drop id="tray" className={p.tray}>
        <div className={p.dayHead}>
          <b>To plan</b>
        </div>
        <div className={p.trayList}>
          {view.toPlan.length ? (
            view.toPlan.map(({ task: t, rest }) => (
              <Draggable key={t.id} id={`task:${t.id}`} label={`Drag ${t.name} onto a day`} className={p.task} style={{ borderLeftColor: t.color }}>
                <span className={p.cardName}>{t.name}</span>
                <b>{h(rest)}</b>
                <span className={p.cardMeta}>
                  {t.project} · {t.due === null ? 'No deadline' : `Due ${dayLabel(t.due)}`}{' '}
                  <span className={p.tag} data-p={t.priority}>
                    {t.priority}
                  </span>
                  <label className={p.srOnly} htmlFor={`pl-${t.id}`}>
                    Plan {t.name} on
                  </label>
                  <select id={`pl-${t.id}`} className={p.moveSelect} value="" onChange={(e) => e.target.value && actions.planTaskOn(t.id, Number(e.target.value))}>
                    <option value="">Plan on…</option>
                    {view.days.map((d) => (
                      <option key={d} value={d}>
                        {dayLabel(d)}
                      </option>
                    ))}
                  </select>
                </span>
              </Draggable>
            ))
          ) : (
            <p className={p.muted}>Everything is planned.</p>
          )}
        </div>
      </Drop>
      <div className={p.days}>
        {view.days.map((d) => {
          const cap = capacityOn(input, scenario, d);
          const free = freeOn(input, scenario, d);
          const meet = meetingHours(input, d);
          const used = cap - free;
          const chunks = scenario.allocations.filter((a) => a.day === d);
          const booked = input.booked.filter((b) => b.day === d);
          const base = Math.max(cap, 0.5);
          return (
            <Drop key={d} id={`day:${d}`} className={p.day}>
              <div className={p.dayHead}>
                <b>{short(d)}</b>
                <span className={p.stepper}>
                  <button type="button" aria-label={`Fewer hours on ${dayLabel(d)}`} onClick={() => actions.setCapacity(d, cap - 0.5)}>
                    <Minus size={12} />
                  </button>
                  {h(cap)}
                  <button type="button" aria-label={`More hours on ${dayLabel(d)}`} onClick={() => actions.setCapacity(d, cap + 0.5)}>
                    <Plus size={12} />
                  </button>
                </span>
              </div>
              <div className={p.meter} role="img" aria-label={`${h(used)} of ${h(cap)} used`}>
                <i style={{ width: `${Math.min(100, (meet / base) * 100)}%`, background: styleGuide.brand.primaryLight }} />
                <i style={{ width: `${Math.max(0, Math.min(100 - (meet / base) * 100, ((used - meet) / base) * 100))}%`, background: 'var(--c-primary)' }} />
              </div>
              <span className={p.muted}>{free < -0.01 ? <b data-bad>{h(-free)} over</b> : `${h(free)} free`}</span>
              {meetingsOn(input, d).map((m) => (
                <div key={m.id} className={p.meeting}>
                  <LockGlyph />
                  <span>
                    {m.time} {m.name}
                  </span>
                  <b>{h(m.hours)}</b>
                </div>
              ))}
              {booked.map((b) => (
                <div key={b.id} className={p.meeting} data-booked>
                  <span>
                    {b.time} {b.name}
                  </span>
                  <b>{h(b.hours)}</b>
                </div>
              ))}
              {chunks.map((a) => {
                const t = taskById.get(a.taskId);
                if (!t) return null;
                const late = t.due !== null && d > t.due;
                return (
                  <Draggable key={a.id} id={`alloc:${a.id}`} label={`Drag ${t.name} to another day`} className={p.chunk} style={{ borderLeftColor: t.color }}>
                    <span className={p.cardName}>
                      {t.name}
                      {late && (
                        <span className={p.tag} data-p="late">
                          after deadline
                        </span>
                      )}
                    </span>
                    <span className={p.stepper}>
                      <button type="button" aria-label={`Less time on ${t.name}`} onClick={() => actions.changeChunk(a.id, -0.5)}>
                        <Minus size={12} />
                      </button>
                      {h(a.hours)}
                      <button type="button" aria-label={`More time on ${t.name}`} onClick={() => actions.changeChunk(a.id, 0.5)}>
                        <Plus size={12} />
                      </button>
                    </span>
                  </Draggable>
                );
              })}
              {!chunks.length && !meet && !booked.length && <p className={p.muted}>{cap ? 'Free day' : 'Day off'}</p>}
            </Drop>
          );
        })}
      </div>
    </DndContext>
  );
}
