'use client';

// The Money dashboard (phone: the fixed header sits under the app's own header). One responsive page for every width
// (src/widgets/Dashboard): the layout, charts and figures are shared.

import { useMoneyDashboard } from '@/src/logic/dashboard/useMoneyDashboard';
import { DashboardPage } from '@/src/widgets/Dashboard/DashboardPage';
import { MoneyCardView, MoneyHeroCard } from '@/src/widgets/Dashboard/MoneyCards';

export function MoneyDashboardScreen() {
  const v = useMoneyDashboard();
  return (
    <DashboardPage
      dashboard="money"
      period={v.period}
      kind={v.kind}
      setKind={v.setKind}
      choices={v.choices}
      choose={v.choose}
      stickyTop={'var(--header-height)'}
      hero={<MoneyHeroCard hero={v.dash.hero} />}
      kpis={v.dash.kpis}
      layout={v.layout}
      renderCard={(id) => <MoneyCardView key={`${id}-${v.kind}`} card={v.dash.cards[id as keyof typeof v.dash.cards]} loading={v.loading} />}
      loading={v.loading}
    />
  );
}
