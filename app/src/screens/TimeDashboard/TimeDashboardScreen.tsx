'use client';

// The Time dashboard (web and tablet). One responsive page for every width
// (src/widgets/Dashboard): the layout, charts and figures are shared.

import { useTimeDashboard } from '@/src/logic/dashboard/useTimeDashboard';
import { DashboardPage } from '@/src/widgets/Dashboard/DashboardPage';
import { TimeCardView, TimeHeroCard } from '@/src/widgets/Dashboard/TimeCards';

export function TimeDashboardScreen() {
  const v = useTimeDashboard();
  return (
    <DashboardPage
      dashboard="time"
      period={v.period}
      kind={v.kind}
      setKind={v.setKind}
      choices={v.choices}
      choose={v.choose}
      // Under the web top bar (TopBar.module.css: 44 px plus the safe area).
      stickyTop="calc(44px + var(--safe-top))"
      web
      hero={<TimeHeroCard hero={v.dash.hero} />}
      kpis={v.dash.kpis}
      layout={v.layout}
      renderCard={(id) => <TimeCardView key={`${id}-${v.kind}`} card={v.dash.cards[id as keyof typeof v.dash.cards]} loading={v.loading} />}
      loading={v.loading}
    />
  );
}
