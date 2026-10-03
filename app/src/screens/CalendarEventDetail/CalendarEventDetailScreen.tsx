'use client';

// A pulled Google Calendar meeting or event, full page (not a popup), in
// the task form's card style (src/widgets/CardForm). Google's side is shown
// read-only — title, time, organizer, guests and their answers, location,
// Join and Open in Google Calendar — with a note that it's edited in Google
// Calendar. The app's own side is editable: a link to a task or project,
// and notes.

import { Check, CircleHelp, Clock3, ExternalLink, MapPin, Search, Video, X } from 'lucide-react';
import { useLogic } from '@/src/logic/calendarEventDetail/useLogic';
import { CardFormPage, PickerCard, cardFormStyles as form } from '@/src/widgets/CardForm/CardForm';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { Modal } from '@/src/widgets/Modal/Modal';
import { GoogleMark } from '@/src/widgets/GoogleEventCard/GoogleMark';
import { isUnconfirmed } from '@/src/widgets/GoogleEventCard/GoogleEventCard';
import { taskWhen } from '@/src/widgets/TaskCheckRow/TaskCheckRow';
import styles from './CalendarEventDetailScreen.module.css';

const RESPONSE: Record<string, { label: string; Icon: typeof Check }> = {
  accepted: { label: 'Going', Icon: Check },
  declined: { label: 'Not going', Icon: X },
  tentative: { label: 'Maybe', Icon: CircleHelp },
  needsAction: { label: 'No reply yet', Icon: Clock3 },
};

function Response({ status }: { status: string | null }) {
  const r = RESPONSE[status ?? 'needsAction'] ?? RESPONSE.needsAction;
  return (
    <span className={styles.response} data-status={status ?? 'needsAction'}>
      <r.Icon size={12} strokeWidth={2.5} aria-hidden />
      {r.label}
    </span>
  );
}

/** Links come from Google via the bridge — only ever open plain https. */
function safeLink(url: string | null | undefined): string | null {
  return url && /^https:\/\//i.test(url) ? url : null;
}

function longDate(d: Date) {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

export function CalendarEventDetailScreen({ eventId }: { eventId: string }) {
  const {
    event,
    loading,
    error,
    linked,
    linkSheetOpen,
    openLinkSheet,
    closeLinkSheet,
    search,
    setSearch,
    visibleOptions,
    linkTo,
    notes,
    setNotes,
    saveNotes,
    goBack,
  } = useLogic(eventId);

  const title = event?.kind === 'meeting' ? 'Meeting' : 'Event';
  const meetingLink = safeLink(event?.meetingLink);
  const htmlLink = safeLink(event?.htmlLink);

  return (
    <CardFormPage title={title} onClose={goBack}>
      <ScreenState loading={loading} error={error} />
      {!loading && !event && !error && (
        <p className={styles.gone}>This event is no longer on your Google Calendar. It may have been deleted or declined there.</p>
      )}
      {event && (
        <div className={form.cards}>
          <div className={form.card}>
            <span className={form.label}>Title</span>
            <span className={form.value}>{event.title}</span>
            <span className={styles.tags}>
              <span className={styles.tag}>
                <GoogleMark size={14} />
                {event.source === 'booking' ? 'Booked through a scheduling link' : 'Google Calendar'}
              </span>
              {isUnconfirmed(event.selfResponse) && <span className={styles.tag} data-tone="warn"><CircleHelp size={12} strokeWidth={2.5} aria-hidden />Not confirmed</span>}
              {!event.blocksTime && <span className={styles.tag}>Free in Google · doesn&apos;t block time</span>}
            </span>
          </div>

          <div className={form.card}>
            <span className={form.label}>When</span>
            <span className={form.value}>{longDate(event.startAt.toDate())}</span>
            <span className={styles.sub}>{taskWhen(event.startAt.toDate(), event.endAt.toDate(), event.allDay, true)}</span>
            <span className={styles.note}>Title and time can&apos;t be changed here, edit this in Google Calendar.</span>
          </div>

          {(meetingLink || htmlLink) && (
            <div className={styles.actions}>
              {meetingLink && (
                <a className={form.primary} href={meetingLink} target="_blank" rel="noopener noreferrer">
                  <Video size={20} strokeWidth={2} aria-hidden />
                  <span className={styles.gap}>Join</span>
                </a>
              )}
              {htmlLink && (
                <a className={styles.secondary} href={htmlLink} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={16} strokeWidth={2} aria-hidden />
                  Open in Google Calendar
                </a>
              )}
            </div>
          )}

          {event.location && (
            <div className={form.card}>
              <span className={form.label}>Location</span>
              <span className={styles.row}>
                <MapPin size={16} strokeWidth={2} aria-hidden />
                <span className={styles.text}>{event.location}</span>
              </span>
            </div>
          )}

          {event.organizer && (
            <div className={form.card}>
              <span className={form.label}>Organizer</span>
              <span className={styles.text}>
                {event.organizer.self ? 'You' : event.organizer.name || event.organizer.email || 'Unknown'}
              </span>
            </div>
          )}

          {event.attendees.length > 0 && (
            <div className={form.card}>
              <span className={form.label}>Guests · {event.attendees.length}</span>
              <ul className={styles.guests}>
                {event.attendees.map((a, i) => (
                  <li key={`${a.email ?? a.name ?? ''}-${i}`}>
                    <span className={styles.guestName}>
                      {a.name || a.email || 'Guest'}
                      {a.email && a.email === event.organizer?.email && <span className={styles.muted}> · organizer</span>}
                      {a.optional && <span className={styles.muted}> · optional</span>}
                    </span>
                    <Response status={a.responseStatus} />
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className={styles.section}>Yours in Dreda</p>
          <PickerCard label="Link to task or project" onClick={openLinkSheet}>
            {linked ? (
              <>
                {linked.color && <span className={form.projectDot} style={{ background: linked.color }} aria-hidden />}
                {linked.name}
              </>
            ) : (
              <span className={form.muted}>None</span>
            )}
          </PickerCard>
          <label className={form.card}>
            <span className={form.label}>Notes</span>
            <textarea
              className={form.notesInput}
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => void saveNotes()}
              placeholder="Only you see these, they stay in Dreda"
            />
          </label>
          <p className={styles.note}>Changes made in Google Calendar show up here the next time the app syncs.</p>
        </div>
      )}

      {linkSheetOpen && (
        <Modal title="Link to task or project" onClose={closeLinkSheet}>
          <label className={form.searchField}>
            <Search size={16} strokeWidth={2} aria-hidden />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" aria-label="Search tasks and projects" />
          </label>
          <div className={form.sheetList}>
            {visibleOptions.map((option) => (
              <button
                key={`${option.kind}-${option.id}`}
                type="button"
                className={`${form.sheetOption} ${form.sheetOptionStacked}`}
                aria-pressed={linked?.kind === option.kind && linked.id === option.id}
                onClick={() => void linkTo(option)}
              >
                <span className={form.sheetOptionName}>{option.name}</span>
                <span className={form.sheetOptionHint}>{option.kind === 'project' ? 'Project' : 'Task'}</span>
              </button>
            ))}
            {visibleOptions.length === 0 && <p className={form.sheetEmpty}>Nothing matches</p>}
            <button type="button" className={`${form.sheetOption} ${form.sheetOptionNone}`} aria-pressed={!linked} onClick={() => void linkTo(null)}>
              No link
            </button>
          </div>
        </Modal>
      )}
    </CardFormPage>
  );
}
