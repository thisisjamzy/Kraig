'use client';

// New section — the app's card-style create form (src/widgets/CardForm),
// same look as New task. A section always belongs to the area it was opened
// from, shown here as a fixed (non-picker) card.

import { useState } from 'react';
import { useLogic } from '@/src/logic/createSection/useLogic';
import { EmojiPicker } from '@/src/widgets/EmojiPicker/EmojiPicker';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import {
  ColorSheet,
  FieldCard,
  PickerCard,
  cardFormStyles as styles,
} from '@/src/widgets/CardForm/CardForm';
import { FormFrame } from '@/src/widgets/FormFrame/FormFrame';

export function CreateSectionScreen({ areaId }: { areaId: string }) {
  const {
    area,
    hasAreaId,
    name,
    setName,
    emoji,
    setEmoji,
    color,
    setColor,
    description,
    setDescription,
    isValid,
    saving,
    saveError,
    handleSave,
    goBack,
    loading,
    error,
  } = useLogic(areaId);
  const [colorOpen, setColorOpen] = useState(false);

  const content = (
    <FormFrame
      title="New section"
      onClose={goBack}
      primary={{ label: 'Add section', disabled: !isValid, busy: saving }}
      onSubmit={handleSave}
      error={saveError}
      overlays={
        <>
          {colorOpen && <ColorSheet value={color} onChange={setColor} onClose={() => setColorOpen(false)} />}
        </>
      }
    >
      <ScreenState loading={loading} error={error} />

      {!hasAreaId && !loading && (
        <p className={styles.formError}>A section needs an area, open it from that area&apos;s own page.</p>
      )}

      {hasAreaId && !loading && !error && (
        <>
          <FieldCard label="Name">
            <input
              className={styles.valueInput}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Kitchen renovation"
              autoFocus
            />
          </FieldCard>

          <FieldCard label="What goes in this section?">
            <textarea
              className={styles.notesInput}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Description"
              rows={2}
            />
          </FieldCard>

          {area && (
            <div className={styles.card}>
              <span className={styles.label}>Area</span>
              <span className={styles.value}>{area.name}</span>
            </div>
          )}

          <div className={styles.row}>
            <PickerCard label="Color" onClick={() => setColorOpen(true)}>
              <span className={styles.swatchValue} style={{ background: color }} aria-hidden />
            </PickerCard>
            <div className={`${styles.card} ${styles.emojiCard}`}>
              <span className={styles.label}>Emoji</span>
              <EmojiPicker value={emoji} onChange={setEmoji} label="Section emoji" noneLabel="No emoji" />
            </div>
          </div>
        </>
      )}
    </FormFrame>
  );

  return content;
}
