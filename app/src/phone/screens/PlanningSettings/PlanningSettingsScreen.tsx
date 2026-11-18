'use client';

// Planning settings on the phone (Dreda v1.0 `Planning settings / Phone`
// 70572): back to Settings; Task types (icon, name, block, length and cap,
// auto) with Add; Deep work limits; Scheduling rules. Kept in this session
// until BUILD-KIT section 7.2 and 7.3 are approved.

import { CalendarDays, CircleDot, Mail, MapPin, Phone, Repeat2, Tag, type LucideIcon } from 'lucide-react';
import { DEEP_CHOICES, useLogic } from '@/src/logic/planningSettings/useLogic';
import { blockWords, minutesWords, type DeepWorkLimits, type SchedulingRules } from '@/src/viewmodels/planning-settings';
import { hueVars } from '@/src/viewmodels/projects';
import { typeLook, type TypeLook } from '@/src/viewmodels/taskTypes';
import { Switch } from '@/src/widgets/TaskChips/Switch';
import { TypeSettingForm } from '@/src/widgets/PlanningSettings/TypeSettingForm';
import { TimeHeader } from '@/src/phone/widgets/TimeHeader/TimeHeader';
import styles from '@/src/phone/screens/PlanningSettings/PlanningSettingsScreen.module.css';

const ICON: Partial<Record<TypeLook['icon'], LucideIcon>> = { email: Mail, call: Phone, followUp: Repeat2, walkIn: MapPin, deepWork: CircleDot, planning: CalendarDays };

const DEEP_ROWS: [keyof Omit<DeepWorkLimits, 'protect'>, string][] = [
  ['minMinutes', 'Minimum a day'],
  ['maxMinutes', 'Maximum a day'],
  ['longestMinutes', 'Longest single block'],
  ['breakMinutes', 'Break after a block'],
];

const RULE_ROWS: [keyof SchedulingRules, string][] = [
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
    <div className={styles.page}>
      <TimeHeader title="Planning" crumb={{ label: 'Settings', href: '/settings' }} />
      <section className={styles.card} aria-label="Task types">
        <header className={styles.head}>
          <h2 className={styles.title}>
            Task types {city && <span className={styles.note}>{city} time</span>}
          </h2>
          <button type="button" className={styles.link} onClick={v.add}>
            Add
          </button>
        </header>
        {types.map((t) => {
          const look = typeLook(t.type);
          const Icon = ICON[look.icon] ?? Tag;
          const c = hueVars(look.hue);
          return (
            <div key={t.type} className={styles.typeRow}>
              <button type="button" className={styles.typeBody} onClick={() => v.edit(t)}>
                <span className={styles.icon} style={{ background: c.bg, color: c.fg }} aria-hidden>
                  <Icon size={20} />
                </span>
                <span>
                  <span className={styles.typeName}>{t.type}</span>
                  <span className={styles.typeLine}>{blockWords(t)}</span>
                  <span className={styles.typeMeta}>
                    {minutesWords(t.average)}
                    {t.perDay === 1 ? ' · once a day' : t.perDay === null ? ' each · see limits' : ` each · up to ${t.perDay} a day`}
                  </span>
                </span>
              </button>
              <Switch checked={t.auto} onChange={(on) => v.setAuto(t.type, on)} label={`Plan my day places ${t.type}`} />
            </div>
          );
        })}
        <p className={styles.foot}>Blocks repeat on the days shown. A full block passes extra tasks to the next free one.</p>
      </section>

      <section className={styles.card} aria-label="Deep work limits">
        <h2 className={styles.title}>
          Deep work limits <span className={styles.note}>Used by Plan my day</span>
        </h2>
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

      <section className={styles.card} aria-label="Scheduling rules">
        <h2 className={styles.title}>Scheduling rules</h2>
        {RULE_ROWS.map(([key, label]) => (
          <label key={key} className={styles.row}>
            {label}
            <Switch checked={rules[key]} onChange={(on) => v.setRule(key, on)} label={label} />
          </label>
        ))}
      </section>
      {v.editing && <TypeSettingForm sheet initial={v.editing} isNew={v.isNew} onSave={v.saveType} onCancel={v.cancel} onRemove={() => v.removeType(v.editing!.type)} />}
    </div>
  );
}
