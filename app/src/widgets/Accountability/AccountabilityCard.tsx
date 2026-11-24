'use client';

// Accountability (owner, 23 Nov 2026): how much of each month's (or week's)
// spending you can account for. The full card sits on Insights: the
// unaccounted amount as bars for the last six months (or eight weeks), the
// accountability rate under each, and one sentence. The Dashboard has its
// own compact version (widgets/MoneyHome AccountabilityMini).

import { useState } from 'react';
import { compact } from '@/src/shared/dashboard/format';
import { useAccountability } from '@/src/shared/hooks/useAccountability';
import { accountabilitySentence, rateText, type Period, type PeriodAccountability } from '@/src/viewmodels/accountability';
import { ChartCard } from '@/src/widgets/Charts/ChartCard';
import { ColumnChart } from '@/src/widgets/Charts/Columns';
import charts from '@/src/widgets/Charts/Charts.module.css';

const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function shortLabel(r: PeriodAccountability, period: Period): string {
  const [, m, d] = r.key.split('-').map(Number);
  return period === 'month' ? SHORT[m - 1] : `${d} ${SHORT[m - 1]}`;
}

export function AccountabilityCard() {
  const [period, setPeriod] = useState<Period>('month');
  const { rows, loading } = useAccountability({ period, count: period === 'month' ? 6 : 8 });
  const sentence = accountabilitySentence(rows);
  const any = rows.some((r) => r.outflow > 0 || r.unaccounted > 0);
  return (
    <ChartCard
      title="Accountability"
      subtitle={period === 'month' ? 'Money unaccounted for each month, and the share of spending you can explain' : 'Money unaccounted for each week, and the share of spending you can explain'}
      chartType="column"
      guide={{
        title: 'How to read this',
        text: 'Each bar is the money your balance checks found missing in that period, less what you have since explained (an entry explained later counts back to the month it happened). The figure under it is the share of that period’s spending you can account for. A new month starts at zero.',
      }}
      tools={
        <span className={charts.scale} role="group" aria-label="Period">
          <button type="button" aria-pressed={period === 'month'} onClick={() => setPeriod('month')}>
            Month
          </button>
          <button type="button" aria-pressed={period === 'week'} onClick={() => setPeriod('week')}>
            Week
          </button>
        </span>
      }
      legend={[{ label: 'Unaccounted for', color: 'var(--color-data-negative)' }]}
      insight={any ? sentence : null}
      state={loading ? { status: 'loading' } : any ? { status: 'ready' } : { status: 'empty', text: 'No spending or balance checks in this period yet.' }}
    >
      <ColumnChart
        data={rows.map((r) => ({ label: shortLabel(r, period), value: r.unaccounted, color: 'var(--color-data-negative)' }))}
        sub={rows.map((r) => ({ text: rateText(r.rate), tone: r.rate === null ? undefined : r.rate >= 0.9 ? 'good' : r.rate < 0.75 ? 'bad' : undefined }))}
        mode="linear"
        format={compact}
        tick={compact}
        ariaLabel={`Unaccounted money per ${period}. ${sentence}`}
      />
    </ChartCard>
  );
}
