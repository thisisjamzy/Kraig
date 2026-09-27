'use client';

// New / edit project — one card-style form for both (src/widgets/CardForm),
// same look as New task. Area, section, priority, color and timeline each
// open a bottom sheet. Editing adds the status (which includes archiving)
// and deleting the project for good, keeping or deleting its tasks.

import { useState } from 'react';
import { RangeCalendar as HeroRangeCalendar } from '@heroui/react';
import { parseDate } from '@internationalized/date';
import { useLogic } from '@/src/logic/projectForm/useLogic';
import { EmojiPicker } from '@/src/widgets/EmojiPicker/EmojiPicker';
import { Modal } from '@/src/widgets/Modal/Modal';
import { toDateOnly } from '@/src/shared/firestore/taskWrites';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { WebFormPanel } from '@/src/widgets/WebFormPanel/WebFormPanel';
import { useIsWeb } from '@/src/shared/hooks/useViewportMode';
import { priorityLabel } from '@/src/viewmodels/projects';
import type { ProjectStatus } from '@/src/shared/firestore/types';
import {
  CardFormPage,
  ColorSheet,
  FieldCard,
  PickerCard,
  PriorityIcon,
  PrioritySheet,
  SubmitButton,
  capitalize,
  cardFormStyles as styles,
} from '@/src/widgets/CardForm/CardForm';

function formatDate(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

type Sheet = 'area' | 'section' | 'color' | 'priority' | 'timeline' | 'status' | 'delete' | null;

const STATUSES: { value: ProjectStatus; label: string; hint: string }[] = [
  { value: 'Active', label: 'Active', hint: 'In progress' },
  { value: 'Completed', label: 'Completed', hint: 'Done — kept with your projects' },
  { value: 'Archived', label: 'Archived', hint: 'Hidden from Projects; can be restored any time' },
];

export function ProjectFormScreen({ projectId }: { projectId?: string }) {
  const strings = useStrings();
  const {
    areas,
    sections,
    name,
    setName,
    emoji,
    setEmoji,
    areaId,
    setAreaId,
    bucketId,
    setBucketId,
    color,
    setColor,
    priority,
    setPriority,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    description,
    setDescription,
    status,
    setStatus,
    isValid,
    saving,
    saveError,
    handleSave,
    isEditing,
    taskCount,
    deleting,
    handleDelete,
    goBack,
    loading,
    notFound,
  } = useLogic(projectId);
  const isWeb = useIsWeb();

  const [sheet, setSheet] = useState<Sheet>(null);
  const [deleteTasks, setDeleteTasks] = useState(false);
  const [dateMonthCursor, setDateMonthCursor] = useState(() => (startDate ? new Date(`${startDate}T00:00:00`) : new Date()));

  const selectedArea = areas.find((a) => a.id === areaId) ?? null;
  const selectedSection = sections.find((b) => b.id === bucketId) ?? null;
  const timeline =
    startDate && endDate
      ? `${formatDate(startDate)} – ${formatDate(endDate)}`
      : startDate
        ? formatDate(startDate)
        : null;

  const content = (
    <CardFormPage title={isEditing ? 'Edit project' : strings.createProject.title} onClose={goBack}>
      <ScreenState loading={loading} error={notFound ? 'This project could not be found.' : null} />

      {!loading && !notFound && (
        <form
          className={styles.cards}
          onSubmit={(event) => {
            event.preventDefault();
            handleSave();
          }}
        >
          <FieldCard label="Name">
            <input
              className={styles.valueInput}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={strings.createProject.namePlaceholder}
              autoFocus
            />
          </FieldCard>

          <FieldCard label={strings.createProject.notesLabel}>
            <textarea
              className={styles.notesInput}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What is this project about?"
              rows={2}
            />
          </FieldCard>

          <PickerCard label="Timeline" onClick={() => setSheet('timeline')}>
            {timeline ?? <span className={styles.muted}>Pick start and end dates</span>}
          </PickerCard>

          <PickerCard label="Area" onClick={() => setSheet('area')}>
            {selectedArea ? (
              <>
                <span className={styles.projectDot} style={{ background: selectedArea.color }} aria-hidden />
                {selectedArea.name}
              </>
            ) : (
              <span className={styles.muted}>{strings.createProject.noAreaOption}</span>
            )}
          </PickerCard>

          {areaId && (
            <PickerCard label="Section" onClick={() => setSheet('section')}>
              {selectedSection ? selectedSection.name : <span className={styles.muted}>Choose a section</span>}
            </PickerCard>
          )}

          {isEditing && (
            <PickerCard label="Status" onClick={() => setSheet('status')}>
              {status}
            </PickerCard>
          )}

          <PickerCard label="Choose project priority" onClick={() => setSheet('priority')}>
            <PriorityIcon priority={priority} />
            {capitalize(priorityLabel(priority))}
          </PickerCard>

          <div className={styles.row}>
            <PickerCard label={strings.createProject.colorLabel} onClick={() => setSheet('color')}>
              <span className={styles.swatchValue} style={{ background: color }} aria-hidden />
            </PickerCard>
            <div className={`${styles.card} ${styles.emojiCard}`}>
              <span className={styles.label}>Emoji</span>
              <EmojiPicker value={emoji} onChange={setEmoji} label="Project emoji" noneLabel="No emoji" />
            </div>
          </div>

          {saveError && <p className={styles.formError}>{saveError}</p>}

          <SubmitButton disabled={!isValid || saving}>
            {saving ? 'Saving…' : isEditing ? 'Save changes' : '+ Add new project'}
          </SubmitButton>

          {isEditing && (
            <button type="button" className={styles.deleteLink} onClick={() => setSheet('delete')}>
              Delete project
            </button>
          )}
        </form>
      )}

      {sheet === 'timeline' && (
        <Modal title="Timeline" onClose={() => setSheet(null)}>
          <HeroRangeCalendar.Root
            focusedValue={parseDate(toDateOnly(dateMonthCursor))}
            onFocusChange={(next) => setDateMonthCursor(new Date(next.year, next.month - 1, next.day))}
            value={startDate && endDate ? { start: parseDate(startDate), end: parseDate(endDate) } : null}
            onChange={(next) => {
              if (next) {
                setStartDate(next.start.toString());
                setEndDate(next.end.toString());
                setSheet(null);
              }
            }}
          >
            <HeroRangeCalendar.Header className={styles.calendarHeader}>
              <HeroRangeCalendar.NavButton slot="previous" className={styles.calendarNavButton} />
              <HeroRangeCalendar.Heading className={styles.calendarHeading} />
              <HeroRangeCalendar.NavButton slot="next" className={styles.calendarNavButton} />
            </HeroRangeCalendar.Header>
            <HeroRangeCalendar.Grid className={styles.calendarGrid}>
              <HeroRangeCalendar.GridHeader>
                {(day) => <HeroRangeCalendar.HeaderCell className={styles.weekdayCell}>{day}</HeroRangeCalendar.HeaderCell>}
              </HeroRangeCalendar.GridHeader>
              <HeroRangeCalendar.GridBody>
                {(cellDate) => (
                  <HeroRangeCalendar.Cell date={cellDate} className={styles.dayCell}>
                    {({ formattedDate }) => <span className={styles.dayCellInner}>{formattedDate}</span>}
                  </HeroRangeCalendar.Cell>
                )}
              </HeroRangeCalendar.GridBody>
            </HeroRangeCalendar.Grid>
          </HeroRangeCalendar.Root>
          <p className={styles.hint}>Tap a start date, then an end date.</p>
        </Modal>
      )}

      {sheet === 'area' && (
        <Modal title="Area" onClose={() => setSheet(null)}>
          <div className={styles.sheetList}>
            {areas.map((area) => (
              <button
                key={area.id}
                type="button"
                className={styles.sheetOption}
                aria-pressed={area.id === areaId}
                onClick={() => {
                  setAreaId(area.id);
                  setSheet(null);
                }}
              >
                <span className={styles.projectDot} style={{ background: area.color }} aria-hidden />
                {area.name}
              </button>
            ))}
            <button
              type="button"
              className={`${styles.sheetOption} ${styles.sheetOptionNone}`}
              aria-pressed={!areaId}
              onClick={() => {
                setAreaId('');
                setSheet(null);
              }}
            >
              {strings.createProject.noAreaOption}
            </button>
          </div>
        </Modal>
      )}

      {sheet === 'section' && (
        <Modal title="Section" onClose={() => setSheet(null)}>
          <div className={styles.sheetList}>
            {sections.map((section) => (
              <button
                key={section.id}
                type="button"
                className={styles.sheetOption}
                aria-pressed={section.id === bucketId}
                onClick={() => {
                  setBucketId(section.id);
                  setSheet(null);
                }}
              >
                <span className={styles.projectDot} style={{ background: section.color }} aria-hidden />
                {section.name}
              </button>
            ))}
            {sections.length === 0 && <p className={styles.sheetEmpty}>This area has no sections yet.</p>}
          </div>
        </Modal>
      )}

      {sheet === 'status' && (
        <Modal title="Status" onClose={() => setSheet(null)}>
          <div className={styles.sheetList}>
            {STATUSES.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`${styles.sheetOption} ${styles.sheetOptionStacked}`}
                aria-pressed={option.value === status}
                onClick={() => {
                  setStatus(option.value);
                  setSheet(null);
                }}
              >
                {option.label}
                <small className={styles.muted}>{option.hint}</small>
              </button>
            ))}
          </div>
        </Modal>
      )}

      {sheet === 'delete' && (
        <Modal title="Delete this project?" onClose={() => setSheet(null)}>
          <p className={styles.hint}>
            It&apos;s removed for good, with its milestones. This can&apos;t be undone — to hide it instead, set its status to Archived.
          </p>
          {taskCount > 0 && (
            <div className={styles.sheetList} role="radiogroup" aria-label="Its tasks">
              <button
                type="button"
                role="radio"
                aria-checked={!deleteTasks}
                className={`${styles.sheetOption} ${styles.sheetOptionStacked}`}
                onClick={() => setDeleteTasks(false)}
              >
                Keep its {taskCount} {taskCount === 1 ? 'task' : 'tasks'}
                <small className={styles.muted}>They stay as standalone tasks, with no project.</small>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={deleteTasks}
                className={`${styles.sheetOption} ${styles.sheetOptionStacked}`}
                onClick={() => setDeleteTasks(true)}
              >
                Delete its {taskCount} {taskCount === 1 ? 'task' : 'tasks'} too
                <small className={styles.muted}>Subtasks included. Also can&apos;t be undone.</small>
              </button>
            </div>
          )}
          {saveError && <p className={styles.formError}>{saveError}</p>}
          <button
            type="button"
            className={styles.primary}
            data-tone="danger"
            disabled={deleting}
            onClick={() => handleDelete(taskCount > 0 && deleteTasks)}
          >
            {deleting ? 'Deleting…' : taskCount > 0 && deleteTasks ? 'Delete project and tasks' : 'Delete project'}
          </button>
        </Modal>
      )}

      {sheet === 'priority' && <PrioritySheet value={priority} onChange={setPriority} onClose={() => setSheet(null)} />}
      {sheet === 'color' && <ColorSheet value={color} onChange={setColor} onClose={() => setSheet(null)} />}
    </CardFormPage>
  );

  return isWeb ? <WebFormPanel onClose={goBack}>{content}</WebFormPanel> : content;
}
