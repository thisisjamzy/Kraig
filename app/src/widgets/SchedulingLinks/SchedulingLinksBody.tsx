'use client';

// Scheduling links, the page body (Dreda.figcraft `Calendar / Web /
// Scheduling links`): the links you have, each with an active switch, its
// availability in words, the URL with Copy and usage; then the create form.
// Side by side from 1024px, stacked below. The web screen and the phone
// screen each wrap it in their own header. UI only: src/logic/schedulingLinks.

import { Ellipsis } from 'lucide-react';
import {
  ATTACH_TO,
  BUFFERS,
  CALENDARS,
  DURATIONS,
  HOURS,
  WEEKDAY_LETTERS,
  WEEKDAY_NAMES,
  linkUrl,
  useLogic,
  type Weekday,
} from '@/src/logic/schedulingLinks/useLogic';
import { FieldCard, SelectField, formFrameStyles as ff } from '@/src/widgets/FormFrame/FormFrame';
import styles from './SchedulingLinks.module.css';

export { styles as schedulingLinksStyles };

export function SchedulingLinksBody() {
  const s = useLogic();
  return (
    <>
      <p className={styles.sub}>Send a link, they pick a slot, it lands in your calendar. Nobody needs an account here.</p>

      <div className={styles.columns}>
        <section className={styles.links} aria-label="Your scheduling links">
          {s.links.map((link) => (
            <article key={link.id} className={styles.linkCard} data-paused={link.active ? undefined : ''}>
              <div className={styles.head}>
                <h2 className={styles.name}>{link.name}</h2>
                {link.active ? null : <span className={styles.state}>Paused</span>}
                <input
                  type="checkbox"
                  role="switch"
                  className={ff.switch}
                  checked={link.active}
                  onChange={(e) => s.setActive(link.id, e.target.checked)}
                  aria-label={`${link.name} is ${link.active ? 'on' : 'paused'}`}
                />
                <button type="button" className={styles.iconButton} aria-label={`More for ${link.name}`}>
                  <Ellipsis size={20} strokeWidth={2} />
                </button>
              </div>
              <p className={styles.meta}>{link.availability}</p>
              {link.active && (
                <div className={styles.url}>
                  <span className={styles.urlText}>{linkUrl(s.handle, link.slug)}</span>
                  <button type="button" className={styles.copy} onClick={() => s.copy(link)}>
                    Copy
                  </button>
                </div>
              )}
              {link.active && link.usage && <p className={styles.stats}>{link.usage}</p>}
            </article>
          ))}
        </section>

        <form
          className={styles.newLink}
          onSubmit={(e) => {
            e.preventDefault();
            s.createAndCopy();
          }}
        >
          <h2 className={styles.formTitle}>New scheduling link</h2>

          <FieldCard label="What is it called">
            <input className={ff.input} value={s.draft.name} placeholder="Quick call" onChange={(e) => s.update('name', e.target.value)} />
          </FieldCard>

          <div className={styles.row}>
            <SelectField label="How long" value={s.draft.duration} options={DURATIONS} onChange={(v) => s.update('duration', v)} />
            <SelectField label="Gap between" value={s.draft.buffer} options={BUFFERS} onChange={(v) => s.update('buffer', v)} />
          </div>

          <fieldset className={styles.daysField}>
            <legend className={styles.label}>Which days</legend>
            <div className={styles.days}>
              {WEEKDAY_LETTERS.map((letter, i) => {
                const day = i as Weekday;
                const on = s.draft.days.includes(day);
                return (
                  <button
                    key={WEEKDAY_NAMES[i]}
                    type="button"
                    className={styles.day}
                    data-on={on || undefined}
                    aria-pressed={on}
                    aria-label={WEEKDAY_NAMES[i]}
                    onClick={() => s.toggleDay(day)}
                  >
                    {letter}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className={styles.row}>
            <SelectField label="From" value={s.draft.from} options={HOURS} onChange={(v) => s.update('from', v)} />
            <SelectField label="To" value={s.draft.to} options={HOURS} onChange={(v) => s.update('to', v)} />
          </div>

          <SelectField label="Where it lands" value={s.draft.calendar} options={CALENDARS} onChange={(v) => s.update('calendar', v)} />
          <SelectField label="What it attaches to" value={s.draft.attachTo} options={ATTACH_TO} onChange={(v) => s.update('attachTo', v)} />

          <FieldCard label="What they see when they book">
            <textarea
              className={ff.input}
              rows={2}
              value={s.draft.confirmation}
              placeholder="Thanks, I will call you on this number."
              onChange={(e) => s.update('confirmation', e.target.value)}
            />
          </FieldCard>

          <div className={styles.preview}>
            <span className={styles.label}>The link they get</span>
            <span className={styles.previewUrl}>{s.previewUrl}</span>
          </div>

          <div className={styles.actions}>
            <button type="button" className={styles.secondary} onClick={s.reset}>
              Cancel
            </button>
            <button type="submit" className={styles.primary} disabled={!s.canCreate}>
              Create and copy
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
