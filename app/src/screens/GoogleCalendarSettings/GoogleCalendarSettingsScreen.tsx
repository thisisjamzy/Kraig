'use client';

// Settings > Google Calendar — in the app's card-form style, like Settings >
// Insights. Status, the last sync, what it moved, Sync now / Test
// connection, and "Also mark free tasks as busy on Google".

import { CircleCheck, LoaderCircle, Plug, RefreshCw, TriangleAlert } from 'lucide-react';
import { useLogic, type ConnectionState } from '@/src/logic/googleCalendarSettings/useLogic';
import { CardFormPage, cardFormStyles as form } from '@/src/widgets/CardForm/CardForm';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { GoogleMark } from '@/src/widgets/GoogleEventCard/GoogleMark';
import { timeAgo } from '@/src/widgets/CalendarSyncStatus/CalendarSyncStatus';
import styles from './GoogleCalendarSettingsScreen.module.css';

function statusText(connection: ConnectionState, calendarName: string | null) {
  switch (connection) {
    case 'not-configured':
      return 'Google Calendar sync is not configured';
    case 'not-allowed':
      return "This account isn't allowed to sync with this calendar";
    case 'needs-setup':
      return 'Calendar sync needs setup on the server';
    default:
      return calendarName ? `Syncing with ${calendarName}` : 'Syncing with Google Calendar';
  }
}

export function GoogleCalendarSettingsScreen() {
  const l = useLogic();
  const ok = l.connection === 'syncing';
  const StatusIcon = ok ? CircleCheck : TriangleAlert;

  return (
    <CardFormPage title="Google Calendar" onClose={l.goBack}>
      <ScreenState loading={l.loading} />
      <div className={form.cards}>
        <div className={form.card}>
          <span className={form.label}>Status</span>
          <span className={styles.status} data-tone={ok ? 'ok' : l.connection === 'not-configured' ? 'off' : 'error'}>
            <StatusIcon size={18} strokeWidth={2.25} aria-hidden />
            {statusText(l.connection, l.calendarName)}
          </span>
          {ok && l.calendarTimeZone && <span className={styles.hint}>Calendar time zone: {l.calendarTimeZone}</span>}
        </div>

        {l.configured && (
          <>
            <div className={form.card}>
              <span className={form.label}>Last successful sync</span>
              <span className={styles.big}>{l.lastSuccessAt ? timeAgo(l.lastSuccessAt, Math.max(l.nowMs, l.lastSuccessAt)) : 'Not yet'}</span>
              {l.lastError && (!l.lastSuccessAt || l.lastError.at > l.lastSuccessAt) && (
                <span className={styles.error}>
                  <TriangleAlert size={14} strokeWidth={2.25} aria-hidden />
                  {l.lastError.message}
                </span>
              )}
            </div>

            {l.counts && (
              <div className={`${form.card} ${styles.counts}`}>
                <span className={styles.count}>
                  <span className={styles.countValue}>{l.counts.meetings + l.counts.events}</span>
                  <span className={styles.countLabel}>meetings and events imported</span>
                </span>
                <span className={styles.count}>
                  <span className={styles.countValue}>{l.counts.blocksPushed}</span>
                  <span className={styles.countLabel}>blocks on Google</span>
                </span>
                <span className={styles.count}>
                  <span className={styles.countValue}>{l.counts.conflicts}</span>
                  <span className={styles.countLabel}>conflicts</span>
                </span>
              </div>
            )}

            <div className={styles.buttons}>
              <button type="button" className={styles.button} onClick={l.syncNow} disabled={l.running}>
                {l.running ? (
                  <LoaderCircle size={18} strokeWidth={2.25} className={styles.spin} aria-hidden />
                ) : (
                  <RefreshCw size={18} strokeWidth={2.25} aria-hidden />
                )}
                {l.running ? 'Syncing…' : 'Sync now'}
              </button>
              <button type="button" className={styles.button} data-variant="secondary" onClick={l.testConnection} disabled={l.testing}>
                {l.testing ? <LoaderCircle size={18} strokeWidth={2.25} className={styles.spin} aria-hidden /> : <Plug size={18} strokeWidth={2.25} aria-hidden />}
                Test connection
              </button>
            </div>
            {l.testResult && (
              <p className={styles.testResult} data-ok={l.testResult.ok || undefined} role="status">
                {l.testResult.ok ? <GoogleMark size={16} /> : <TriangleAlert size={14} strokeWidth={2.25} aria-hidden />}
                {l.testResult.text}
              </p>
            )}

            <label className={`${form.card} ${form.doneCard}`}>
              <span className={form.pickerText}>
                <span className={styles.switchLabel}>Also mark free tasks as busy on Google</span>
                <span className={styles.hint}>Free tasks can share their time in Dreda. Turn this on to block them on Google Calendar too.</span>
              </span>
              <input type="checkbox" role="switch" checked={l.markFreeAsBusy} onChange={(e) => void l.toggleMarkFree(e.target.checked)} />
              <span className={form.switch} aria-hidden />
            </label>
          </>
        )}

        <p className={styles.note}>
          Changes made in Google Calendar show up here the next time the app syncs. Blocked tasks you plan here are
          added to Google Calendar as Busy so no one can book over them.
        </p>
      </div>
    </CardFormPage>
  );
}
