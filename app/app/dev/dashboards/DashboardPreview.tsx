'use client';

// Development only: renders the Money or Time dashboard on sample data
// (?web=1&d=money|time&period=day|week|month|quarter|year|all).

import { useMemo, useState } from 'react';
import '@/src/styles/base/globals.css';
import { buildPeriod, periodChoices, type DashKind } from '@/src/shared/dashboard/period';
import { cardsIn, MONEY_LAYOUT, TIME_LAYOUT } from '@/src/shared/dashboard/layouts';
import { FIXTURE_NOW, moneyFixture, timeFixture } from '@/src/viewmodels/dashboard/fixtures';
import { moneyDashboard } from '@/src/viewmodels/dashboard/money';
import { timeDashboard } from '@/src/viewmodels/dashboard/time';
import { DashboardPage } from '@/src/widgets/Dashboard/DashboardPage';
import { MoneyCardView, MoneyHeroCard } from '@/src/widgets/Dashboard/MoneyCards';
import { TimeCardView, TimeHeroCard } from '@/src/widgets/Dashboard/TimeCards';

export function DashboardPreview({ which, initial, web }: { which: 'money' | 'time'; initial?: string; web?: boolean }) {
  const [kind, setKind] = useState<DashKind>(() => (initial as DashKind) || (which === 'money' ? 'month' : 'week'));
  const money = useMemo(() => moneyFixture(), []);
  const time = useMemo(() => timeFixture(), []);
  const period = useMemo(() => buildPeriod(kind, FIXTURE_NOW, FIXTURE_NOW, new Date(2024, 8, 1)), [kind]);
  if (which === 'money') {
    const layout = MONEY_LAYOUT[kind];
    const dash = moneyDashboard(money, period, cardsIn(layout));
    return (
      <DashboardPage web={web} dashboard="money" period={period} kind={kind} setKind={setKind} choices={periodChoices(kind, FIXTURE_NOW, new Date(2024, 8, 1))} choose={() => undefined} hero={<MoneyHeroCard hero={dash.hero} />} kpis={dash.kpis} layout={layout} loading={false}
        renderCard={(id) => <MoneyCardView key={`${id}-${kind}`} card={dash.cards[id as keyof typeof dash.cards]} loading={false} />} />
    );
  }
  const layout = TIME_LAYOUT[kind];
  const dash = timeDashboard(time, period, cardsIn(layout));
  return (
    <DashboardPage web={web} dashboard="time" period={period} kind={kind} setKind={setKind} choices={periodChoices(kind, FIXTURE_NOW, new Date(2024, 8, 1))} choose={() => undefined} hero={<TimeHeroCard hero={dash.hero} />} kpis={dash.kpis} layout={layout} loading={false}
      renderCard={(id) => <TimeCardView key={`${id}-${kind}`} card={dash.cards[id as keyof typeof dash.cards]} loading={false} />} />
  );
}
