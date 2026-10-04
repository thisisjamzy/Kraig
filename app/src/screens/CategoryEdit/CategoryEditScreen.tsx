'use client';

// Edit category, on the form standard (FormFrame): Name, Type, Description.

import { useLogic, CATEGORY_TYPES } from '@/src/logic/categoryEdit/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { FieldCard, FormFrame, SegmentedField, formFrameStyles as ff } from '@/src/widgets/FormFrame/FormFrame';

export function CategoryEditScreen({ categoryId }: { categoryId: string }) {
  const strings = useStrings();
  const { name, setName, type, setType, description, setDescription, saving, saveError, handleSave, goBack, loading, error } = useLogic(categoryId);

  return (
    <FormFrame
      title={strings.categories.editTitle}
      onClose={goBack}
      phoneHeader="bar"
      primary={loading || error ? null : { label: 'Save category', disabled: !name.trim(), busy: saving }}
      onSubmit={handleSave}
      error={saveError}
    >
      <ScreenState loading={loading} error={error} />
      {!loading && !error && (
        <>
          <FieldCard label={strings.createCategory.nameLabel}>
            <input className={ff.input} value={name} onChange={(event) => setName(event.target.value)} placeholder={strings.createCategory.namePlaceholder} />
          </FieldCard>
          <SegmentedField
            label={strings.createCategory.typeLabel}
            value={type}
            onChange={setType}
            options={CATEGORY_TYPES.map((option) => ({ value: option, label: strings.budget.typeLabels[option] }))}
          />
          <FieldCard label="Description">
            <textarea
              className={ff.input}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={strings.createCategory.descriptionPlaceholder}
              rows={3}
            />
          </FieldCard>
        </>
      )}
    </FormFrame>
  );
}
