'use client';

// The Settings sections, shared by the web dialog (SettingsDialog) and the
// phone's section pages (/settings/<section>). Each is a title, a short
// description and rows: a label with a one-line description on the left,
// its control on the right; danger actions last, in red. Changes save as
// they're made (src/logic/settingsCenter).

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useLogic as useExport } from '@/src/logic/exportData/useLogic';
import { NOTIFICATION_TYPES, MODULE_OF, TYPE_LABEL, type NotificationModule } from '@/src/shared/notifications/types';
import { START_PAGES, type DateFormat } from '@/src/shared/firestore/preferences';
import { useFormLink } from '@/src/shared/navigation/useFormLink';
import { sectionInfo, type SettingsLogic, type SettingsSection } from '@/src/logic/settingsCenter/useLogic';
import pkg from '@/package.json';
import styles from './Settings.module.css';

const money = (n: number) => Math.round(n).toLocaleString('en-US');

// ---------------------------------------------------------------------------
// Row parts

export function Row({ label, description, children, danger = false }: { label: string; description?: ReactNode; children?: ReactNode; danger?: boolean }) {
  return (
    <div className={styles.row} data-danger={danger || undefined}>
      <span className={styles.rowText}>
        <span className={styles.rowLabel}>{label}</span>
        {description && <span className={styles.rowDescription}>{description}</span>}
      </span>
      {children && <span className={styles.rowControl}>{children}</span>}
    </div>
  );
}

function Group({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className={styles.group}>
      {title && <h3 className={styles.groupTitle}>{title}</h3>}
      <div className={styles.rows}>{children}</div>
    </section>
  );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (on: boolean) => void; label: string }) {
  return <input type="checkbox" role="switch" className={styles.switch} checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} />;
}

function Choice<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (next: T) => void; label: string }) {
  return (
    <span className={styles.segmented} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </span>
  );
}

function Select({ value, options, onChange, label }: { value: string; options: { value: string; label: string }[]; onChange: (next: string) => void; label: string }) {
  return (
    <select className={styles.select} value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** A text or number field that saves when it loses focus (or on Enter). */
function SaveOnBlur({ value, onSave, label, type = 'text', placeholder, suffix }: { value: string; onSave: (next: string) => void; label: string; type?: string; placeholder?: string; suffix?: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft !== null && draft !== value) onSave(draft);
    setDraft(null);
  };
  return (
    <span className={styles.inputWrap}>
      <input
        className={styles.input}
        type={type}
        inputMode={type === 'number' ? 'decimal' : undefined}
        value={draft ?? value}
        placeholder={placeholder}
        aria-label={label}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
      {suffix && <span className={styles.suffix}>{suffix}</span>}
    </span>
  );
}

// ---------------------------------------------------------------------------
// The sections

export function SettingsSectionView({ id, v, showTitle = true }: { id: SettingsSection; v: SettingsLogic; showTitle?: boolean }) {
  const info = sectionInfo(id);
  return (
    <div className={styles.section}>
      {showTitle && (
        <header className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>{info.label}</h2>
          <p className={styles.sectionDescription}>{info.description}</p>
        </header>
      )}
      {id === 'profile' && <Profile v={v} />}
      {id === 'preferences' && <PreferencesSection v={v} />}
      {id === 'notifications' && <NotificationsSection v={v} />}
      {id === 'connections' && <Connections v={v} />}
      {id === 'accounts' && <Accounts v={v} />}
      {id === 'budget' && <Budget v={v} />}
      {id === 'work' && <Work v={v} />}
      {id === 'data' && <Data />}
      {id === 'about' && <About />}
    </div>
  );
}

function Profile({ v }: { v: SettingsLogic }) {
  const p = v.profile;
  return (
    <>
      <Group>
        <Row label="Photo" description="From your sign-in account.">
          {p.photoURL ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className={styles.avatar} src={p.photoURL} alt="" />
          ) : (
            <span className={styles.avatar}>{(p.name || p.email || '?').charAt(0).toUpperCase()}</span>
          )}
        </Row>
        <Row label="Name" description="Shown in greetings and on shared pages.">
          <SaveOnBlur value={p.name} onSave={v.setName} label="Name" placeholder="Your name" />
        </Row>
        <Row label="Email" description={p.email || 'No email on this account.'} />
        <Row label="Sign-in methods" description={p.methods.join(', ') || 'Unknown'} />
        {p.hasPassword && (
          <Row label="Change password" description="We email you a link to set a new one.">
            <button type="button" className={styles.button} onClick={() => void v.sendPasswordReset()}>
              Send link
            </button>
          </Row>
        )}
      </Group>
      <Group>
        <Row label="Sign out" description="Signs you out on this device. Other devices stay signed in until they sign out." danger>
          <button type="button" className={styles.dangerButton} onClick={v.signOut}>
            Sign out
          </button>
        </Row>
        <Row
          label="Delete account"
          description="Deleting removes your data for good, so it is done by support after you export it. Export first under Import and export."
          danger
        />
      </Group>
    </>
  );
}

const DATE_FORMATS: { value: DateFormat; label: string }[] = [
  { value: 'dd/mm/yyyy', label: '31/12/2026' },
  { value: 'mm/dd/yyyy', label: '12/31/2026' },
  { value: 'yyyy-mm-dd', label: '2026-12-31' },
];

function PreferencesSection({ v }: { v: SettingsLogic }) {
  return (
    <Group>
      <Row label="Appearance" description="System follows your device.">
        <Choice
          label="Appearance"
          value={v.appearance}
          onChange={v.setAppearance}
          options={[
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
            { value: 'system', label: 'System' },
          ]}
        />
      </Row>
      <Row label="Start page on the web" description="What opens on a computer or tablet.">
        <Select label="Start page on the web" value={v.prefs.startPageWeb} onChange={(x) => v.setPref('startPageWeb', x)} options={START_PAGES} />
      </Row>
      <Row label="Start page on the phone" description="What opens on your phone.">
        <Select label="Start page on the phone" value={v.prefs.startPagePhone} onChange={(x) => v.setPref('startPagePhone', x)} options={START_PAGES} />
      </Row>
      <Row label="Week starts on" description="Calendars and weekly figures.">
        <Choice
          label="Week starts on"
          value={String(v.prefs.weekStartsOn) as '0' | '1'}
          onChange={(x) => v.setPref('weekStartsOn', Number(x) as 0 | 1)}
          options={[
            { value: '1', label: 'Monday' },
            { value: '0', label: 'Sunday' },
          ]}
        />
      </Row>
      <Row label="Date format" description="How dates are written.">
        <Select label="Date format" value={v.prefs.dateFormat} onChange={(x) => v.setPref('dateFormat', x as DateFormat)} options={DATE_FORMATS} />
      </Row>
      <Row label="Time zone" description="Due dates, reminders and the daily summary.">
        <Select label="Time zone" value={v.timeZone} onChange={v.setTimeZone} options={v.timeZones.map((tz) => ({ value: tz, label: tz.replace(/_/g, ' ') }))} />
      </Row>
      <Row label="Currency" description="Figures are shown in this currency.">
        <Select label="Currency" value={v.currency} onChange={v.setCurrency} options={v.currencies.map((c) => ({ value: c.code, label: `${c.code} · ${c.name}` }))} />
      </Row>
      <Row label="Hide amounts by default" description="Balances start hidden; tap to show them.">
        <Switch label="Hide amounts by default" checked={v.prefs.hideAmounts} onChange={(on) => v.setPref('hideAmounts', on)} />
      </Row>
    </Group>
  );
}

const MODULES: { id: NotificationModule; label: string }[] = [
  { id: 'money', label: 'Money' },
  { id: 'time', label: 'Time' },
  { id: 'system', label: 'System' },
];

function NotificationsSection({ v }: { v: SettingsLogic }) {
  const n = v.notificationPrefs;
  return (
    <>
      <Group>
        <Row label="Daily summary" description="When the morning summary is written.">
          <input type="time" className={styles.input} value={n.summaryTime} onChange={(e) => e.target.value && void v.setSummaryTime(e.target.value)} aria-label="Daily summary time" />
        </Row>
        <Row label="Ask on opening the app" description="A short prompt when there are unread updates.">
          <Switch label="Ask on opening the app" checked={v.prefs.appOpenPrompt} onChange={(on) => v.setPref('appOpenPrompt', on)} />
        </Row>
        {v.permission !== 'granted' && v.permission !== 'unsupported' && (
          <Row label="Push on this device" description="Allow notifications in this browser.">
            <button type="button" className={styles.button} onClick={() => void v.allowPush()}>
              Allow
            </button>
          </Row>
        )}
        <Row label="Email" description="Saved as a choice for now: sending email needs a server, which this app doesn't run." />
      </Group>
      {MODULES.map((m) => (
        <Group key={m.id} title={m.label}>
          {NOTIFICATION_TYPES.filter((t) => MODULE_OF[t] === m.id).map((t) => {
            const on = !n.muted.includes(t);
            return (
              <Row
                key={t}
                label={TYPE_LABEL[t]}
                description={
                  on ? (
                    <span className={styles.channels}>
                      <label>
                        <input type="checkbox" checked={n.push.includes(t)} onChange={(e) => void v.setTypeChannel(t, 'push', e.target.checked)} /> Push
                      </label>
                      <label>
                        <input type="checkbox" checked={n.email.includes(t)} onChange={(e) => void v.setTypeChannel(t, 'email', e.target.checked)} /> Email
                      </label>
                    </span>
                  ) : (
                    'Off: nothing new of this kind is created.'
                  )
                }
              >
                <Switch label={`${TYPE_LABEL[t]} in the app`} checked={on} onChange={(x) => void v.setTypeOn(t, x)} />
              </Row>
            );
          })}
        </Group>
      ))}
    </>
  );
}

const CONNECTION_TEXT: Record<SettingsLogic['calendar']['connection'], string> = {
  syncing: 'Connected and syncing',
  'not-configured': 'Not set up on this copy of Dreda',
  'not-allowed': 'Google access was not allowed',
  'needs-setup': 'Connect your Google account to start',
};

function Connections({ v }: { v: SettingsLogic }) {
  const c = v.calendar;
  if (!c.configured) {
    return (
      <Group title="Google Calendar">
        <Row label="Not set up" description="This copy of Dreda has no Google Calendar connection configured." />
      </Group>
    );
  }
  const last = c.lastSuccessAt ? new Date(c.lastSuccessAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Never';
  return (
    <Group title="Google Calendar">
      <Row label="Status" description={c.lastError ? c.lastError.message : CONNECTION_TEXT[c.connection]} />
      <Row label="Calendar" description={c.calendarName ?? 'Not chosen yet'} />
      <Row label="Last sync" description={last}>
        <button type="button" className={styles.button} disabled={c.running} onClick={c.syncNow}>
          {c.running ? 'Syncing…' : 'Sync now'}
        </button>
      </Row>
      <Row label="Test connection" description={c.testResult ? c.testResult.text : 'Checks Dreda can read and write your calendar.'}>
        <button type="button" className={styles.button} disabled={c.testing} onClick={() => void c.testConnection()}>
          {c.testing ? 'Testing…' : 'Test'}
        </button>
      </Row>
      <Row label="Also mark free tasks as busy" description="Free tasks show as busy time in Google Calendar.">
        <Switch label="Also mark free tasks as busy" checked={c.markFreeAsBusy} onChange={(on) => void c.toggleMarkFree(on)} />
      </Row>
    </Group>
  );
}

function Accounts({ v }: { v: SettingsLogic }) {
  const formLink = useFormLink();
  return (
    <>
      <Group>
        {v.accounts.map((a) => (
          <Row
            key={a.id}
            label={a.name}
            description={
              <>
                {money(a.currentBalance ?? 0)} {a.currency} · {a.type}
                {v.prefs.defaultAccountId === a.id ? ' · Default' : ''}
              </>
            }
          >
            {v.isSavings(a) && (
              <label className={styles.inlineSwitch}>
                <span>Usable for the plan</span>
                <Switch label={`${a.name} usable for the plan`} checked={Boolean(a.usableForPlan)} onChange={(on) => void v.setUsableForPlan(a.id, on)} />
              </label>
            )}
            {v.prefs.defaultAccountId !== a.id && !v.isSavings(a) && (
              <button type="button" className={styles.button} onClick={() => void v.setDefaultAccount(a.id)}>
                Set default
              </button>
            )}
            <Link className={styles.link} href={formLink('wallet', { id: a.id })}>
              Edit
            </Link>
          </Row>
        ))}
      </Group>
      <Group>
        <Row label="Add a wallet" description="Cash, a bank account, mobile money or savings.">
          <Link className={styles.button} href="/wallets">
            Add
          </Link>
        </Row>
        <Row label="Rename or archive" description="Open a wallet's Edit; archiving moves or writes off what's in it." />
      </Group>
    </>
  );
}

function Budget({ v }: { v: SettingsLogic }) {
  const days = Array.from({ length: 28 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }));
  return (
    <Group>
      <Row label="Month starts on" description="The day a budget month begins, for example payday.">
        <Select label="Month starts on" value={String(v.prefs.monthStartDay)} onChange={(x) => v.setPref('monthStartDay', Number(x))} options={days} />
      </Row>
      <Row label="Safety cushion" description="The balance the plan keeps above. Empty: one month of must-have expenses.">
        <SaveOnBlur
          label="Safety cushion"
          type="number"
          value={v.cushion == null ? '' : String(v.cushion)}
          placeholder="Default"
          onSave={(x) => void v.setCushion(x.trim() === '' ? null : Math.max(0, Number(x) || 0))}
        />
      </Row>
      <Row label="Savings target" description="The share of income you aim to save.">
        <SaveOnBlur
          label="Savings target"
          type="number"
          suffix="%"
          value={v.savingsTarget == null ? '' : String(Math.round(v.savingsTarget * 100))}
          placeholder="None"
          onSave={(x) => void v.setSavingsTarget(x.trim() === '' ? null : Math.min(100, Math.max(0, Number(x) || 0)) / 100)}
        />
      </Row>
      <Row label="Automation for new items" description="Remind: a notification when due. Prepare: added to Ready to pay.">
        <Choice
          label="Automation for new items"
          value={v.prefs.automationDefault}
          onChange={(x) => v.setPref('automationDefault', x)}
          options={[
            { value: 'off', label: 'Off' },
            { value: 'remind', label: 'Remind' },
            { value: 'prepare', label: 'Prepare' },
          ]}
        />
      </Row>
      <Row label="Roll over unused amounts" description="New variable expenses carry what's left into the next month.">
        <Switch label="Roll over unused amounts" checked={v.prefs.rolloverDefault} onChange={(on) => v.setPref('rolloverDefault', on)} />
      </Row>
    </Group>
  );
}

const LENGTHS = [15, 30, 45, 60, 90, 120].map((m) => ({ value: String(m), label: m < 60 ? `${m} min` : `${m / 60} h${m % 60 ? ` ${m % 60} min` : ''}` }));

function Work({ v }: { v: SettingsLogic }) {
  return (
    <>
      <Group>
        <Row label="Working hours" description="When tasks can be scheduled.">
          <span className={styles.pair}>
            <input type="time" className={styles.input} value={v.workStart} onChange={(e) => e.target.value && void v.setWork({ workStart: e.target.value })} aria-label="Work starts" />
            <span aria-hidden>to</span>
            <input type="time" className={styles.input} value={v.workEnd} onChange={(e) => e.target.value && void v.setWork({ workEnd: e.target.value })} aria-label="Work ends" />
          </span>
        </Row>
        <Row label="Daily capacity" description="Hours of focused work in a day.">
          <SaveOnBlur label="Daily capacity" type="number" suffix="h" value={String(v.capacityHours)} onSave={(x) => void v.setWork({ capacityHours: Math.min(24, Math.max(0, Number(x) || 0)) })} />
        </Row>
        <Row label="Default task length" description="For new tasks with a time.">
          <Select label="Default task length" value={String(v.prefs.defaultTaskMinutes)} onChange={(x) => v.setPref('defaultTaskMinutes', Number(x))} options={LENGTHS} />
        </Row>
      </Group>
      <Group title="Time mode for new tasks">
        {v.taskTypes.map((type) => (
          <Row key={type} label={type} description="Blocked time can't overlap; free time can.">
            <Choice
              label={`${type} time mode`}
              value={v.prefs.timeModeByType[type] ?? (type === 'ToDo' ? 'free' : 'blocked')}
              onChange={(x) => v.setPref('timeModeByType', { ...v.prefs.timeModeByType, [type]: x })}
              options={[
                { value: 'blocked', label: 'Blocked' },
                { value: 'free', label: 'Free' },
              ]}
            />
          </Row>
        ))}
      </Group>
    </>
  );
}

function Data() {
  const ex = useExport();
  const busy = ex.exporting;
  return (
    <>
      <Group title="Import">
        <Row label="Import projects and tasks" description="From an Excel or CSV file, with duplicates checked first.">
          <Link className={styles.button} href="/settings/import">
            Import
          </Link>
        </Row>
        <Row label="Templates" description="Spreadsheets with the right columns to fill in.">
          <Link className={styles.link} href="/settings/download-template">
            Download
          </Link>
        </Row>
      </Group>
      <Group title="Export">
        <Row label="Everything" description={ex.error ?? (ex.done ? 'Your export downloaded.' : 'Every record, as a spreadsheet, CSV files or JSON.')}>
          <span className={styles.pair}>
            <button type="button" className={styles.button} disabled={busy} onClick={() => void ex.handleExport('xlsx')}>
              Excel
            </button>
            <button type="button" className={styles.button} disabled={busy} onClick={() => void ex.handleExport('csv')}>
              CSV
            </button>
            <button type="button" className={styles.button} disabled={busy} onClick={() => void ex.handleExport('json')}>
              JSON
            </button>
          </span>
        </Row>
      </Group>
      <Group title="Tools">
        {[
          { href: '/categories', label: 'Categories', description: 'Expense, income and savings categories.' },
          { href: '/transaction-templates', label: 'Transaction templates', description: 'Saved transactions you record often.' },
          { href: '/settings/archived-baskets', label: 'Archived baskets', description: 'Restore or delete them.' },
          { href: '/settings/reconcile', label: 'Reconcile balances', description: 'Match wallets to what you really have.' },
          { href: '/settings/reconciliation', label: 'Reconciliation', description: 'Explain gaps between balances and transactions.' },
          { href: '/settings/audit-reports', label: 'Audit reports', description: 'Checks run on your data.' },
          { href: '/settings/backfill', label: 'Backfill', description: 'Spread a lump sum over past months.' },
        ].map((t) => (
          <Row key={t.href} label={t.label} description={t.description}>
            <Link className={styles.link} href={t.href}>
              Open
            </Link>
          </Row>
        ))}
      </Group>
    </>
  );
}

function About() {
  return (
    <Group>
      <Row label="Version" description={`Dreda ${pkg.version}`} />
      <Row label="Terms of use" description="Not published yet." />
      <Row label="Privacy" description="Your data stays in your own account; nothing is shared or sold." />
      <Row label="Support" description="Ask the person who set up Dreda for you." />
    </Group>
  );
}

/** Wraps sections in their layout's look: thin divider rows on the web, BASELINE cards on a phone. */
export function SettingsFrame({ layout, children }: { layout: 'web' | 'phone'; children: ReactNode }) {
  return (
    <div className={styles.frame} data-layout={layout}>
      {children}
    </div>
  );
}
