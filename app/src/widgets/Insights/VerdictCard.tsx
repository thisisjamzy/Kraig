'use client';

// Insights level one, first card (Dreda.figcraft `Insights / Web`, verdict):
// the period, one sentence naming the net position, the explanation, then
// four figures. Untracked reads in the danger foreground. Data comes from
// src/viewmodels/dashboard/verdict.ts.

import { amount } from '@/src/shared/dashboard/format';
import type { MoneyVerdict } from '@/src/viewmodels/dashboard/verdict';
import s from './Insights.module.css';

export function VerdictCard({ verdict, loading }: { verdict: MoneyVerdict; loading?: boolean }) {
  const { figures } = verdict;
  const kept = figures.keptRate === null ? '–' : `${(figures.keptRate * 100).toFixed(1).replace(/\.0$/, '').replace('-', '−')}%`;
  const stats = [
    { label: 'Income', value: amount(figures.income) },
    { label: 'Spending', value: amount(figures.spending) },
    { label: 'Kept', value: kept },
    { label: 'Untracked', value: amount(figures.untracked), danger: figures.untracked > 0.5 },
  ];
  return (
    <section className={s.verdict} aria-label="Where you stand" aria-busy={loading || undefined}>
      <p className={s.overline}>{verdict.range}</p>
      <h2 className={s.statement}>{loading ? '…' : verdict.headline}</h2>
      {!loading && <p className={s.explanation}>{verdict.explanation}</p>}
      <dl className={s.stats}>
        {stats.map((x) => (
          <div key={x.label} className={s.stat}>
            <dt className={s.overline}>{x.label}</dt>
            <dd className={s.value} data-danger={x.danger || undefined}>
              {loading ? '…' : x.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
