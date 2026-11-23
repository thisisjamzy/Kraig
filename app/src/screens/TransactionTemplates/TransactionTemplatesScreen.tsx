'use client';

import { Archive, ArchiveRestore, ChevronLeft, Pencil, Plus, Trash2 } from 'lucide-react';
import { repeatText } from '@/src/viewmodels/templates';
import type { FirestoreTransactionTemplate } from '@/src/shared/firestore/types';
import { useLogic } from '@/src/logic/transactionTemplates/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { ConfirmDialog } from '@/src/widgets/ConfirmDialog/ConfirmDialog';
import { ActionMenu } from '@/src/widgets/ActionMenu/ActionMenu';
import { ScreenHeader } from '@/src/widgets/ScreenHeader/ScreenHeader';
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
    groups,
    archived,
    setArchived,
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

  function renderCard(template: FirestoreTransactionTemplate) {
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
                        template.archived
                          ? { key: 'restore', label: 'Bring back', icon: <ArchiveRestore size={14} strokeWidth={2} />, onSelect: () => void setArchived(template.id, false) }
                          : { key: 'archive', label: 'Archive', icon: <Archive size={14} strokeWidth={2} />, onSelect: () => void setArchived(template.id, true) },
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
                      {repeatText(template) && <span className={styles.accountTag}>{repeatText(template)}</span>}
                    </div>
                  </div>
                  {template.amount != null && (
                    <span className={styles.templateAmount}>{template.amount.toLocaleString('en-US')}</span>
                  )}
                </div>
              </div>
            );
  }

  return (
    <div className={styles.page}>
      <ScreenHeader
        left={
          <button type="button" className={styles.backButton} onClick={goBack} aria-label="Back">
            <ChevronLeft size={18} strokeWidth={2} />
          </button>
        }
        title={strings.transactionTemplates.title}
      />

      <p className={styles.hintText}>{strings.transactionTemplates.hint}</p>

      <ScreenState loading={loading} error={error} />

      {!loading && !error && templates.length === 0 && (
        <p className={styles.emptyText}>{strings.transactionTemplates.empty}</p>
      )}

      {!loading && !error && groups.map((g) => (
        <section key={g.repeat} className={styles.group} aria-label={g.label}>
          <h2 className={styles.groupTitle}>
            {g.label} <span>{g.templates.length}</span>
          </h2>
          <div className={styles.templateList}>{g.templates.map((template) => renderCard(template))}</div>
        </section>
      ))}

      {!loading && !error && archived.length > 0 && (
        <details className={styles.group}>
          <summary className={styles.groupTitle}>
            Archived <span>{archived.length}</span>
          </summary>
          <div className={styles.templateList}>{archived.map((template) => renderCard(template))}</div>
        </details>
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
