'use client';

import { useState } from 'react';
import { ChevronLeft, Pencil, Trash2, CheckCircle2, Plus } from 'lucide-react';
import { Modal } from '@/src/widgets/Modal/Modal';
import { ConfirmDialog } from '@/src/widgets/ConfirmDialog/ConfirmDialog';
import { ActionMenu } from '@/src/widgets/ActionMenu/ActionMenu';
import { useLogic } from '@/src/logic/goalDetail/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { formatAmount } from '@/src/screens/Goals/GoalsScreen';
import { PRIORITY_LEVELS, NECESSITY_OPTIONS, NECESSITY_LABEL } from '@/src/viewmodels/projects';
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
    editingItemId,
    openEditItem,
    itemName,
    setItemName,
    itemDescription,
    setItemDescription,
    itemAmount,
    setItemAmount,
    itemPriority,
    setItemPriority,
    itemNecessity,
    setItemNecessity,
    savingItem,
    itemError,
    handleAddLineItem,
    handleDeleteLineItem,

    currencyOptions,
    goalEditOpen,
    setGoalEditOpen,
    openGoalEdit,
    goalName,
    setGoalName,
    goalDescription,
    setGoalDescription,
    goalDeadline,
    setGoalDeadline,
    goalCurrency,
    setGoalCurrency,
    savingGoal,
    goalSaveError,
    handleSaveGoal,

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
          <ActionMenu
            title={goal.name}
            ariaLabel={`Actions for ${goal.name}`}
            items={[
              {
                key: 'edit',
                label: strings.goalDetail.editGoal,
                icon: <Pencil size={16} strokeWidth={1.75} />,
                onSelect: openGoalEdit,
              },
              {
                key: 'archive',
                label: strings.goalDetail.archiveGoal,
                icon: <Trash2 size={16} strokeWidth={1.75} />,
                onSelect: () => setConfirmArchive(true),
                danger: true,
              },
            ]}
          />
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
            <button type="button" className={styles.addIconButton} onClick={openAdd} aria-label={strings.goalDetail.addLineItem}>
              <Plus size={16} strokeWidth={2.25} />
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
                      {!item.completed && (
                        <span className={item.hasFunds ? styles.fundsBadgeOk : styles.fundsBadgeShort}>
                          {item.hasFunds ? 'Possible' : 'Not possible'}
                        </span>
                      )}
                    </div>
                    {item.completed ? (
                      <span className={styles.doneTag}>{strings.goalDetail.completedTag}</span>
                    ) : (
                      <ActionMenu
                        title={item.name}
                        ariaLabel={`Actions for ${item.name}`}
                        items={[
                          {
                            key: 'complete',
                            label: strings.goalDetail.markComplete,
                            icon: <CheckCircle2 size={16} strokeWidth={1.75} />,
                            onSelect: () => openMarkComplete(item),
                          },
                          {
                            key: 'edit',
                            label: strings.goalDetail.editLineItem,
                            icon: <Pencil size={16} strokeWidth={1.75} />,
                            onSelect: () => openEditItem(item),
                          },
                          {
                            key: 'delete',
                            label: strings.goalDetail.deleteLineItem,
                            icon: <Trash2 size={16} strokeWidth={1.75} />,
                            onSelect: () => setConfirmDeleteItemId(item.id),
                            danger: true,
                          },
                        ]}
                      />
                    )}
                  </div>

                  <div className={styles.lineItemTagRow}>
                    <span className={styles.priorityTag}>{item.priority}</span>
                    <span className={item.necessity === 'MustHave' ? styles.necessityTagMust : styles.necessityTagNice}>
                      {NECESSITY_LABEL[item.necessity]}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {addOpen && (
        <Modal
          title={editingItemId ? strings.goalDetail.editLineItemTitle : strings.goalDetail.addLineItem}
          onClose={() => setAddOpen(false)}
        >
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
          <div className={styles.formField}>
            <span className={styles.formLabel}>Priority</span>
            <div className={styles.chipGroup}>
              {PRIORITY_LEVELS.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`${styles.chip} ${itemPriority === option ? styles.chipActive : ''}`}
                  onClick={() => setItemPriority(option)}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.formField}>
            <span className={styles.formLabel}>Necessity</span>
            <div className={styles.chipGroup}>
              {NECESSITY_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`${styles.chip} ${itemNecessity === option ? styles.chipActive : ''}`}
                  onClick={() => setItemNecessity(option)}
                >
                  {NECESSITY_LABEL[option]}
                </button>
              ))}
            </div>
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

      {goalEditOpen && (
        <Modal title={strings.goalDetail.editGoal} onClose={() => setGoalEditOpen(false)}>
          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="goal-name">
              {strings.createGoal.nameLabel}
            </label>
            <input
              id="goal-name"
              className={styles.formInput}
              value={goalName}
              onChange={(event) => setGoalName(event.target.value)}
            />
          </div>
          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="goal-description">
              {strings.createGoal.descriptionLabel}
            </label>
            <textarea
              id="goal-description"
              className={styles.formTextarea}
              rows={2}
              value={goalDescription}
              onChange={(event) => setGoalDescription(event.target.value)}
            />
          </div>
          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="goal-deadline">
              {strings.createGoal.deadlineLabel}
            </label>
            <input
              id="goal-deadline"
              type="date"
              className={styles.formInput}
              value={goalDeadline}
              onChange={(event) => setGoalDeadline(event.target.value)}
            />
          </div>
          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="goal-currency">
              {strings.createGoal.currencyLabel}
            </label>
            <select
              id="goal-currency"
              className={styles.formInput}
              value={goalCurrency}
              onChange={(event) => setGoalCurrency(event.target.value)}
            >
              {currencyOptions.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.name}
                </option>
              ))}
            </select>
          </div>
          {goalSaveError && <p className={styles.errorText}>{goalSaveError}</p>}
          <button
            type="button"
            className={styles.modalSaveButton}
            disabled={!goalName.trim() || savingGoal}
            onClick={handleSaveGoal}
          >
            {savingGoal ? strings.goalDetail.saving : strings.goalDetail.save}
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
