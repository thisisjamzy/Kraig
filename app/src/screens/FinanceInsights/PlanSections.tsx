'use client';

// Finance Insights: Plan vs actual (spending pace, bucket adherence, plan
// accuracy, overspend log) and Unplanned spending.

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import type { FinanceInsights } from '@/src/logic/financeInsights/useLogic';
import { UNPLANNED_LABELS, type UnplannedKind } from '@/src/viewmodels/finance/classify';
import { externalSourceLabel, reasonLabel } from '@/src/viewmodels/planning';
import { monthName } from '@/src/viewmodels/finance/ranges';
import type { OverspendExternalSource } from '@/src/shared/firestore/types';
import { accuracyTakeaway, bucketsTakeaway, overspendTakeaway, paceTakeaway } from '@/src/viewmodels/finance/insights';
import { AXIS_TICK, COLORS, ChangeChip, Empty, Legend, TooltipBox, compact, full, percent, tappedIndex } from './parts';
import styles from './FinanceInsights.module.css';
import { useFlowLinks } from '@/src/screens/Planning/PlanningParts';

function SubHead({ title, takeaway }: { title: string; takeaway: string }) {
  return (
    <>
      <h3 className={styles.subTitle}>{title}</h3>
      <p className={styles.subTakeaway}>{takeaway}</p>
    </>
  );
}

export function PlanVsActual({ v }: { v: FinanceInsights }) {
  const router = useRouter();
  const c = v.currency;
  const pace = v.pace;
  const over = pace.overBy > 0;
  return (
    <>
      {v.showPace && (
        <div className={styles.block}>
          <SubHead title={`Spending pace · ${monthName(pace.month)}`} takeaway={paceTakeaway(pace, c)} />
          {pace.planned <= 0 && pace.spent <= 0 ? (
            <Empty>Plan this month to see your pace.</Empty>
          ) : (
            <>
              <LineChart responsive style={{ width: '100%', height: 190 }} data={pace.points} margin={{ top: 8, right: 8, bottom: 0, left: -6 }} accessibilityLayer>
                <CartesianGrid vertical={false} stroke="var(--fi-grid)" />
                <XAxis dataKey="day" tick={AXIS_TICK} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={compact} width={44} />
                <Tooltip
                  content={({ active, payload }) => {
                    const p = payload?.[0]?.payload as (typeof pace.points)[number] | undefined;
                    if (!p) return null;
                    return (
                      <TooltipBox
                        active={active}
                        title={`Day ${p.day}`}
                        rows={[
                          ...(p.actual !== null ? [{ label: 'Spent so far', value: full(p.actual, c), color: COLORS.expense }] : []),
                          { label: 'Plan pace', value: full(p.ideal, c), color: COLORS.muted },
                          ...(p.projected !== null ? [{ label: 'Projected', value: full(p.projected, c), color: over ? COLORS.bad : COLORS.income }] : []),
                        ]}
                      />
                    );
                  }}
                />
                <Line dataKey="ideal" name="Plan pace" stroke={COLORS.muted} strokeDasharray="6 4" dot={false} strokeWidth={1.5} />
                <Line dataKey="actual" name="Spent" stroke={COLORS.expense} strokeWidth={2.5} dot={false} connectNulls={false} />
                <Line dataKey="projected" name="Projected" stroke={over ? COLORS.bad : COLORS.income} strokeDasharray="2 4" strokeWidth={2} dot={false} connectNulls={false} />
              </LineChart>
              <Legend
                items={[
                  { label: 'Spent', color: COLORS.expense, style: 'line' },
                  { label: 'Plan pace', color: COLORS.muted, style: 'dashed' },
                  { label: over ? 'Projected (over plan)' : 'Projected', color: over ? COLORS.bad : COLORS.income, style: 'dashed' },
                ]}
              />
            </>
          )}
        </div>
      )}

      <div className={styles.block}>
        <SubHead title="By basket" takeaway={bucketsTakeaway(v.buckets, c)} />
        {v.buckets.length === 0 ? (
          <Empty>No baskets planned for this period.</Empty>
        ) : (
          <ul className={styles.bullets}>
            {v.buckets.map((b) => {
              const scale = Math.max(b.planned, b.actual) || 1;
              const fill = Math.min(b.actual, b.planned) / scale;
              const overflow = Math.max(0, b.actual - b.planned) / scale;
              return (
                <li key={b.bucketId}>
                  <Link href={v.bucketHref(b.bucketId)} className={styles.bullet}>
                    <span className={styles.bulletTop}>
                      <span className={styles.bulletName}>{b.name}</span>
                      <span className={styles.status} data-status={b.status}>
                        {b.status === 'over' ? 'Over' : b.status === 'unused' ? 'Unused' : 'Within plan'}
                      </span>
                    </span>
                    <span className={styles.bulletTrack} aria-hidden>
                      <span className={styles.bulletPlan} style={{ width: `${(b.planned / scale) * 100}%` }} />
                      <span className={styles.bulletFill} style={{ width: `${fill * 100}%` }} />
                      {overflow > 0 && <span className={styles.bulletOver} style={{ left: `${fill * 100}%`, width: `${overflow * 100}%` }} />}
                      <span className={styles.bulletMark} style={{ left: `${(b.planned / scale) * 100}%` }} />
                    </span>
                    <span className={styles.bulletFigures}>
                      {full(b.actual)} / {full(b.planned)} {c}
                      {b.status === 'over' && <strong> · {full(b.actual - b.planned)} over</strong>}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {v.showAccuracy && (
        <div className={styles.block}>
          <SubHead title="Plan accuracy" takeaway={accuracyTakeaway(v.accuracy)} />
          {v.accuracy.every((a) => a.planned === 0) ? (
            <Empty>Plan a few months to see how accurate your plans are.</Empty>
          ) : (
            <>
              <LineChart
                responsive
                style={{ width: '100%', height: 180 }}
                data={v.accuracy.map((a) => ({ ...a, label: monthName(a.month, false) }))}
                margin={{ top: 8, right: 8, bottom: 0, left: -6 }}
                onClick={(state) => {
                  const i = tappedIndex(state);
                  if (i !== null && v.accuracy[i]) router.push(`/budget?month=${v.accuracy[i].month}`);
                }}
                accessibilityLayer
              >
                <CartesianGrid vertical={false} stroke="var(--fi-grid)" />
                <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} />
                <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={compact} width={44} />
                <Tooltip
                  content={({ active, payload }) => {
                    const p = payload?.[0]?.payload as (typeof v.accuracy)[number] | undefined;
                    if (!p) return null;
                    return (
                      <TooltipBox
                        active={active}
                        title={monthName(p.month)}
                        rows={[
                          { label: 'Planned', value: full(p.planned, c), color: COLORS.muted },
                          { label: 'Actual', value: full(p.actual, c), color: COLORS.expense },
                          { label: 'Accuracy', value: percent(p.accuracy) },
                        ]}
                      />
                    );
                  }}
                />
                <Line dataKey="planned" name="Planned" stroke={COLORS.muted} strokeDasharray="6 4" strokeWidth={1.5} dot={{ r: 2 }} />
                <Line dataKey="actual" name="Actual" stroke={COLORS.expense} strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
              <Legend
                items={[
                  { label: 'Planned', color: COLORS.muted, style: 'dashed' },
                  { label: 'Actual', color: COLORS.expense, style: 'line' },
                ]}
              />
              <p className={styles.chips}>
                {v.accuracy
                  .filter((a) => a.accuracy !== null)
                  .map((a) => (
                    <span key={a.month} className={styles.miniChip}>
                      {monthName(a.month, false)} {percent(a.accuracy)}
                    </span>
                  ))}
              </p>
            </>
          )}
        </div>
      )}

      <div className={styles.block}>
        <SubHead title="Overspend log" takeaway={overspendTakeaway(v.log, c)} />
        {v.log.count === 0 ? (
          <Empty>No overspends were settled in this period.</Empty>
        ) : (
          <>
            <div className={styles.split} role="img" aria-label={`${v.log.conscious.count} handled at the time, ${v.log.later.count} discovered later`}>
              <span style={{ flex: v.log.conscious.count || 0.0001 }} data-tone="good">
                {v.log.conscious.count} at the time
              </span>
              <span style={{ flex: v.log.later.count || 0.0001 }} data-tone="amber">
                {v.log.later.count} found later
              </span>
            </div>
            <div className={styles.twoCol}>
              <div>
                <p className={styles.listTitle}>Top reasons</p>
                <RankList rows={v.log.reasons.map((r) => ({ label: reasonLabel(r.reason), amount: r.amount, extra: `${r.count}×` }))} currency={c} />
              </div>
              <div>
                <p className={styles.listTitle}>How they were covered</p>
                <RankList
                  rows={v.log.coveredBy.map((x) => ({
                    label: x.source === 'other_budgets' ? 'Other budgets' : x.source === 'uncovered' ? 'Not covered yet' : externalSourceLabel(x.source as OverspendExternalSource),
                    amount: x.amount,
                    tone: x.source === 'uncovered' ? 'bad' : undefined,
                  }))}
                  currency={c}
                />
              </div>
            </div>
            <p className={styles.note}>Avoidable or partly avoidable: {full(v.log.avoidable, c)}</p>
          </>
        )}
      </div>
    </>
  );
}

export function RankList({
  rows,
  currency,
  href,
}: {
  rows: { label: string; amount: number; extra?: string; tone?: 'bad'; key?: string }[];
  currency: string;
  href?: (row: { label: string; key?: string }) => string;
}) {
  if (!rows.length) return <p className={styles.muted}>Nothing yet.</p>;
  const max = Math.max(...rows.map((r) => r.amount)) || 1;
  return (
    <ol className={styles.rank}>
      {rows.map((r) => {
        const body = (
          <>
            <span className={styles.rankTop}>
              <span className={styles.rankLabel}>{r.label}</span>
              <span className={styles.rankAmount} data-tone={r.tone}>
                {full(r.amount, currency)}
                {r.extra && <small> · {r.extra}</small>}
              </span>
            </span>
            <span className={styles.rankBar} aria-hidden>
              <span style={{ width: `${(r.amount / max) * 100}%` }} data-tone={r.tone} />
            </span>
          </>
        );
        return <li key={r.key ?? r.label}>{href ? <Link href={href(r)} className={styles.rankLink}>{body}</Link> : body}</li>;
      })}
    </ol>
  );
}

export function UnplannedSection({ v }: { v: FinanceInsights }) {
  const { coverHref } = useFlowLinks();
  const router = useRouter();
  const u = v.unplanned;
  const c = v.currency;
  const [kind, setKind] = useState<UnplannedKind | null>(null);
  const rows = v.flow.map((p) => ({ label: p.label, planned: p.planned, unplanned: p.unplanned, start: p.start }));
  const largest = kind ? u.largest.filter((x) => x.kind === kind) : u.largest;
  if (v.totals.expense <= 0) return <Empty />;
  return (
    <>
      <div className={styles.bigFigure}>
        <strong data-tone={u.total > 0 ? 'bad' : undefined}>{full(u.total, c)}</strong>
        <span>{percent(u.share)} of expenses</span>
        <ChangeChip value={v.changes.unplanned} goodWhen="down" />
      </div>
      <BarChart
        responsive
        style={{ width: '100%', height: 170 }}
        data={rows}
        margin={{ top: 8, right: 4, bottom: 0, left: -6 }}
        onClick={(state) => {
          const i = tappedIndex(state);
          if (i !== null && rows[i]) router.push(v.historyHref());
        }}
        accessibilityLayer
      >
        <CartesianGrid vertical={false} stroke="var(--fi-grid)" />
        <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={compact} width={44} />
        <ReferenceLine y={0} stroke="var(--fi-light)" />
        <Tooltip
          content={({ active, payload }) => {
            const p = payload?.[0]?.payload as (typeof rows)[number] | undefined;
            if (!p) return null;
            return (
              <TooltipBox
                active={active}
                title={p.start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                rows={[
                  { label: 'Planned', value: full(p.planned, c), color: COLORS.expense },
                  { label: 'Unplanned', value: full(p.unplanned, c), color: COLORS.bad },
                ]}
              />
            );
          }}
        />
        <Bar dataKey="planned" stackId="s" name="Planned" fill={COLORS.expense} />
        <Bar dataKey="unplanned" stackId="s" name="Unplanned" fill={COLORS.bad} radius={[4, 4, 0, 0]} />
      </BarChart>
      <Legend
        items={[
          { label: 'Planned', color: COLORS.expense },
          { label: 'Unplanned', color: COLORS.bad },
        ]}
      />

      <div className={styles.kindChips} role="group" aria-label="Filter by kind">
        {(Object.keys(u.byKind) as UnplannedKind[]).map((k) => (
          <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(kind === k ? null : k)}>
            <span>{UNPLANNED_LABELS[k]}</span>
            <strong>{full(u.byKind[k])}</strong>
          </button>
        ))}
      </div>

      <div className={styles.twoCol}>
        <div>
          <p className={styles.listTitle}>Top unplanned categories</p>
          <RankList rows={u.categories.map((s) => ({ label: s.label, amount: s.amount, key: s.key, tone: 'bad' as const }))} currency={c} href={(r) => (r.key && r.key !== 'none' ? v.historyHref(`&category=${r.key}`) : v.historyHref())} />
        </div>
        <div>
          <p className={styles.listTitle}>Top unplanned payees</p>
          <RankList rows={u.payees.map((s) => ({ label: s.label, amount: s.amount, key: s.key, tone: 'bad' as const }))} currency={c} />
        </div>
      </div>

      <p className={styles.listTitle}>Largest unplanned {kind ? `· ${UNPLANNED_LABELS[kind].toLowerCase()}` : ''}</p>
      {largest.length === 0 ? (
        <p className={styles.muted}>Nothing unplanned here.</p>
      ) : (
        <ul className={styles.txList}>
          {largest.map(({ tx, amount, kind: k }) => (
            <li key={tx.id} className={styles.txRow}>
              <Link href={`/transactions/${tx.id}`} className={styles.txMain}>
                <span className={styles.txName}>{tx.payee || tx.categoryName}</span>
                <span className={styles.txMeta}>
                  {tx.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · {tx.categoryName}
                </span>
              </Link>
              <span className={styles.txSide}>
                <strong>{full(amount, c)}</strong>
                <span className={styles.kindTag} data-kind={k}>
                  {UNPLANNED_LABELS[k]}
                </span>
                {k === 'no_budget' && (
                  <Link href={`/transactions/${tx.id}`} className={styles.inlineAction}>
                    Assign to budget
                  </Link>
                )}
                {k === 'over_plan' && tx.link && (
                  <Link href={coverHref(tx.link.month, tx.link.bucketId, tx.link.itemId)} className={styles.inlineAction}>
                    Justify
                  </Link>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {u.notes.length > 0 && (
        <ul className={styles.notes}>
          {u.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </>
  );
}
