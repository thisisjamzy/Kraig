// Time Insights' "Needs attention" callout: the alerts grouped into one
// line each, most severe first ("21 overdue tasks, 19 in Do first",
// "7 projects at risk: nothing done lately", "Setup New Library has 1 day
// of slack", "Do first work is 100% of your scheduled time"). A group of
// projects or habits expands to list them with links. Pure, tested in
// test/timePages.test.ts. No long dashes.

import type { InsightAlert, Severity } from './alerts';
import type { ProjectStat } from './metrics';

export interface AttentionLine {
  id: string;
  severity: Severity;
  text: string;
  href: string | null;
  items: { label: string; href: string }[];
}

const RANK: Record<Severity, number> = { red: 0, amber: 1, green: 2 };

export function attentionLines(alerts: InsightAlert[], projects: ProjectStat[], overdue: { total: number; doFirst: number }): AttentionLine[] {
  const lines: AttentionLine[] = [];
  if (alerts.length === 1 && alerts[0].kind === 'clear') return [];

  if (overdue.total > 0) {
    lines.push({
      id: 'overdue',
      severity: overdue.doFirst > 0 || overdue.total > 5 ? 'red' : 'amber',
      text: `${overdue.total} overdue ${overdue.total === 1 ? 'task' : 'tasks'}${overdue.doFirst ? `, ${overdue.doFirst === overdue.total ? (overdue.total === 1 ? 'in Do first' : 'all in Do first') : `${overdue.doFirst} in Do first`}` : ''}`,
      href: '/projects/focus?view=overdue',
      items: [],
    });
  }

  const risky = projects.filter((p) => p.risk === 'at risk' || p.risk === 'overdue');
  if (risky.length) {
    const stalled = risky.filter((p) => p.reasons.some((r) => r.startsWith('Nothing done lately'))).length;
    const late = risky.filter((p) => p.risk === 'overdue').length;
    const why = stalled * 2 >= risky.length ? ': nothing done lately' : late * 2 >= risky.length ? ': past the deadline' : ': behind schedule';
    lines.push({
      id: 'projects',
      severity: 'red',
      text: risky.length === 1 ? `${risky[0].project.name} is at risk${why}` : `${risky.length} projects at risk${why}`,
      href: risky.length === 1 ? `/projects/${risky[0].project.id}` : '/projects/all?view=risk',
      items: risky.length > 1 ? risky.map((p) => ({ label: p.project.name, href: `/projects/${p.project.id}` })) : [],
    });
  }

  // Watched projects with little slack: one line each, up to two, else grouped.
  const tight = projects.filter((p) => p.risk === 'watch' && p.slackDays !== null && p.slackDays >= 0);
  if (tight.length > 2) {
    lines.push({
      id: 'slack',
      severity: 'amber',
      text: `${tight.length} projects have little slack left`,
      href: null,
      items: tight.map((p) => ({ label: `${p.project.name}: ${p.slackDays} ${p.slackDays === 1 ? 'day' : 'days'}`, href: `/projects/${p.project.id}` })),
    });
  } else {
    for (const p of tight) {
      lines.push({ id: `slack-${p.project.id}`, severity: 'amber', text: `${p.project.name} has ${p.slackDays} ${p.slackDays === 1 ? 'day' : 'days'} of slack`, href: `/projects/${p.project.id}`, items: [] });
    }
  }

  for (const a of alerts) {
    if (a.kind === 'day') lines.push({ id: a.id, severity: a.severity, text: a.headline, href: a.href, items: [] });
  }

  const slipping = alerts.filter((a) => a.id.startsWith('habit-'));
  if (slipping.length === 1) lines.push({ id: slipping[0].id, severity: 'amber', text: `${slipping[0].headline}: ${slipping[0].detail.toLowerCase()}`, href: slipping[0].href, items: [] });
  else if (slipping.length > 1)
    lines.push({
      id: 'habits',
      severity: 'amber',
      text: `${slipping.length} recurring tasks are slipping`,
      href: null,
      items: slipping.map((a) => ({ label: a.headline.replace(/ is slipping$/, ''), href: a.href })),
    });

  for (const id of ['firefighting', 'eliminate', 'reschedule', 'streak']) {
    const a = alerts.find((x) => x.id === id);
    if (a) lines.push({ id, severity: a.severity, text: a.headline, href: a.href, items: [] });
  }

  return lines.sort((a, b) => RANK[a.severity] - RANK[b.severity]);
}
