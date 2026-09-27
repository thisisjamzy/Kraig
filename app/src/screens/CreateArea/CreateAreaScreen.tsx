'use client';

// New area — the app's card-style create form (src/widgets/CardForm), same
// look as New task.

import { useState } from 'react';
import { useLogic } from '@/src/logic/createArea/useLogic';
import { EmojiPicker } from '@/src/widgets/EmojiPicker/EmojiPicker';
import { WebFormPanel } from '@/src/widgets/WebFormPanel/WebFormPanel';
import { useIsWeb } from '@/src/shared/hooks/useViewportMode';
import {
  CardFormPage,
  ColorSheet,
  FieldCard,
  PickerCard,
  SubmitButton,
  cardFormStyles as styles,
} from '@/src/widgets/CardForm/CardForm';

export function CreateAreaScreen() {
  const { name, setName, emoji, setEmoji, color, setColor, description, setDescription, isValid, saving, saveError, handleSave, goBack } =
    useLogic();
  const [colorOpen, setColorOpen] = useState(false);
  const isWeb = useIsWeb();

  const content = (
    <CardFormPage title="New area" onClose={goBack}>
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

        {saveError && <p className={styles.formError}>{saveError}</p>}

        <SubmitButton disabled={!isValid || saving}>{saving ? 'Saving…' : '+ Add new area'}</SubmitButton>
      </form>

      {colorOpen && <ColorSheet value={color} onChange={setColor} onClose={() => setColorOpen(false)} />}
    </CardFormPage>
  );

  return isWeb ? <WebFormPanel onClose={goBack}>{content}</WebFormPanel> : content;
}
