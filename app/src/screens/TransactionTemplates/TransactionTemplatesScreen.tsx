'use client';

import { ChevronLeft, Pencil, Plus, Trash2 } from 'lucide-react';
import { useLogic } from '@/src/logic/transactionTemplates/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { ConfirmDialog } from '@/src/widgets/ConfirmDialog/ConfirmDialog';
import styles from './TransactionTemplatesScreen.module.css';

const TYPE_LABEL: Record<string, string> = {
  expense: 'Expense',
  income: 'Income',
  transfer: 'Transfer',
  savings: 'Savings',
};

export function TransactionTemplatesScreen() {
  const strings = useStrings();
  const {
    templates,
    categoryLabel,
    accountLabel,
    applyTemplate,
    openNewTemplate,
    openEditTemplate,
    goBack,
    loading,
    error,

    pendingDeleteId,
    requestDelete,
    cancelDelete,
    confirmDelete,
    deleting,
    deleteError,
  } = useLogic();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={goBack} aria-label="Back">
          <ChevronLeft size={18} strokeWidth={2} />
        </button>
        <h1 className={styles.title}>{strings.transactionTemplates.title}</h1>
      </header>

      <p className={styles.hintText}>{strings.transactionTemplates.hint}</p>

      <ScreenState loading={loading} error={error} />

      {!loading && !error && templates.length === 0 && (
        <p className={styles.emptyText}>{strings.transactionTemplates.empty}</p>
      )}

      {!loading && !error && templates.length > 0 && (
        <div className={styles.templateList}>
          {templates.map((template) => (
            <div key={template.id} className={styles.templateRow}>
              <button type="button" className={styles.templateApply} onClick={() => applyTemplate(template.id)}>
                <span className={styles.templateName}>{template.name}</span>
                <span className={styles.templateMeta}>
                  <span className={styles.typeTag}>{TYPE_LABEL[template.type]}</span>
                  {categoryLabel(template)}
                  {accountLabel(template) && ` · ${accountLabel(template)}`}
                  {template.amount != null && ` · ${template.amount.toLocaleString('en-US')}`}
                </span>
              </button>
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => openEditTemplate(template.id)}
                aria-label={strings.transactionTemplates.editCta}
              >
                <Pencil size={14} strokeWidth={2} />
              </button>
              <button
                type="button"
                className={styles.iconButtonDanger}
                onClick={() => requestDelete(template.id)}
                aria-label={strings.transactionTemplates.deleteCta}
              >
                <Trash2 size={14} strokeWidth={2} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className={styles.fabRow}>
        <button type="button" className={styles.fab} onClick={openNewTemplate} aria-label={strings.transactionTemplates.createCta}>
          <Plus size={24} strokeWidth={2.25} />
        </button>
      </div>

      {pendingDeleteId && (
        <ConfirmDialog
          title={strings.transactionTemplates.deleteConfirmTitle}
          message={strings.transactionTemplates.deleteConfirmMessage}
          confirmLabel={deleting ? strings.transactionTemplates.deleting : strings.transactionTemplates.deleteCta}
          cancelLabel={strings.common.cancel}
          onConfirm={confirmDelete}
          onCancel={cancelDelete}
        />
      )}
      {deleteError && <p className={styles.errorText}>{deleteError}</p>}
    </div>
  );
}
