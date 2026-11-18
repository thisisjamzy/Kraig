'use client';

// Planning settings, a full page on web (Dreda v1.0 `Planning settings`
// 65750). Crumb Settings; title Planning; "Each task type gets its own time
// block..."; New task type. Task types: type, time block, average, per
// day, auto (click a row to change it). On the right, Deep work limits and
// Scheduling rules. Kept in this session until BUILD-KIT section 7.2 and
// 7.3 are approved: see src/logic/planningSettings.

import { DEEP_CHOICES, useLogic } from '@/src/logic/planningSettings/useLogic';
import { blockWords, minutesWords, perDayWords, type DeepWorkLimits, type SchedulingRules } from '@/src/viewmodels/planning-settings';
import { NotionPage } from '@/src/widgets/Database/NotionPage';
import { TypePill } from '@/src/widgets/TaskChips/TypePill';
import { Switch } from '@/src/widgets/TaskChips/Switch';
import { TypeSettingForm } from '@/src/widgets/PlanningSettings/TypeSettingForm';
import { HeaderPrimaryButton } from '@/src/screens/Organise/parts';
import org from '@/src/screens/Organise/Organise.module.css';
import styles from './PlanningSettingsScreen.module.css';

const DEEP_ROWS: [keyof Omit<DeepWorkLimits, 'protect'>, string][] = [
  ['minMinutes', 'Minimum a day'],
  ['maxMinutes', 'Maximum a day'],
  ['longestMinutes', 'Longest single block'],
  ['breakMinutes', 'Break after a block'],
];

export const RULE_ROWS: [keyof SchedulingRules, string][] = [
  ['placeInBlock', "Put new tasks in their type's block"],
  ['moveWhenFull', 'Move to the next free block when full'],
  ['askBeforeTomorrow', 'Ask before pushing a task to tomorrow'],
  ['keepFreeBeforeMeetings', 'Keep 15 min free before meetings'],
];

export function PlanningSettingsScreen() {
  const v = useLogic();
  const { types, deep, rules } = v.settings;
  const city = v.zone.split('/').pop()?.replace(/_/g, ' ');
  return (
    <NotionPage
      title="Planning"
      sub="Each task type gets its own time block. New tasks land in their block, and Plan my day batches them."
      crumbs={[{ label: 'Settings', href: '/settings' }, { label: 'Planning' }]}
    >
      <HeaderPrimaryButton label="New task type" onClick={v.add} />
      <div className={org.split}>
        <div className={org.main}>
          <div className={org.sectionHead}>
            <h2 className={org.sectionTitle}>Task types</h2>
            <span className={org.sectionMeta}>Times are your local time{city ? `, ${city}` : ''}</span>
          </div>
          <div className={org.tableCard}>
            <table className={org.table}>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Time block</th>
                  <th>Average</th>
                  <th>Per day</th>
                  <th>Auto</th>
                </tr>
              </thead>
              <tbody>
                {types.map((t) => (
                  <tr key={t.type} data-href onClick={() => v.edit(t)}>
                    <td>
                      <TypePill type={t.type} size="sm" />
                    </td>
                    <td className={styles.nowrap}>{blockWords(t)}</td>
                    <td className={styles.nowrap}>{minutesWords(t.average)}</td>
                    <td className={styles.nowrap}>{perDayWords(t)}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <Switch checked={t.auto} onChange={(on) => v.setAuto(t.type, on)} label={`Plan my day places ${t.type}`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={styles.foot}>Blocks repeat on the days shown. A block that is full passes extra tasks to the next free one.</p>
        </div>
        <div className={org.side}>
          <section className={org.sideCard} aria-label="Deep work limits">
            <div>
              <h2 className={org.sideTitle}>Deep work limits</h2>
              <p className={styles.sub}>Plan my day keeps you inside these</p>
            </div>
            {DEEP_ROWS.map(([key, label]) => (
              <label key={key} className={styles.row}>
                {label}
                <select className={styles.chip} value={deep[key]} onChange={(e) => v.setDeep(key, Number(e.target.value))}>
                  {DEEP_CHOICES[key].map((m) => (
                    <option key={m} value={m}>
                      {m === 0 ? 'None' : minutesWords(m)}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <label className={styles.row}>
              Protect from meetings
              <Switch checked={deep.protect} onChange={(on) => v.setDeep('protect', on)} label="Protect deep work from meetings" />
            </label>
          </section>
          <section className={org.sideCard} aria-label="Scheduling rules">
            <h2 className={org.sideTitle}>Scheduling rules</h2>
            {RULE_ROWS.map(([key, label]) => (
              <label key={key} className={styles.row}>
                {label}
                <Switch checked={rules[key]} onChange={(on) => v.setRule(key, on)} label={label} />
              </label>
            ))}
          </section>
        </div>
      </div>
      {v.editing && <TypeSettingForm initial={v.editing} isNew={v.isNew} onSave={v.saveType} onCancel={v.cancel} onRemove={() => v.removeType(v.editing!.type)} />}
    </NotionPage>
  );
}
