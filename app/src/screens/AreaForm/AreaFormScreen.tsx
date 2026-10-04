'use client';

// New / edit area — one card-style form for both (src/widgets/CardForm),
// same look as New task. Editing adds archiving (or restoring) the area.

import { useState } from 'react';
import { useLogic } from '@/src/logic/areaForm/useLogic';
import { ConfirmDialog } from '@/src/widgets/ConfirmDialog/ConfirmDialog';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { EmojiPicker } from '@/src/widgets/EmojiPicker/EmojiPicker';
import {
  ColorSheet,
  FieldCard,
  PickerCard,
  cardFormStyles as styles,
} from '@/src/widgets/CardForm/CardForm';
import { FormFrame } from '@/src/widgets/FormFrame/FormFrame';

export function AreaFormScreen({ areaId }: { areaId?: string }) {
  const {
    isEditing,
    archived,
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
    archiveArea,
    unarchiveArea,
    goBack,
    loading,
    notFound,
  } = useLogic(areaId);
  const [colorOpen, setColorOpen] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);

  const content = (
    <FormFrame
      title={isEditing ? 'Edit area' : 'New area'}
      onClose={goBack}
      primary={{ label: isEditing ? 'Save area' : 'Add area', disabled: !isValid, busy: saving }}
      onSubmit={handleSave}
      error={saveError}
      after={isEditing ? (
        <button type="button" className={styles.deleteLink} onClick={() => (archived ? unarchiveArea() : setConfirmArchive(true))}>
              {archived ? 'Unarchive area' : 'Archive area'}
            </button>
      ) : null}
      overlays={
        <>
          {confirmArchive && (
            <ConfirmDialog
              title="Archive this area?"
              message="Hides it from your Areas tab and the area picker. Its projects and tasks stay intact, and you can unarchive it later."
              confirmLabel="Archive area"
              cancelLabel="Keep it"
              onCancel={() => setConfirmArchive(false)}
              onConfirm={() => {
                archiveArea();
                setConfirmArchive(false);
              }}
            />
          )}

          {colorOpen && <ColorSheet value={color} onChange={setColor} onClose={() => setColorOpen(false)} />}
        </>
      }
    >
      <ScreenState loading={loading} error={notFound ? 'This area could not be found.' : null} />

      {!loading && !notFound && (
        <>
          <FieldCard label="Name">
            <input
              className={styles.valueInput}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Home"
              autoFocus
            />
          </FieldCard>

          <FieldCard label="What does this area cover?">
            <textarea
              className={styles.notesInput}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Description"
              rows={2}
            />
          </FieldCard>

          <div className={styles.row}>
            <PickerCard label="Color" onClick={() => setColorOpen(true)}>
              <span className={styles.swatchValue} style={{ background: color }} aria-hidden />
            </PickerCard>
            <div className={`${styles.card} ${styles.emojiCard}`}>
              <span className={styles.label}>Emoji</span>
              <EmojiPicker value={emoji} onChange={setEmoji} label="Area emoji" noneLabel="No emoji" />
            </div>
          </div>
        </>
      )}
    </FormFrame>
  );

  return content;
}
