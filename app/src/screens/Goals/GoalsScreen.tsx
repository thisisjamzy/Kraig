'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, ListOrdered, Trash2 } from 'lucide-react';
import { useLogic } from '@/src/logic/goals/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { GaugeChart, type GaugeSegment } from '@/src/widgets/GaugeChart/GaugeChart';
import { ConfirmDialog } from '@/src/widgets/ConfirmDialog/ConfirmDialog';
import { ActionMenu } from '@/src/widgets/ActionMenu/ActionMenu';
import styles from './GoalsScreen.module.css';

export function formatAmount(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

type GaugeMode = 'necessity' | 'priority';

export function GoalsScreen() {
  const router = useRouter();
  const strings = useStrings();
  const { currency, goals, necessityBreakdown, priorityBreakdown, archiveGoal, loading, lineItemsLoading, error } =
    useLogic();

  const [confirmGoalId, setConfirmGoalId] = useState<string | null>(null);
  const [gaugeMode, setGaugeMode] = useState<GaugeMode>('necessity');

  const hasAnyItems = necessityBreakdown.mustHaveCount + necessityBreakdown.niceToHaveCount > 0;

  const necessitySegments: GaugeSegment[] = [
    { label: 'Must have', value: necessityBreakdown.mustHaveCount, color: 'var(--color-brand)' },
    { label: 'Nice to have', value: necessityBreakdown.niceToHaveCount, color: '#e8a33d' },
  ];
  const prioritySegments: GaugeSegment[] = [
    { label: 'High', value: priorityBreakdown.highCount, color: 'var(--color-danger)' },
    { label: 'Medium', value: priorityBreakdown.mediumCount, color: '#e8a33d' },
    { label: 'Low', value: priorityBreakdown.lowCount, color: 'var(--color-brand)' },
  ];
  const segments = gaugeMode === 'necessity' ? necessitySegments : prioritySegments;
  const segmentsTotal = segments.reduce((sum, segment) => sum + segment.value, 0);
  const centerValue =
    gaugeMode === 'necessity'
      ? `${formatAmount(necessityBreakdown.mustHaveAmountRemaining)} ${currency}`
      : `${formatAmount(priorityBreakdown.highAmountRemaining)} ${currency}`;
  const centerLabel = gaugeMode === 'necessity' ? 'needed for must-haves' : 'needed for high priority';

  return (
    <div className={styles.page}>
      <ScreenState loading={loading} error={error} />

      {!loading && !error && (
        <>
          {!lineItemsLoading && hasAnyItems && (
            <div className={styles.gaugeCard}>
              <div className={styles.gaugeModeRow}>
                <button
                  type="button"
                  className={`${styles.gaugeModeChip} ${gaugeMode === 'necessity' ? styles.gaugeModeChipActive : ''}`}
                  onClick={() => setGaugeMode('necessity')}
                >
                  By need
                </button>
                <button
                  type="button"
                  className={`${styles.gaugeModeChip} ${gaugeMode === 'priority' ? styles.gaugeModeChipActive : ''}`}
                  onClick={() => setGaugeMode('priority')}
                >
                  By priority
                </button>
              </div>

              <GaugeChart segments={segments} centerValue={centerValue} centerLabel={centerLabel} />

              <div className={styles.gaugeLegend}>
                {segments.map((segment) => (
                  <span key={segment.label} className={styles.gaugeLegendItem}>
                    <span className={styles.gaugeLegendDot} style={{ background: segment.color }} />
                    {segment.label} &bull; {Math.round((segment.value / Math.max(1, segmentsTotal)) * 100)}%
                  </span>
                ))}
              </div>

              <div className={styles.gaugeActions}>
                <button
                  type="button"
                  className={styles.gaugeActionPrimary}
                  onClick={() => router.push('/goals/new')}
                >
                  <Plus size={16} strokeWidth={2.25} />
                  {strings.goals.addGoal}
                </button>
                <button
                  type="button"
                  className={styles.gaugeActionSecondary}
                  onClick={() => router.push('/goals/items')}
                >
                  <ListOrdered size={16} strokeWidth={2.25} />
                  See all, ranked
                </button>
              </div>
            </div>
          )}

          {goals.length === 0 ? (
            <p className={styles.emptyText}>{strings.goals.emptyGoals}</p>
          ) : (
            <div className={styles.list}>
              {goals.map((goal) => (
                <div
                  key={goal.id}
                  role="button"
                  tabIndex={0}
                  className={styles.card}
                  onClick={() => router.push(`/goals/${goal.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      router.push(`/goals/${goal.id}`);
                    }
                  }}
                >
                  <div className={styles.cardHeaderRow}>
                    <div className={styles.cardText}>
                      <p className={styles.cardName}>{goal.name}</p>
                      <p className={styles.cardCategory}>
                        {goal.completedLineItemCount}/{goal.lineItemCount} {strings.goals.itemsDone}
                      </p>
                    </div>
                    <span onClick={(event) => event.stopPropagation()}>
                      <ActionMenu
                        title={goal.name}
                        ariaLabel={`Actions for ${goal.name}`}
                        items={[
                          {
                            key: 'archive',
                            label: strings.goals.archiveAction,
                            icon: <Trash2 size={16} strokeWidth={1.75} />,
                            onSelect: () => setConfirmGoalId(goal.id),
                            danger: true,
                          },
                        ]}
                      />
                    </span>
                  </div>
                  <div className={styles.track}>
                    <div className={styles.fill} style={{ width: `${goal.percent}%` }} />
                  </div>
                  <div className={styles.amountRow}>
                    <span className={styles.amountValue}>
                      {formatAmount(goal.completed)} {currency}
                    </span>
                    <span className={styles.amountMuted}>
                      {strings.goals.completedOfSuffix} {formatAmount(goal.total)} {currency} &bull; {goal.percent}%
                    </span>
                  </div>
                  {goal.deadline && (
                    <div className={styles.metaRow}>
                      <span>
                        {strings.goals.deadlinePrefix}{' '}
                        {goal.deadline.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <button type="button" className={styles.addButton} onClick={() => router.push('/goals/new')}>
            <Plus size={18} strokeWidth={2.25} />
            {strings.goals.addGoal}
          </button>
        </>
      )}

      {confirmGoalId && (
        <ConfirmDialog
          title={strings.goals.archiveGoalConfirmTitle}
          message={strings.goals.archiveGoalConfirmMessage}
          confirmLabel={strings.goals.archiveAction}
          cancelLabel={strings.common.cancel}
          onConfirm={() => {
            archiveGoal(confirmGoalId);
            setConfirmGoalId(null);
          }}
          onCancel={() => setConfirmGoalId(null)}
        />
      )}
    </div>
  );
}
