'use client';

import { useState } from 'react';
import { ChevronLeft, Trash2, CheckCircle2, XCircle } from 'lucide-react';
import { Modal } from '@/src/widgets/Modal/Modal';
import { ConfirmDialog } from '@/src/widgets/ConfirmDialog/ConfirmDialog';
import { useLogic } from '@/src/logic/goalDetail/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { formatAmount } from '@/src/screens/Goals/GoalsScreen';
import styles from './GoalDetailScreen.module.css';

export function GoalDetailScreen({ goalId }: { goalId: string }) {
  const strings = useStrings();
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [confirmDeleteItemId, setConfirmDeleteItemId] = useState<string | null>(null);
  const {
    goal,
    currency,
    lineItems,
    amountCompleted,
    amountRemaining,
    percent,
    deadline,
    accounts,
    categories,

    addOpen,
    setAddOpen,
    openAdd,
    itemName,
    setItemName,
    itemDescription,
    setItemDescription,
    itemAmount,
    setItemAmount,
    savingItem,
    itemError,
    handleAddLineItem,
    handleDeleteLineItem,

    completeItemId,
    openMarkComplete,
    closeMarkComplete,
    completeAccountId,
    setCompleteAccountId,
    completeCategoryId,
    setCompleteCategoryId,
    completeDate,
    setCompleteDate,
    completeDescription,
    setCompleteDescription,
    completing,
    completeError,
    handleMarkComplete,

    archiveGoal,
    goBack,
    loading,
    error,
  } = useLogic(goalId);

  const completingItem = lineItems.find((item) => item.id === completeItemId) ?? null;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={goBack} aria-label={strings.goalDetail.backLabel}>
          <ChevronLeft size={18} strokeWidth={2} />
        </button>
        <h1 className={styles.title}>{strings.goalDetail.headerTitle}</h1>
        {goal && (
          <button
            type="button"
            className={styles.archiveButton}
            onClick={() => setConfirmArchive(true)}
            aria-label={strings.goalDetail.archiveGoal}
          >
            <Trash2 size={14} strokeWidth={1.75} />
          </button>
        )}
      </header>

      {goal && <p className={styles.goalName}>{goal.name}</p>}

      <ScreenState loading={loading} error={error} />

      {!loading && !error && goal && (
        <>
          <div className={styles.progressCard}>
            <p className={styles.progressHeadline}>
              {goal.completedLineItemCount} / {goal.lineItemCount} {strings.goals.itemsDone} ({percent}%)
            </p>
            <div className={styles.track}>
              <div className={styles.fill} style={{ width: `${percent}%` }} />
            </div>
            <div className={styles.amountRow}>
              <span className={styles.amountValue}>
                {formatAmount(amountCompleted)} {currency}
              </span>
              <span className={styles.amountValue}>
                {formatAmount(amountRemaining)} {currency}
              </span>
            </div>
            {deadline && (
              <p className={styles.deadlineRow}>
                {strings.goalDetail.deadlinePrefix}{' '}
                {deadline.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })}
              </p>
            )}
          </div>

          <div className={styles.sectionTitleRow}>
            <h2 className={styles.sectionTitle}>{strings.goalDetail.lineItemsTitle}</h2>
            <button type="button" className={styles.addLink} onClick={openAdd}>
              {strings.goalDetail.addLineItem}
            </button>
          </div>

          {lineItems.length === 0 ? (
            <p className={styles.emptyText}>{strings.goalDetail.emptyLineItems}</p>
          ) : (
            <div className={styles.list}>
              {lineItems.map((item) => (
                <div key={item.id} className={styles.lineItem}>
                  <div className={styles.lineItemHeaderRow}>
                    <div>
                      <p className={styles.lineItemName}>{item.name}</p>
                      <p className={styles.lineItemAmount}>
                        {formatAmount(item.amount)} {currency}
                      </p>
                    </div>
                    {item.completed && <span className={styles.doneTag}>{strings.goalDetail.completedTag}</span>}
                  </div>

                  {!item.completed && (
                    <>
                      <div className={`${styles.statusRow} ${item.hasFunds ? styles.statusOk : styles.statusShort}`}>
                        {item.hasFunds ? <CheckCircle2 size={14} strokeWidth={2} /> : <XCircle size={14} strokeWidth={2} />}
                        <span>
                          {item.hasFunds
                            ? strings.goalDetail.frozenAvailable
                            : `${strings.goalDetail.frozenInsufficient} (${formatAmount(item.shortfall)} ${currency})`}
                        </span>
                      </div>
                      <div className={styles.lineItemActionsRow}>
                        <button
                          type="button"
                          className={styles.deleteLink}
                          onClick={() => setConfirmDeleteItemId(item.id)}
                        >
                          {strings.goalDetail.deleteLineItem}
                        </button>
                        <button type="button" className={styles.payButton} onClick={() => openMarkComplete(item)}>
                          {strings.goalDetail.markComplete}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {addOpen && (
        <Modal title={strings.goalDetail.addLineItem} onClose={() => setAddOpen(false)}>
          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="line-item-name">
              {strings.goalDetail.nameLabel}
            </label>
            <input
              id="line-item-name"
              className={styles.formInput}
              value={itemName}
              onChange={(event) => setItemName(event.target.value)}
            />
          </div>
          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="line-item-amount">
              {strings.goalDetail.amountLabel}
            </label>
            <input
              id="line-item-amount"
              className={styles.formInput}
              inputMode="numeric"
              value={itemAmount}
              onChange={(event) => setItemAmount(event.target.value.replace(/[^0-9.]/g, ''))}
              placeholder="0"
            />
          </div>
          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="line-item-description">
              {strings.goalDetail.descriptionLabel}
            </label>
            <textarea
              id="line-item-description"
              className={styles.formTextarea}
              rows={2}
              value={itemDescription}
              onChange={(event) => setItemDescription(event.target.value)}
            />
          </div>
          {itemError && <p className={styles.errorText}>{itemError}</p>}
          <button
            type="button"
            className={styles.modalSaveButton}
            disabled={!itemName.trim() || !itemAmount || savingItem}
            onClick={handleAddLineItem}
          >
            {savingItem ? strings.goalDetail.saving : strings.goalDetail.save}
          </button>
        </Modal>
      )}

      {completingItem && (
        <Modal title={strings.markLineItemComplete.title} onClose={closeMarkComplete}>
          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="complete-account">
              {strings.markLineItemComplete.accountLabel}
            </label>
            <select
              id="complete-account"
              className={styles.formInput}
              value={completeAccountId}
              onChange={(event) => setCompleteAccountId(event.target.value)}
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="complete-category">
              {strings.markLineItemComplete.categoryLabel}
            </label>
            <select
              id="complete-category"
              className={styles.formInput}
              value={completeCategoryId}
              onChange={(event) => setCompleteCategoryId(event.target.value)}
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="complete-date">
              {strings.markLineItemComplete.dateLabel}
            </label>
            <input
              id="complete-date"
              type="date"
              className={styles.formInput}
              value={completeDate}
              onChange={(event) => setCompleteDate(event.target.value)}
            />
          </div>
          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="complete-description">
              {strings.markLineItemComplete.descriptionLabel}
            </label>
            <input
              id="complete-description"
              className={styles.formInput}
              value={completeDescription}
              onChange={(event) => setCompleteDescription(event.target.value)}
            />
          </div>
          {completingItem && !completingItem.hasFunds && (
            <p className={styles.errorText}>{strings.markLineItemComplete.frozenBlocked}</p>
          )}
          {completeError && <p className={styles.errorText}>{completeError}</p>}
          <button
            type="button"
            className={styles.modalSaveButton}
            disabled={!completeAccountId || completing}
            onClick={handleMarkComplete}
          >
            {completing ? strings.markLineItemComplete.saving : strings.markLineItemComplete.save}
          </button>
        </Modal>
      )}

      {confirmArchive && (
        <ConfirmDialog
          title={strings.goals.archiveGoalConfirmTitle}
          message={strings.goals.archiveGoalConfirmMessage}
          confirmLabel={strings.goalDetail.archiveGoal}
          cancelLabel={strings.common.cancel}
          onConfirm={() => {
            setConfirmArchive(false);
            archiveGoal();
          }}
          onCancel={() => setConfirmArchive(false)}
        />
      )}

      {confirmDeleteItemId && (
        <ConfirmDialog
          title={strings.goalDetail.deleteLineItemConfirmTitle}
          message={strings.goalDetail.deleteLineItemConfirmMessage}
          confirmLabel={strings.goalDetail.deleteLineItem}
          cancelLabel={strings.common.cancel}
          onConfirm={() => {
            handleDeleteLineItem(confirmDeleteItemId);
            setConfirmDeleteItemId(null);
          }}
          onCancel={() => setConfirmDeleteItemId(null)}
        />
      )}
    </div>
  );
}
