'use client';

// Edit section, on the form standard (FormFrame): Area (fixed), Name and
// emoji, Color, Description; archiving under the button.

import { useState } from 'react';
import { useLogic } from '@/src/logic/sectionEdit/useLogic';
import { EmojiPicker } from '@/src/widgets/EmojiPicker/EmojiPicker';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { ConfirmDialog } from '@/src/widgets/ConfirmDialog/ConfirmDialog';
import { ColorSheet, cardFormStyles as cf } from '@/src/widgets/CardForm/CardForm';
import { FieldCard, FieldRow, FormFrame, PickerField, formFrameStyles as ff } from '@/src/widgets/FormFrame/FormFrame';

export function SectionEditScreen({ bucketId }: { bucketId: string }) {
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const v = useLogic(bucketId);
  const ready = !v.loading && !v.error && v.section;

  return (
    <FormFrame
      title="Edit section"
      context={v.area ? `In ${v.area.name}` : undefined}
      onClose={v.goBack}
      phoneHeader="bar"
      primary={ready ? { label: 'Save section', disabled: !v.name.trim() || !v.description.trim(), busy: v.saving } : null}
      onSubmit={v.handleSave}
      error={v.saveError}
      after={
        ready && v.section ? (
          v.section.isDefault ? (
            <p className={cf.muted}>This is the area&apos;s default section: projects without one of their own live in it, so it can&apos;t be archived.</p>
          ) : v.section.archived ? (
            <button type="button" className={cf.deleteLink} onClick={v.unarchiveBucket}>
              Unarchive section
            </button>
          ) : (
            <button type="button" className={cf.deleteLink} onClick={() => setConfirmArchive(true)}>
              Archive section
            </button>
          )
        ) : null
      }
      overlays={
        <>
          {confirmArchive && (
            <ConfirmDialog
              title="Archive this section?"
              message="Hides it from its area and the section picker. Its projects and tasks stay intact, and you can unarchive it later."
              confirmLabel="Archive section"
              cancelLabel="Cancel"
              onCancel={() => setConfirmArchive(false)}
              onConfirm={() => {
                v.archiveBucket();
                setConfirmArchive(false);
              }}
            />
          )}
          {colorOpen && <ColorSheet value={v.color} onChange={v.setColor} onClose={() => setColorOpen(false)} />}
        </>
      }
    >
      <ScreenState loading={v.loading} error={v.error} />
      {ready && (
        <>
          {v.area && (
            <FieldCard label="Area">
              <span className={cf.value}>{v.area.name}</span>
            </FieldCard>
          )}
          <FieldCard label="Name">
            <input className={ff.input} value={v.name} onChange={(event) => v.setName(event.target.value)} placeholder="Section name" />
          </FieldCard>
          <FieldRow>
            <PickerField label="Color" onClick={() => setColorOpen(true)}>
              <span className={cf.swatchValue} style={{ background: v.color }} aria-hidden />
            </PickerField>
            <div className={`${cf.card} ${cf.emojiCard}`}>
              <span className={cf.label}>Emoji</span>
              <EmojiPicker value={v.emoji} onChange={v.setEmoji} label="Section emoji" noneLabel="No emoji" />
            </div>
          </FieldRow>
          <FieldCard label="Description">
            <textarea className={ff.input} rows={3} value={v.description} onChange={(event) => v.setDescription(event.target.value)} placeholder="What this section holds" />
          </FieldCard>
        </>
      )}
    </FormFrame>
  );
}
