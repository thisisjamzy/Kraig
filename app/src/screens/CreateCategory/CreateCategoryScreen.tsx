'use client';

// New category, on the form standard (FormFrame): Name, Type, Description.

import { useLogic, CATEGORY_TYPES } from '@/src/logic/createCategory/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { FieldCard, FormFrame, SegmentedField, formFrameStyles as ff } from '@/src/widgets/FormFrame/FormFrame';

export function CreateCategoryScreen() {
  const strings = useStrings();
  const { name, setName, type, setType, description, setDescription, saving, error, handleSave, goBack } = useLogic();

  return (
    <FormFrame
      title="New category"
      onClose={goBack}
      phoneHeader="bar"
      primary={{ label: 'Add category', disabled: !name.trim(), busy: saving }}
      onSubmit={handleSave}
      error={error}
    >
      <FieldCard label={strings.createCategory.nameLabel}>
        <input className={ff.input} value={name} onChange={(event) => setName(event.target.value)} placeholder={strings.createCategory.namePlaceholder} autoFocus />
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
    </FormFrame>
  );
}
