'use client';

// Area and reschedule stats, under Insights: a Notion page. Properties:
// Completed, Overdue, Due today, Rescheduled. Chart blocks in the
// staggered grid: completed per week (from the first week with data),
// projects and completion per area, and on time against rescheduled.
// A donut only for up to 3 slices; more read as horizontal bars. Axis and
// legend text 12px or more.

import Link from 'next/link';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartNoAxesCombined } from 'lucide-react';
import { useLogic } from '@/src/logic/projectAnalytics/useLogic';
import { DonutChart, type DonutSegment } from '@/src/widgets/DonutChart/DonutChart';
import { ChartBlock } from '@/src/widgets/Database/ChartBlock';
import { MasonryGrid } from '@/src/widgets/Database/MasonryGrid';
import { NotionPage } from '@/src/widgets/Database/NotionPage';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import styles from './ProjectAnalyticsScreen.module.css';

function Shares({ segments }: { segments: DonutSegment[] }) {
  if (segments.length <= 3) return <DonutChart segments={segments} legendPosition="bottom" />;
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <ul className={styles.bars}>
      {[...segments]
        .sort((a, b) => b.value - a.value)
        .map((x) => (
          <li key={x.label}>
            <span className={styles.barLabel}>{x.label}</span>
            <span className={styles.barTrack}>
              <span style={{ width: `${(x.value / total) * 100}%`, background: x.color }} />
            </span>
            <span className={styles.barValue}>{x.value}</span>
          </li>
        ))}
    </ul>
  );
}

export function ProjectAnalyticsScreen() {
  const { overdue, today, completedTotal, completedTrend, taskReschedule, projectReschedule, projectsPerAreaSegments, completionPerArea, rescheduledByAreaSegments, loading } = useLogic();
  const first = completedTrend.findIndex((p) => p.value > 0);
  const weeks = first < 0 ? [] : completedTrend.slice(first);

  const items = [
    {
      id: 'weekly',
      span: 2 as const,
      node: (
        <ChartBlock id="weekly" title="Completed per week" summary={weeks.length ? `${weeks[weeks.length - 1].value} completed in the latest week.` : null} empty={weeks.length ? null : 'Complete a few tasks to see this.'}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={weeks} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="#edf0f6" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12 }} width={32} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" name="Completed" fill="#3965fa" />
            </BarChart>
          </ResponsiveContainer>
        </ChartBlock>
      ),
    },
    {
      id: 'areas',
      node: (
        <ChartBlock id="areas" title="Ongoing projects per area" empty={projectsPerAreaSegments.length ? null : 'No ongoing projects.'}>
          <Shares segments={projectsPerAreaSegments} />
        </ChartBlock>
      ),
    },
    {
      id: 'completion',
      node: (
        <ChartBlock id="completion" title="Task completion per area" empty={completionPerArea.length ? null : 'No tasks in areas yet.'}>
          <ul className={styles.bars}>
            {completionPerArea.map((a) => (
              <li key={a.areaName}>
                <span className={styles.barLabel}>{a.areaName}</span>
                <span className={styles.barTrack}>
                  <span style={{ width: `${a.percent}%` }} />
                </span>
                <span className={styles.barValue}>{a.percent}%</span>
              </li>
            ))}
          </ul>
        </ChartBlock>
      ),
    },
    {
      id: 'projectsOnTime',
      node: (
        <ChartBlock id="projectsOnTime" title="Finished projects: on time vs rescheduled" empty={projectReschedule.onTime + projectReschedule.rescheduled ? null : 'No finished projects yet.'}>
          <Shares
            segments={[
              { label: 'On time', value: projectReschedule.onTime, color: '#3965fa' },
              { label: 'Rescheduled', value: projectReschedule.rescheduled, color: '#cb912f' },
            ]}
          />
        </ChartBlock>
      ),
    },
    {
      id: 'tasksOnTime',
      node: (
        <ChartBlock id="tasksOnTime" title="Finished tasks: on time vs rescheduled" empty={taskReschedule.onTime + taskReschedule.rescheduled ? null : 'No finished tasks yet.'}>
          <Shares
            segments={[
              { label: 'On time', value: taskReschedule.onTime, color: '#3965fa' },
              { label: 'Rescheduled', value: taskReschedule.rescheduled, color: '#cb912f' },
            ]}
          />
        </ChartBlock>
      ),
    },
    {
      id: 'rescheduledAreas',
      node: (
        <ChartBlock id="rescheduledAreas" title="Rescheduled projects by area" empty={rescheduledByAreaSegments.length ? null : 'No rescheduled projects.'}>
          <Shares segments={rescheduledByAreaSegments} />
        </ChartBlock>
      ),
    },
  ];

  return (
    <NotionPage
      title="Area and reschedule stats"
      icon={<ChartNoAxesCombined strokeWidth={1.75} />}
      crumbs={[
        { label: 'Time', href: '/projects' },
        { label: 'Insights', href: '/projects/insights' },
        { label: 'Area and reschedule stats', href: '/projects/analytics' },
      ]}
      properties={[
        { id: 'completed', label: 'Completed', tone: 'good', display: String(completedTotal) },
        { id: 'overdue', label: 'Overdue', tone: overdue.length ? 'bad' : 'neutral', display: overdue.length ? <Link href="/projects/focus?view=overdue">{overdue.length}</Link> : '0' },
        { id: 'today', label: 'Due today', tone: 'in', display: String(today.length) },
        { id: 'rescheduled', label: 'Rescheduled', tone: taskReschedule.rescheduled ? 'watch' : 'neutral', display: String(taskReschedule.rescheduled) },
      ]}
    >
      {loading ? <ScreenState loading /> : <MasonryGrid label="Stats" items={items} />}
    </NotionPage>
  );
}
