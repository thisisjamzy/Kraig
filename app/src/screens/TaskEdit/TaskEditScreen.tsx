'use client';

// New / edit task — the app's card-style form (src/widgets/CardForm):
// stacked field cards under a large watermark title, each a small label
// over a large value, pickers opening as bottom sheets. Same theme and
// sentence-case copy as the rest of the app.

import { useMemo, useState } from 'react';
import { Calendar as HeroCalendar } from '@heroui/react';
import { parseDate } from '@internationalized/date';
import {
  CalendarDays,
  Layers,
  Lock,
  Search,
  SquareCheck,
  Users,
  CircleDot,
  type LucideIcon,
} from 'lucide-react';
import { useLogic } from '@/src/logic/taskEdit/useLogic';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { ConfirmDialog } from '@/src/widgets/ConfirmDialog/ConfirmDialog';
import { Modal } from '@/src/widgets/Modal/Modal';
import { WebFormPanel } from '@/src/widgets/WebFormPanel/WebFormPanel';
import { useIsWeb } from '@/src/shared/hooks/useViewportMode';
import { toDateOnly } from '@/src/shared/firestore/taskWrites';
import { TASK_TYPES, priorityLabel, taskTypeLabel } from '@/src/viewmodels/projects';
import { QUADRANTS, QUADRANT_BY_ID, deriveQuadrant } from '@/src/viewmodels/eisenhower';
import {
  CardFormPage,
  FieldCard,
  PickerCard,
  PriorityIcon,
  PrioritySheet,
  SubmitButton,
  capitalize,
  cardFormStyles as styles,
} from '@/src/widgets/CardForm/CardForm';
import { TimeWheel } from '@/src/widgets/CardForm/TimeWheel';
import type { Availability, Slot } from '@/src/viewmodels/scheduling';
import { keyToDate } from '@/src/viewmodels/recurrence';
import { ConflictSheet, CustomRepeatSheet, RepeatSheet, ScopeSheet } from './RepeatSheets';
import { GoogleMark } from '@/src/widgets/GoogleEventCard/GoogleMark';
import repeatStyles from './RepeatSheets.module.css';

const TYPE_ICON: Record<string, LucideIcon> = { ToDo: SquareCheck, Meeting: Users, Event: CalendarDays };
const TYPE_TEXT: Record<string, string> = { ToDo: 'To-do', Meeting: 'Meeting', Event: 'Event' };

/** "18 April, Tuesday" */
function formatLongDate(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  const month = d.toLocaleDateString('en-US', { month: 'long' });
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long' });
  return `${d.getDate()} ${month}, ${weekday}`;
}


function hhmm(d: Date) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Live availability under the time row: a tinted pill with a colored dot
 * and message — free (green), shared with free tasks (amber, with the
 * tasks listable), or a conflict (red, with up to 3 nearest same-length
 * slots to switch to). */
export function AvailabilityRow({
  availability,
  unchangedSchedule,
  onPickSlot,
  onTryTomorrow,
}: {
  availability: Availability;
  unchangedSchedule: boolean;
  onPickSlot: (slot: Slot) => void;
  onTryTomorrow: () => void;
}) {
  const [showTasks, setShowTasks] = useState(false);
  const { status, overlappingTasks: overlaps, suggestions } = availability;
  const first = overlaps[0];
  const count = overlaps.length;

  let message: string;
  if (status === 'available') message = 'This time is free';
  else if (status === 'shared') message = `You'll share this window with ${count} free ${count === 1 ? 'task' : 'tasks'}`;
  else {
    // A pulled Google Calendar event names where it's from.
    const from = first.source === 'google' ? 'Google Calendar' : first.mode;
    message = `Conflicts with ‘${first.title}’ ${hhmm(first.start!)} to ${hhmm(first.end!)} (${from})`;
    if (count > 1) message += ` +${count - 1} more`;
  }
  const fromGoogle = status === 'conflict' && first?.source === 'google';

  return (
    <div className={styles.availability} data-status={status} aria-live="polite">
      <div className={styles.availabilityPill}>
        {fromGoogle ? <GoogleMark size={14} /> : <span className={styles.availabilityDot} aria-hidden />}
        <span className={styles.availabilityText}>{message}</span>
        {status === 'shared' && (
          <button type="button" className={styles.availabilityLink} onClick={() => setShowTasks((v) => !v)} aria-expanded={showTasks}>
            {showTasks ? 'Hide' : 'See tasks'}
          </button>
        )}
      </div>

      {status === 'shared' && showTasks && (
        <ul className={styles.overlapList}>
          {overlaps.map((task) => (
            <li key={task.id}>
              <span>{task.title}</span>
              <span className={styles.muted}>
                {hhmm(task.start!)} to {hhmm(task.end!)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {status === 'conflict' && unchangedSchedule && (
        <p className={styles.hint}>This task already overlapped before, you can still save other changes.</p>
      )}

      {status === 'conflict' && !unchangedSchedule && (
        <div className={styles.slotChips}>
          {suggestions.length > 0 ? (
            suggestions.map((slot) => (
              <button key={slot.start.getTime()} type="button" className={styles.slotChip} onClick={() => onPickSlot(slot)}>
                {hhmm(slot.start)} to {hhmm(slot.end)}
              </button>
            ))
          ) : (
            <>
              <span className={styles.hint}>No free slot of this length today.</span>
              <button type="button" className={styles.slotChip} onClick={onTryTomorrow}>
                Try tomorrow
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

type Sheet = 'date' | 'start' | 'end' | 'project' | 'priority' | 'quadrant' | 'repeat' | 'customRepeat' | null;

export function TaskEditScreen({ taskId, onClose }: { taskId: string | null; onClose?: () => void }) {
  const {
    isEditing,
    projects,
    title,
    setTitle,
    type,
    setType,
    priority,
    setPriority,
    quadrant,
    setQuadrant,
    projectId,
    setProjectId,
    done,
    setDone,
    date,
    setDate,
    startTimeOfDay,
    setStartTimeOfDay,
    endTimeOfDay,
    setEndTimeOfDay,
    timeEnabled,
    setTimeEnabled,
    timeMode,
    setTimeMode,
    availability,
    conflictField,
    unchangedSchedule,
    applySlot,
    tryTomorrow,
    isLockedTime,
    repeatPreset,
    repeatOptions,
    repeatLabel,
    rule,
    chooseRepeatPreset,
    applyCustomRule,
    seriesNote,
    sharedDateCount,
    seriesSummary,
    scopeSheet,
    chooseScope,
    closeScopeSheet,
    conflictSheet,
    skipConflictingDates,
    changeTime,
    timesRequired,
    usesTime,
    durationMinutes,
    timeError,
    notes,
    setNotes,
    isValid,
    saving,
    saveError,
    handleSave,
    deleteConfirmOpen,
    openDeleteConfirm,
    cancelDelete,
    confirmDelete,
    goBack,
    loading,
    error,
  } = useLogic(taskId, { onDone: onClose });
  const isWeb = useIsWeb();

  const [sheet, setSheet] = useState<Sheet>(null);
  const [dateMonthCursor, setDateMonthCursor] = useState(() => (date ? new Date(`${date}T00:00:00`) : new Date()));
  const [projectSearch, setProjectSearch] = useState('');

  const selectedProject = projects.find((p) => p.id === projectId) ?? null;
  // A one-off task over free tasks is switched to free; a repeating one keeps
  // its mode and only the dates that share time become free.
  const forcedFree = Boolean(availability?.forcedMode) && !rule;
  const shownMode = rule ? timeMode : (availability?.effectiveMode ?? timeMode);
  // What "automatic" resolves to right now, for the quadrant card's label.
  const autoQuadrant = deriveQuadrant(
    priority,
    date ? new Date(`${date}T${usesTime && endTimeOfDay ? endTimeOfDay : '23:59'}:00`) : null,
    new Date(`${toDateOnly(new Date())}T12:00:00`)
  );
  // A task saved with a household's own custom type keeps it as a 4th option.
  const typeOptions = TASK_TYPES.includes(type) ? TASK_TYPES : [...TASK_TYPES, type];
  const visibleProjects = useMemo(() => {
    const q = projectSearch.trim().toLowerCase();
    return projects
      .filter((p) => !q || p.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [projects, projectSearch]);

  const content = (
    <CardFormPage title={isEditing ? 'Edit task' : 'New task'} onClose={goBack}>

      <ScreenState loading={loading} error={error} />

      {!loading && !error && (
        <form
          className={styles.cards}
          onSubmit={(event) => {
            event.preventDefault();
            handleSave();
          }}
        >
          {/* A date of a recurring task: its rule and progress. */}
          {seriesSummary && <p className={repeatStyles.seriesLine}>{seriesSummary}</p>}

          {/* 1. type */}
          <div className={styles.card}>
            <span className={styles.label}>Task type</span>
            <div className={styles.segmented} role="radiogroup" aria-label="Task type">
              {typeOptions.map((option) => {
                const Icon = TYPE_ICON[option] ?? CircleDot;
                const selected = type === option;
                return (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className={styles.segment}
                    onClick={() => setType(option)}
                  >
                    <Icon size={16} strokeWidth={2} aria-hidden />
                    {TYPE_TEXT[option] ?? taskTypeLabel(option)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. name */}
          <FieldCard label="Name">
            <input
              className={styles.valueInput}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="What needs to be done?"
              autoFocus={!isEditing}
            />
          </FieldCard>

          {/* 3. date */}
          <PickerCard label="Date" onClick={() => setSheet('date')}>
            {date ? formatLongDate(date) : 'Pick a date'}
          </PickerCard>

          {/* 3b. repeat — the rule in plain words */}
          <PickerCard label="Repeat" onClick={() => date && setSheet('repeat')}>
            {rule ? repeatLabel : <span className={styles.muted}>{repeatLabel}</span>}
          </PickerCard>

          {/* 4. times */}
          {!timesRequired && (
            <label className={styles.timeToggle}>
              <input
                type="checkbox"
                role="switch"
                checked={timeEnabled}
                onChange={(event) => setTimeEnabled(event.target.checked)}
              />
              <span className={styles.switch} aria-hidden />
              Set a time
            </label>
          )}
          {usesTime && (
            <>
              <div className={styles.row}>
                <PickerCard label="Starts" onClick={() => setSheet('start')} error={conflictField === 'start'}>
                  {startTimeOfDay || '--:--'}
                </PickerCard>
                <PickerCard
                  label="Ends"
                  onClick={() => setSheet('end')}
                  error={Boolean(timeError) || conflictField === 'end'}
                >
                  {endTimeOfDay || '--:--'}
                </PickerCard>
              </div>
              <p className={styles.duration} data-error={timeError ? true : undefined}>
                {timeError ?? `${durationMinutes} min`}
              </p>

              {!timeError && availability && (
                <AvailabilityRow
                  availability={availability}
                  unchangedSchedule={unchangedSchedule}
                  onPickSlot={applySlot}
                  onTryTomorrow={tryTomorrow}
                />
              )}
              {/* A repeating task: the check above is its first date. */}
              {!timeError && seriesNote && <p className={repeatStyles.seriesNote}>{seriesNote}</p>}

              {/* Time mode — blocked owns its window, free can share one. */}
              <div className={styles.card}>
                <span className={styles.label}>Time mode</span>
                <div className={styles.segmented} role="radiogroup" aria-label="Time mode">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={shownMode === 'blocked'}
                    className={styles.segment}
                    disabled={forcedFree}
                    onClick={() => setTimeMode('blocked')}
                  >
                    <Lock size={16} strokeWidth={2} aria-hidden />
                    Blocked
                    {forcedFree && <Lock size={11} strokeWidth={2.5} className={styles.segmentBadge} aria-hidden />}
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={shownMode === 'free'}
                    className={styles.segment}
                    onClick={() => setTimeMode('free')}
                  >
                    <Layers size={16} strokeWidth={2} aria-hidden />
                    Free
                  </button>
                </div>
                <span className={styles.modeHint}>
                  {forcedFree
                    ? 'Switched to free because this window already has free tasks.'
                    : shownMode === 'blocked'
                      ? rule && sharedDateCount > 0
                        ? `Blocked, except ${sharedDateCount} ${sharedDateCount === 1 ? 'date that shares' : 'dates that share'} time with free tasks (saved as free).`
                        : 'No other activities in this window.'
                      : 'Can share this window with other free tasks.'}
                </span>
              </div>
            </>
          )}

          {/* 5. project */}
          <PickerCard label="Project" onClick={() => setSheet('project')}>
            {selectedProject ? (
              <>
                <span className={styles.projectDot} style={{ background: selectedProject.color }} aria-hidden />
                {selectedProject.name}
              </>
            ) : (
              <span className={styles.muted}>No project</span>
            )}
          </PickerCard>

          {/* 6. priority */}
          <PickerCard label="Choose task priority" onClick={() => setSheet('priority')}>
            <PriorityIcon priority={priority} />
            {capitalize(priorityLabel(priority))}
          </PickerCard>

          {/* Focus board quadrant — automatic unless chosen here or on the board. */}
          <PickerCard label="Focus quadrant" onClick={() => setSheet('quadrant')}>
            {quadrant ? (
              QUADRANT_BY_ID[quadrant].label
            ) : (
              <>
                {QUADRANT_BY_ID[autoQuadrant].label}
                <span className={styles.muted}>· automatic</span>
              </>
            )}
          </PickerCard>

          {/* notes — optional, kept so an existing task's notes stay editable */}
          <FieldCard label="Notes">
            <textarea
              className={styles.notesInput}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Anything else? (optional)"
              rows={2}
            />
          </FieldCard>

          {isEditing && (
            <label className={`${styles.card} ${styles.doneCard}`}>
              <span className={styles.pickerText}>
                <span className={styles.label}>Status</span>
                <span className={styles.value}>{done ? 'Completed' : 'Not done yet'}</span>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={done}
                onChange={(event) => setDone(event.target.checked)}
                aria-label="Completed"
              />
              <span className={styles.switch} aria-hidden />
            </label>
          )}

          {saveError && <p className={styles.formError}>{saveError}</p>}

          <SubmitButton disabled={!isValid || saving}>
            {saving ? 'Saving…' : isEditing ? 'Save changes' : '+ Add new task'}
          </SubmitButton>

          {isEditing && (
            <button type="button" className={styles.deleteLink} onClick={openDeleteConfirm}>
              Delete task
            </button>
          )}
        </form>
      )}

      {sheet === 'date' && (
        <Modal title="Date" onClose={() => setSheet(null)}>
          <HeroCalendar.Root
            focusedValue={parseDate(toDateOnly(dateMonthCursor))}
            onFocusChange={(next) => setDateMonthCursor(new Date(next.year, next.month - 1, next.day))}
            value={date ? parseDate(date) : undefined}
            onChange={(next) => {
              if (next) {
                setDate(next.toString());
                setSheet(null);
              }
            }}
          >
            <HeroCalendar.Header className={styles.calendarHeader}>
              <HeroCalendar.NavButton slot="previous" className={styles.calendarNavButton} />
              <HeroCalendar.Heading className={styles.calendarHeading} />
              <HeroCalendar.NavButton slot="next" className={styles.calendarNavButton} />
            </HeroCalendar.Header>
            <HeroCalendar.Grid className={styles.calendarGrid}>
              <HeroCalendar.GridHeader>
                {(day) => <HeroCalendar.HeaderCell className={styles.weekdayCell}>{day}</HeroCalendar.HeaderCell>}
              </HeroCalendar.GridHeader>
              <HeroCalendar.GridBody>
                {(cellDate) => (
                  <HeroCalendar.Cell date={cellDate} className={styles.dayCell}>
                    {({ formattedDate }) => <span className={styles.dayCellInner}>{formattedDate}</span>}
                  </HeroCalendar.Cell>
                )}
              </HeroCalendar.GridBody>
            </HeroCalendar.Grid>
          </HeroCalendar.Root>
        </Modal>
      )}

      {(sheet === 'start' || sheet === 'end') && (
        <Modal title={sheet === 'start' ? 'Starts' : 'Ends'} onClose={() => setSheet(null)}>
          <TimeWheel
            value={sheet === 'start' ? startTimeOfDay : endTimeOfDay}
            onChange={sheet === 'start' ? setStartTimeOfDay : setEndTimeOfDay}
            isLocked={isLockedTime}
          />
          <button type="button" className={styles.primary} onClick={() => setSheet(null)}>
            Done
          </button>
        </Modal>
      )}

      {sheet === 'project' && (
        <Modal title="Project" onClose={() => setSheet(null)}>
          <label className={styles.searchField}>
            <Search size={16} strokeWidth={2} aria-hidden />
            <input
              value={projectSearch}
              onChange={(event) => setProjectSearch(event.target.value)}
              placeholder="Search projects"
              aria-label="Search projects"
            />
          </label>
          <div className={styles.sheetList}>
            {visibleProjects.map((project) => (
              <button
                key={project.id}
                type="button"
                className={styles.sheetOption}
                aria-pressed={project.id === projectId}
                onClick={() => {
                  setProjectId(project.id);
                  setSheet(null);
                }}
              >
                <span className={styles.projectDot} style={{ background: project.color }} aria-hidden />
                {project.name}
              </button>
            ))}
            {visibleProjects.length === 0 && <p className={styles.sheetEmpty}>No projects match</p>}
            <button
              type="button"
              className={`${styles.sheetOption} ${styles.sheetOptionNone}`}
              aria-pressed={!projectId}
              onClick={() => {
                setProjectId('');
                setSheet(null);
              }}
            >
              No project
            </button>
          </div>
        </Modal>
      )}

      {sheet === 'priority' && (
        <PrioritySheet value={priority} onChange={setPriority} onClose={() => setSheet(null)} />
      )}

      {sheet === 'quadrant' && (
        <Modal title="Focus quadrant" onClose={() => setSheet(null)}>
          <div className={styles.sheetList}>
            <button
              type="button"
              className={`${styles.sheetOption} ${styles.sheetOptionStacked}`}
              aria-pressed={quadrant === null}
              onClick={() => {
                setQuadrant(null);
                setSheet(null);
              }}
            >
              <span className={styles.sheetOptionName}>Automatic</span>
              <span className={styles.sheetOptionHint}>From priority and date</span>
            </button>
            {QUADRANTS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`${styles.sheetOption} ${styles.sheetOptionStacked}`}
                aria-pressed={quadrant === option.id}
                onClick={() => {
                  setQuadrant(option.id);
                  setSheet(null);
                }}
              >
                <span className={styles.sheetOptionName}>{option.label}</span>
                <span className={styles.sheetOptionHint}>{option.hint}</span>
              </button>
            ))}
          </div>
        </Modal>
      )}

      {sheet === 'repeat' && date && (
        <RepeatSheet
          options={repeatOptions}
          value={repeatPreset}
          onChoose={(preset) => {
            if (preset === 'custom') {
              setSheet('customRepeat');
              return;
            }
            chooseRepeatPreset(preset);
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      )}

      {sheet === 'customRepeat' && date && (
        <CustomRepeatSheet
          date={usesTime && startTimeOfDay ? new Date(`${date}T${startTimeOfDay}:00`) : keyToDate(date)}
          initial={rule}
          onDone={(next) => {
            applyCustomRule(next);
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      )}

      {scopeSheet && <ScopeSheet sheet={scopeSheet} onChoose={chooseScope} onClose={closeScopeSheet} />}

      {conflictSheet && (
        <ConflictSheet sheet={conflictSheet} onSkip={skipConflictingDates} onChangeTime={changeTime} />
      )}

      {deleteConfirmOpen && (
        <ConfirmDialog
          title="Delete this task?"
          message="It'll be removed from every list, this can't be undone."
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onConfirm={confirmDelete}
          onCancel={cancelDelete}
        />
      )}
    </CardFormPage>
  );

  return isWeb ? <WebFormPanel onClose={goBack}>{content}</WebFormPanel> : content;
}
