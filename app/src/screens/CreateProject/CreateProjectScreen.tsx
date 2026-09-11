'use client';

import { useState } from 'react';
import { RangeCalendar as HeroRangeCalendar } from '@heroui/react';
import { parseDate } from '@internationalized/date';
import { X, Check, ChevronRight, Layers, Box, Palette, AlertTriangle, CalendarDays } from 'lucide-react';
import { useLogic } from '@/src/logic/createProject/useLogic';
import { EmojiPicker } from '@/src/widgets/EmojiPicker/EmojiPicker';
import { toDateOnly } from '@/src/shared/firestore/taskWrites';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { PROJECT_COLORS, PRIORITY_LEVELS } from '@/src/viewmodels/projects';
import styles from './CreateProjectScreen.module.css';

function formatDateOnly(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });
}

export function CreateProjectScreen() {
  const strings = useStrings();
  const {
    areas,
    buckets,
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
    isValid,
    saving,
    saveError,
    handleSave,
    goBack,
    loading,
  } = useLogic();

  const [areaPickerOpen, setAreaPickerOpen] = useState(false);
  const [bucketPickerOpen, setBucketPickerOpen] = useState(false);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [priorityPickerOpen, setPriorityPickerOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [dateMonthCursor, setDateMonthCursor] = useState(() => (startDate ? new Date(`${startDate}T00:00:00`) : new Date()));

  const selectedArea = areas.find((a) => a.id === areaId) ?? null;
  const selectedBucket = buckets.find((b) => b.id === bucketId) ?? null;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.iconButton} onClick={goBack} aria-label={strings.projectDetail.backLabel}>
          <X size={18} strokeWidth={2} />
        </button>
        <h1 className={styles.headerTitle}>{strings.createProject.title}</h1>
        <button
          type="button"
          className={`${styles.saveIconButton} ${isValid ? styles.saveIconButtonActive : ''}`}
          disabled={!isValid || saving}
          onClick={handleSave}
          aria-label="Save"
        >
          <Check size={18} strokeWidth={2.5} />
        </button>
      </header>

      <div className={styles.emojiRow}>
        <EmojiPicker value={emoji} onChange={setEmoji} label="Project emoji" noneLabel="No emoji" />
      </div>

      <ScreenState loading={loading} />

      {!loading && (
        <div className={styles.form}>
          <div className={styles.card}>
            <input
              className={styles.titleInput}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={strings.createProject.namePlaceholder}
            />
            <div className={styles.cardDivider} />
            <textarea
              className={styles.notesInput}
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={strings.createProject.notesLabel}
            />
          </div>

          <div className={styles.listGroup}>
            <button type="button" className={styles.listRow} onClick={() => setAreaPickerOpen((c) => !c)}>
              <span className={styles.listRowIcon}>
                <Layers size={16} strokeWidth={2} />
              </span>
              <span className={styles.listRowLabel}>Area</span>
              <span className={styles.listRowValue}>{selectedArea ? selectedArea.name : strings.createProject.noAreaOption}</span>
              <ChevronRight size={16} strokeWidth={2} className={styles.listRowChevron} />
            </button>
            {areaPickerOpen && (
              <div className={styles.expandPanel}>
                <button
                  type="button"
                  className={`${styles.optionRow} ${!areaId ? styles.optionRowActive : ''}`}
                  onClick={() => {
                    setAreaId('');
                    setAreaPickerOpen(false);
                  }}
                >
                  {strings.createProject.noAreaOption}
                </button>
                {areas.map((area) => (
                  <button
                    key={area.id}
                    type="button"
                    className={`${styles.optionRow} ${areaId === area.id ? styles.optionRowActive : ''}`}
                    onClick={() => {
                      setAreaId(area.id);
                      setAreaPickerOpen(false);
                    }}
                  >
                    {area.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {areaId && (
            <div className={styles.listGroup}>
              <button type="button" className={styles.listRow} onClick={() => setBucketPickerOpen((c) => !c)}>
                <span className={styles.listRowIcon}>
                  <Box size={16} strokeWidth={2} />
                </span>
                <span className={styles.listRowLabel}>Bucket</span>
                <span className={styles.listRowValue}>{selectedBucket ? selectedBucket.name : '—'}</span>
                <ChevronRight size={16} strokeWidth={2} className={styles.listRowChevron} />
              </button>
              {bucketPickerOpen && (
                <div className={styles.expandPanel}>
                  {buckets.map((bucket) => (
                    <button
                      key={bucket.id}
                      type="button"
                      className={`${styles.optionRow} ${bucketId === bucket.id ? styles.optionRowActive : ''}`}
                      onClick={() => {
                        setBucketId(bucket.id);
                        setBucketPickerOpen(false);
                      }}
                    >
                      {bucket.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className={styles.listGroup}>
            <button type="button" className={styles.listRow} onClick={() => setColorPickerOpen((c) => !c)}>
              <span className={styles.listRowIcon}>
                <Palette size={16} strokeWidth={2} />
              </span>
              <span className={styles.listRowLabel}>{strings.createProject.colorLabel}</span>
              <span className={styles.listRowSwatch} style={{ background: color }} />
              <ChevronRight size={16} strokeWidth={2} className={styles.listRowChevron} />
            </button>
            {colorPickerOpen && (
              <div className={styles.expandPanel}>
                <div className={styles.colorGrid}>
                  {PROJECT_COLORS.map((swatch) => (
                    <button
                      key={swatch}
                      type="button"
                      className={`${styles.colorSwatch} ${color === swatch ? styles.colorSwatchActive : ''}`}
                      style={{ background: swatch }}
                      aria-label={swatch}
                      onClick={() => {
                        setColor(swatch);
                        setColorPickerOpen(false);
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className={styles.listGroup}>
            <button type="button" className={styles.listRow} onClick={() => setPriorityPickerOpen((c) => !c)}>
              <span className={styles.listRowIcon}>
                <AlertTriangle size={16} strokeWidth={2} />
              </span>
              <span className={styles.listRowLabel}>Priority</span>
              <span className={styles.listRowValue}>{priority}</span>
              <ChevronRight size={16} strokeWidth={2} className={styles.listRowChevron} />
            </button>
            {priorityPickerOpen && (
              <div className={styles.expandPanel}>
                <div className={styles.chipGroup}>
                  {PRIORITY_LEVELS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={`${styles.chip} ${priority === option ? styles.chipActive : ''}`}
                      onClick={() => {
                        setPriority(option);
                        setPriorityPickerOpen(false);
                      }}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className={styles.listGroup}>
            <button type="button" className={styles.listRow} onClick={() => setDatePickerOpen((c) => !c)}>
              <span className={styles.listRowIcon}>
                <CalendarDays size={16} strokeWidth={2} />
              </span>
              <span className={styles.listRowLabel}>Timeline</span>
              <span className={styles.listRowValue}>
                {startDate && endDate
                  ? `${formatDateOnly(startDate)} - ${formatDateOnly(endDate)}`
                  : startDate
                    ? formatDateOnly(startDate)
                    : 'Select dates'}
              </span>
              <ChevronRight size={16} strokeWidth={2} className={styles.listRowChevron} />
            </button>
            {datePickerOpen && (
              <div className={styles.expandPanel}>
                <HeroRangeCalendar.Root
                  focusedValue={parseDate(toDateOnly(dateMonthCursor))}
                  onFocusChange={(next) => setDateMonthCursor(new Date(next.year, next.month - 1, next.day))}
                  value={startDate && endDate ? { start: parseDate(startDate), end: parseDate(endDate) } : null}
                  onChange={(next) => {
                    if (next) {
                      setStartDate(next.start.toString());
                      setEndDate(next.end.toString());
                      setDatePickerOpen(false);
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
              </div>
            )}
          </div>

          {saveError && <p className={styles.errorText}>{saveError}</p>}
        </div>
      )}
    </div>
  );
}
