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
      title="Edit folder"
      context={v.area ? `In ${v.area.name}` : undefined}
      onClose={v.goBack}
      phoneHeader="bar"
      primary={ready ? { label: 'Save folder', disabled: !v.name.trim() || !v.description.trim(), busy: v.saving } : null}
      onSubmit={v.handleSave}
      error={v.saveError}
      after={
        ready && v.section ? (
          v.section.isDefault ? (
            <p className={cf.muted}>This is the area&apos;s default folder: projects without one of their own live in it, so it can&apos;t be archived.</p>
          ) : v.section.archived ? (
            <button type="button" className={cf.deleteLink} onClick={v.unarchiveBucket}>
              Unarchive folder
            </button>
          ) : (
            <button type="button" className={cf.deleteLink} onClick={() => setConfirmArchive(true)}>
              Archive folder
            </button>
          )
        ) : null
      }
      overlays={
        <>
          {confirmArchive && (
            <ConfirmDialog
              title="Archive this folder?"
              message="Its projects and tasks go to the archive together and stop showing up in Work. You can restore the whole folder from Library later."
              confirmLabel="Archive folder"
              cancelLabel="Cancel"
              tone="neutral"
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
            <input className={ff.input} value={v.name} onChange={(event) => v.setName(event.target.value)} placeholder="Folder name" />
          </FieldCard>
          <FieldRow>
            <PickerField label="Color" onClick={() => setColorOpen(true)}>
              <span className={cf.swatchValue} style={{ background: v.color }} aria-hidden />
            </PickerField>
            <div className={`${cf.card} ${cf.emojiCard}`}>
              <span className={cf.label}>Emoji</span>
              <EmojiPicker value={v.emoji} onChange={v.setEmoji} label="Folder emoji" noneLabel="No emoji" />
            </div>
          </FieldRow>
          <FieldCard label="Description">
            <textarea className={ff.input} rows={3} value={v.description} onChange={(event) => v.setDescription(event.target.value)} placeholder="What this folder holds" />
          </FieldCard>
        </>
      )}
    </FormFrame>
  );
}
