'use client';

import { ChevronLeft, Pencil, Plus, Trash2 } from 'lucide-react';
import { useLogic } from '@/src/logic/transactionTemplates/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { ConfirmDialog } from '@/src/widgets/ConfirmDialog/ConfirmDialog';
import { ActionMenu } from '@/src/widgets/ActionMenu/ActionMenu';
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
          {templates.map((template) => {
            const account = accountLabel(template);
            return (
              // A plain div, not a button — the ActionMenu trigger below is
              // a real, separately-clickable descendant (its own onClick
              // already stops propagation), and a <button> can't legally
              // contain another <button>. Keyboard/AT users still get the
              // same "apply" action via role="button" + tabIndex.
              <div
                key={template.id}
                className={styles.templateCard}
                role="button"
                tabIndex={0}
                onClick={() => applyTemplate(template.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    applyTemplate(template.id);
                  }
                }}
              >
                <div className={styles.templateCardHeader}>
                  <span className={styles.templateName}>{template.name}</span>
                  {/* ActionMenu's own trigger stops propagation, but its
                      popover items don't — wrapped here so picking Edit or
                      Delete can't also bubble up into this card's own
                      onClick and apply the template on top of it. */}
                  <div onClick={(event) => event.stopPropagation()}>
                    <ActionMenu
                      ariaLabel={strings.transactionTemplates.actionsCta}
                      triggerClassName={styles.iconButton}
                      items={[
                        {
                          key: 'edit',
                          label: strings.transactionTemplates.editCta,
                          icon: <Pencil size={14} strokeWidth={2} />,
                          onSelect: () => openEditTemplate(template.id),
                        },
                        {
                          key: 'delete',
                          label: strings.transactionTemplates.deleteCta,
                          icon: <Trash2 size={14} strokeWidth={2} />,
                          onSelect: () => requestDelete(template.id),
                          danger: true,
                        },
                      ]}
                    />
                  </div>
                </div>

                <div className={styles.templateTagRow}>
                  <div className={styles.templateLeft}>
                    {template.description && (
                      <span className={styles.templateDescription}>{template.description}</span>
                    )}
                    <div className={styles.templateBadges}>
                      <span className={styles.typeTag}>{TYPE_LABEL[template.type]}</span>
                      <span className={styles.categoryTag}>{categoryLabel(template)}</span>
                      {account && <span className={styles.accountTag}>{account}</span>}
                    </div>
                  </div>
                  {template.amount != null && (
                    <span className={styles.templateAmount}>{template.amount.toLocaleString('en-US')}</span>
                  )}
                </div>
              </div>
            );
          })}
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
