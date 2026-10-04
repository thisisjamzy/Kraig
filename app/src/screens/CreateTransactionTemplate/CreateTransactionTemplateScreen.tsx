'use client';

// New and edit transaction template, on the form standard (FormFrame):
// Name, Amount, Type (and the savings mode), Category or kind, Account (or
// From | To, with charges for a transfer); More options: Description;
// Delete under the button.

import { useLogic } from '@/src/logic/createTransactionTemplate/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { ConfirmDialog } from '@/src/widgets/ConfirmDialog/ConfirmDialog';
import { cardFormStyles as cf } from '@/src/widgets/CardForm/CardForm';
import { FieldCard, FieldRow, FormFrame, MoreOptions, SegmentedField, SelectField, formFrameStyles as ff } from '@/src/widgets/FormFrame/FormFrame';
import type { TransactionTemplateType } from '@/src/shared/firestore/types';

const TYPE_LABEL: Record<TransactionTemplateType, string> = {
  expense: 'Expense',
  income: 'Income',
  transfer: 'Transfer',
  savings: 'Savings',
};

export function CreateTransactionTemplateScreen({ templateId }: { templateId?: string }) {
  const strings = useStrings();
  const t = strings.transactionTemplates;
  const v = useLogic(templateId);
  const ready = !v.loading && !v.error && !v.notFound;
  const accountChoices = (v.type === 'expense' ? v.spendableAccounts : v.accounts).map((a) => ({ value: a.id, label: a.name }));

  return (
    <FormFrame
      title={v.isEditing ? t.editTitle : t.createTitle}
      onClose={v.goBack}
      phoneHeader="bar"
      primary={ready ? { label: v.isEditing ? 'Save template' : 'Add template', disabled: !v.canSave, busy: v.saving } : null}
      onSubmit={v.handleSave}
      error={v.saveError}
      after={
        v.isEditing && ready ? (
          <>
            <button type="button" className={cf.deleteLink} onClick={v.openDeleteConfirm}>
              {t.deleteCta}
            </button>
            {v.deleteError && <p className={ff.fieldError}>{v.deleteError}</p>}
          </>
        ) : null
      }
      overlays={
        v.deleteConfirmOpen && (
          <ConfirmDialog
            title={t.deleteConfirmTitle}
            message={t.deleteConfirmMessage}
            confirmLabel={v.deleting ? t.deleting : t.deleteCta}
            cancelLabel={strings.common.cancel}
            onConfirm={v.confirmDelete}
            onCancel={v.cancelDelete}
          />
        )
      }
    >
      <ScreenState loading={v.loading} error={v.error} />
      {v.notFound && <p className={ff.error}>{t.notFound}</p>}
      {ready && (
        <>
          <FieldCard label={t.nameLabel}>
            <input className={ff.input} value={v.name} onChange={(event) => v.setName(event.target.value)} placeholder="Weekly groceries" autoFocus={!v.isEditing} />
          </FieldCard>
          <FieldCard label="Amount">
            <input className={ff.input} inputMode="decimal" value={v.amountString} onChange={(event) => v.setAmountString(event.target.value.replace(/[^0-9.]/g, ''))} placeholder={t.amountPlaceholder} />
          </FieldCard>
          <SegmentedField label="Type" value={v.type} onChange={v.setType} options={v.types.map((option) => ({ value: option, label: TYPE_LABEL[option] }))} />
          {v.type === 'savings' && (
            <SegmentedField
              label="Savings"
              value={v.savingsMode}
              onChange={v.setSavingsMode}
              options={[
                { value: 'moved', label: t.savingsModeMoved },
                { value: 'frozen', label: t.savingsModeFrozen },
              ]}
            />
          )}
          <SelectField
            label={v.isTransferLike ? t.kindLabel : t.categoryLabel}
            value={v.categoryId}
            onChange={v.setCategoryId}
            options={v.categoryOptions.map((option) => ({ value: option.id, label: option.name }))}
            placeholder="Choose one"
          />
          {v.isTransferLike ? (
            <FieldRow>
              <SelectField label={t.fromAccountLabel} value={v.accountId} onChange={v.setAccountId} options={accountChoices} placeholder="Choose" />
              <SelectField
                label={t.toAccountLabel}
                value={v.toAccountId}
                onChange={v.setToAccountId}
                options={v.accounts.filter((a) => a.id !== v.accountId).map((a) => ({ value: a.id, label: a.name }))}
                placeholder="Choose"
              />
            </FieldRow>
          ) : (
            <SelectField label={t.accountLabel} value={v.accountId} onChange={v.setAccountId} options={accountChoices} placeholder="Choose" />
          )}
          {v.isTransfer && (
            <FieldCard label={t.chargesLabel}>
              <input className={ff.input} inputMode="decimal" value={v.chargesString} onChange={(event) => v.setChargesString(event.target.value.replace(/[^0-9.]/g, ''))} placeholder="0" />
            </FieldCard>
          )}
          <MoreOptions defaultOpen={Boolean(v.description)}>
            <FieldCard label="Description">
              <textarea className={ff.input} rows={3} value={v.description} onChange={(event) => v.setDescription(event.target.value)} placeholder={t.descriptionLabel} />
            </FieldCard>
          </MoreOptions>
        </>
      )}
    </FormFrame>
  );
}
