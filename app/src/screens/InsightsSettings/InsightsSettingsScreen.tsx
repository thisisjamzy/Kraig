'use client';

// Settings > Insights — capacity, working hours, notifications and alert
// thresholds, in the app's card-form style (src/widgets/CardForm).

import { Bell, Minus, Plus, RotateCcw } from 'lucide-react';
import { useLogic } from '@/src/logic/insightsSettings/useLogic';
import { CardFormPage, cardFormStyles as form } from '@/src/widgets/CardForm/CardForm';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { THRESHOLD_FIELDS } from '@/src/viewmodels/insights/settings';
import styles from './InsightsSettingsScreen.module.css';

function Stepper({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  label: string;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n / step) * step));
  return (
    <span className={styles.stepper}>
      <button type="button" onClick={() => onChange(clamp(value - step))} disabled={value <= min} aria-label={`Lower ${label}`}>
        <Minus size={14} strokeWidth={2.5} />
      </button>
      <input
        type="number"
        inputMode="decimal"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(clamp(n));
        }}
        aria-label={label}
      />
      <button type="button" onClick={() => onChange(clamp(value + step))} disabled={value >= max} aria-label={`Raise ${label}`}>
        <Plus size={14} strokeWidth={2.5} />
      </button>
    </span>
  );
}

function Switch({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint: string }) {
  return (
    <label className={`${form.card} ${form.doneCard}`}>
      <span className={form.pickerText}>
        <span className={styles.switchLabel}>{label}</span>
        <span className={styles.hint}>{hint}</span>
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className={form.switch} aria-hidden />
    </label>
  );
}

export function InsightsSettingsScreen() {
  const {
    value,
    dirty,
    update,
    setThreshold,
    resetDefaults,
    save,
    saving,
    saved,
    workError,
    permission,
    enableNotifications,
    goBack,
    loading,
  } = useLogic();

  return (
    <CardFormPage title="Insights" onClose={goBack}>
      <ScreenState loading={loading} />
      {!loading && (
        <form
          className={form.cards}
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <p className={styles.section}>Your day</p>
          <div className={form.card}>
            <span className={form.label}>Daily capacity</span>
            <div className={styles.valueRow}>
              <span className={form.value}>{value.capacityHours}h</span>
              <Stepper value={value.capacityHours} min={1} max={16} step={0.5} onChange={(v) => update({ capacityHours: v })} label="daily capacity in hours" />
            </div>
            <span className={styles.hint}>Days scheduled past this turn red on Insights.</span>
          </div>
          <div className={form.row}>
            <label className={form.card}>
              <span className={form.label}>Work starts</span>
              <input className={form.valueInput} type="time" value={value.workStart} onChange={(e) => e.target.value && update({ workStart: e.target.value })} />
            </label>
            <label className={form.card}>
              <span className={form.label}>Work ends</span>
              <input className={form.valueInput} type="time" value={value.workEnd} onChange={(e) => e.target.value && update({ workEnd: e.target.value })} />
            </label>
          </div>
          {workError && <p className={form.formError}>{workError}</p>}

          <p className={styles.section}>Notifications</p>
          {permission !== 'granted' && (
            <button type="button" className={styles.permission} onClick={enableNotifications} disabled={permission === 'denied' || permission === 'unsupported'}>
              <Bell size={16} strokeWidth={2.25} aria-hidden />
              {permission === 'denied'
                ? 'Notifications are blocked in your browser settings, alerts show in the app instead'
                : permission === 'unsupported'
                  ? 'This browser can’t show notifications, alerts show in the app instead'
                  : 'Allow notifications'}
            </button>
          )}
          <Switch
            checked={value.notifyMorning}
            onChange={(v) => update({ notifyMorning: v })}
            label="Morning summary"
            hint={`At ${value.workStart}: today's load and any red alerts.`}
          />
          <Switch
            checked={value.notifyProjectRed}
            onChange={(v) => update({ notifyProjectRed: v })}
            label="Projects at risk"
            hint="When a project or milestone turns red."
          />
          <Switch
            checked={value.notifyEvening}
            onChange={(v) => update({ notifyEvening: v })}
            label="Evening nudge"
            hint={`At ${value.workEnd}, if under ${value.thresholds.eveningNudgePercent}% of today is done.`}
          />
          <p className={styles.note}>Notifications are checked while Dreda is open.</p>

          <p className={styles.section}>Alert thresholds</p>
          <div className={`${form.card} ${styles.thresholds}`}>
            {THRESHOLD_FIELDS.map((field) => (
              <div key={field.key} className={styles.threshold}>
                <span className={styles.thresholdText}>
                  <span>{field.label}</span>
                  <span className={styles.hint}>
                    {value.thresholds[field.key]} {field.unit}
                  </span>
                </span>
                <Stepper
                  value={value.thresholds[field.key]}
                  min={field.min}
                  max={field.max}
                  onChange={(v) => setThreshold(field.key, v)}
                  label={field.label}
                />
              </div>
            ))}
          </div>
          <button type="button" className={styles.reset} onClick={resetDefaults}>
            <RotateCcw size={14} strokeWidth={2.25} aria-hidden />
            Reset to defaults
          </button>

          <button type="submit" className={form.primary} disabled={!dirty || saving || Boolean(workError)}>
            {saving ? 'Saving…' : saved && !dirty ? 'Saved' : 'Save settings'}
          </button>
        </form>
      )}
    </CardFormPage>
  );
}
