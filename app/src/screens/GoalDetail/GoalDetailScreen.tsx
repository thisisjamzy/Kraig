'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Pencil, Archive, Trash2, CheckCircle2, Wallet, Plus, ChevronDown, ChevronUp } from 'lucide-react';
import { Modal } from '@/src/widgets/Modal/Modal';
import { ConfirmDialog } from '@/src/widgets/ConfirmDialog/ConfirmDialog';
import { ActionMenu } from '@/src/widgets/ActionMenu/ActionMenu';
import { useLogic } from '@/src/logic/goalDetail/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { formatAmount } from '@/src/screens/Goals/GoalsScreen';
import { NECESSITY_LABEL } from '@/src/viewmodels/projects';
import styles from './GoalDetailScreen.module.css';

export function GoalDetailScreen({ goalId }: { goalId: string }) {
  const strings = useStrings();
  const router = useRouter();
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [confirmDeleteGoal, setConfirmDeleteGoal] = useState(false);
  const [confirmDeleteItemId, setConfirmDeleteItemId] = useState<string | null>(null);
  const [expandedSubItemsId, setExpandedSubItemsId] = useState<string | null>(null);
  const {
    goal,
    isFixedGoal,
    currency,
    lineItems,
    amountCompleted,
    amountRemaining,
    percent,
    deadline,
    accounts,
    categoryOptions,
    isTransferGoal,

    handleDeleteLineItem,
    addToBudgetError,
    handleAddToBudget,
    toggleSubItemLive,

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
    goalKind,
    setGoalKind,
    goalTypeEdit,
    setGoalTypeEdit,
    savingGoal,
    goalSaveError,
    handleSaveGoal,

    completeItemId,
    openRecordPayment,
    closeRecordPayment,
    completeAccountId,
    setCompleteAccountId,
    completeToAccountId,
    setCompleteToAccountId,
    completeCharges,
    setCompleteCharges,
    completeAmount,
    setCompleteAmount,
    completeFullyPaid,
    setCompleteFullyPaid,
    completeCategoryId,
    setCompleteCategoryId,
    completeDate,
    setCompleteDate,
    completeDescription,
    setCompleteDescription,
    completing,
    completeError,
    handleRecordPayment,

    archiveGoal,
    deleteGoal,
    goBack,
    loading,
    error,
  } = useLogic(goalId);

  const completingItem = lineItems.find((item) => item.id === completeItemId) ?? null;
  // Every item on this page shares the one goal's own kind — "Unclassified"
  // only for a goal written before Fixed/Variable existed, not a per-item
  // distinction.
  const kindBadgeLabel =
    goal?.kind === 'Fixed' ? strings.goals.filterFixed : goal?.kind === 'Variable' ? strings.goals.filterVariable : strings.goals.kindUnclassified;
  const kindBadgeClass =
    goal?.kind === 'Fixed' ? styles.kindBadgeFixed : goal?.kind === 'Variable' ? styles.kindBadgeVariable : styles.kindBadgeUnclassified;

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
                icon: <Archive size={16} strokeWidth={1.75} />,
                onSelect: () => setConfirmArchive(true),
                danger: true,
              },
              {
                key: 'delete',
                label: strings.goalDetail.deleteGoal,
                icon: <Trash2 size={16} strokeWidth={1.75} />,
                onSelect: () => setConfirmDeleteGoal(true),
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
            <Link href={`/add-goal-item/${goalId}`} className={styles.addIconButton} aria-label={strings.goalDetail.addLineItem}>
              <Plus size={16} strokeWidth={2.25} />
            </Link>
          </div>

          {addToBudgetError && <p className={styles.errorText}>{addToBudgetError}</p>}

          {lineItems.length === 0 ? (
            <p className={styles.emptyText}>{strings.goalDetail.emptyLineItems}</p>
          ) : (
            <div className={styles.list}>
              {lineItems.map((item) => (
                <div key={item.id} className={styles.lineItem}>
                  <div className={styles.lineItemHeaderRow}>
                    <div className={styles.lineItemHeaderLeft}>
                      <p className={styles.lineItemCategoryText}>{item.categoryName}</p>
                      {(item.addedToBudget || item.budgetRuleId) && (
                        <span className={styles.addedToBudgetTag}>{strings.goalDetail.addedToBudgetTag}</span>
                      )}
                    </div>
                    <div className={styles.lineItemHeaderRight}>
                      <p className={item.dueDateObj ? styles.dueDateText : styles.dueDateTextPlaceholder}>
                        {item.dueDateObj
                          ? item.dueDateObj.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
                          : strings.goalDetail.dueDateNone}
                      </p>
                      <ActionMenu
                        title={item.name}
                        ariaLabel={`Actions for ${item.name}`}
                        items={[
                          ...(!isFixedGoal && !item.completed && !item.addedToBudget
                            ? [
                                {
                                  key: 'addToBudget',
                                  label: strings.goalDetail.addToBudget,
                                  icon: <Wallet size={16} strokeWidth={1.75} />,
                                  onSelect: () => handleAddToBudget(item.id),
                                },
                              ]
                            : []),
                          ...(!item.completed
                            ? [
                                {
                                  key: 'complete',
                                  label: item.isPartial ? strings.goalDetail.recordAnotherPayment : strings.goalDetail.recordPayment,
                                  icon: <CheckCircle2 size={16} strokeWidth={1.75} />,
                                  onSelect: () => openRecordPayment(item),
                                },
                              ]
                            : []),
                          {
                            key: 'edit',
                            label: strings.goalDetail.editLineItem,
                            icon: <Pencil size={16} strokeWidth={1.75} />,
                            onSelect: () => router.push(`/edit-goal-item/${goalId}/${item.id}`),
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
                    </div>
                  </div>

                  <div className={styles.lineItemNameRow}>
                    <p className={styles.lineItemName}>{item.name}</p>
                    <p className={styles.lineItemAmount}>
                      {formatAmount(item.amount)} {currency}
                    </p>
                  </div>

                  {(item.completed || item.spentAmount > 0) && (
                    <div className={styles.lineItemProgressSection}>
                      <div className={styles.lineItemProgressTrack}>
                        <div
                          className={styles.lineItemProgressFill}
                          style={{ width: `${Math.min(100, Math.round((item.displaySpentAmount / item.amount) * 100))}%` }}
                        />
                      </div>
                      <div className={styles.lineItemProgressRow}>
                        <span className={styles.lineItemProgressLabel}>
                          {strings.goalDetail.spentSoFarPrefix} {formatAmount(item.displaySpentAmount)} {strings.goalDetail.ofSuffix}{' '}
                          {formatAmount(item.amount)} {currency}
                        </span>
                        <div className={styles.lineItemPaymentsRow}>
                          {item.displayPayments.map((payment, index) => (
                            <Link
                              key={payment.id}
                              href={payment.kind === 'transfer' ? `/edit-transfer/${payment.id}` : `/edit-transaction/${payment.id}`}
                              className={styles.paymentChip}
                            >
                              {item.displayPayments.length > 1
                                ? `${strings.goalDetail.paymentChipPrefix} ${index + 1}`
                                : formatAmount(payment.amount)}
                            </Link>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className={styles.lineItemTagRow}>
                    <span className={kindBadgeClass}>{kindBadgeLabel}</span>
                    <span className={styles.priorityTag}>{item.priority}</span>
                    <span className={item.necessity === 'MustHave' ? styles.necessityTagMust : styles.necessityTagNice}>
                      {NECESSITY_LABEL[item.necessity]}
                    </span>
                    {item.completed ? (
                      <span className={styles.doneTag}>{strings.goalDetail.completedTag}</span>
                    ) : item.isPartial ? (
                      <span className={styles.partialTag}>{strings.goalDetail.partialTag}</span>
                    ) : (
                      <span className={item.hasFunds ? styles.fundsBadgeOk : styles.fundsBadgeShort}>
                        {item.hasFunds ? 'Possible' : 'Not possible'}
                      </span>
                    )}
                  </div>

                  {item.subItems.length > 0 && (
                    <div className={styles.subItemsSection}>
                      <button
                        type="button"
                        className={styles.subItemsSummaryRow}
                        onClick={() => setExpandedSubItemsId((current) => (current === item.id ? null : item.id))}
                      >
                        <span className={styles.subItemsSummaryText}>
                          {item.subItems.filter((s) => s.completed).length}/{item.subItems.length}{' '}
                          {strings.goalDetail.subItemsLabel.toLowerCase()} &bull; {formatAmount(item.subItemsConsumed)}{' '}
                          {strings.goalDetail.subItemsOfSuffix} {formatAmount(item.amount)}
                        </span>
                        {expandedSubItemsId === item.id ? (
                          <ChevronUp size={14} strokeWidth={2} />
                        ) : (
                          <ChevronDown size={14} strokeWidth={2} />
                        )}
                      </button>
                      {expandedSubItemsId === item.id && (
                        <div className={styles.subItemsExpandedList}>
                          {item.subItems.map((subItem) => (
                            <label key={subItem.id} className={styles.subItemsExpandedRow}>
                              <input
                                type="checkbox"
                                checked={subItem.completed}
                                onChange={() => toggleSubItemLive(item.id, subItem.id)}
                              />
                              <span
                                className={`${styles.subItemsExpandedName} ${subItem.completed ? styles.subItemsExpandedNameDone : ''}`}
                              >
                                {subItem.name}
                              </span>
                              <span className={styles.subItemsExpandedAmount}>{formatAmount(subItem.amount)}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {completingItem && (
        <Modal
          title={completingItem.isPartial ? strings.markLineItemComplete.titleAnother : strings.markLineItemComplete.title}
          onClose={closeRecordPayment}
        >
          {completingItem.spentAmount > 0 && (
            <p className={styles.formHint}>
              {strings.goalDetail.spentSoFarPrefix} {formatAmount(completingItem.spentAmount)} {strings.goalDetail.ofSuffix}{' '}
              {formatAmount(completingItem.amount)} {currency}
            </p>
          )}
          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="complete-account">
              {isTransferGoal ? strings.markLineItemComplete.fromAccountLabel : strings.markLineItemComplete.accountLabel}
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
          {isTransferGoal && (
            <div className={styles.formField}>
              <label className={styles.formLabel} htmlFor="complete-to-account">
                {strings.markLineItemComplete.toAccountLabel}
              </label>
              <select
                id="complete-to-account"
                className={styles.formInput}
                value={completeToAccountId}
                onChange={(event) => setCompleteToAccountId(event.target.value)}
              >
                {accounts
                  .filter((account) => account.id !== completeAccountId)
                  .map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
              </select>
            </div>
          )}
          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="complete-amount">
              {strings.markLineItemComplete.amountLabel}
            </label>
            <input
              id="complete-amount"
              inputMode="numeric"
              className={styles.formInput}
              value={completeAmount}
              onChange={(event) => setCompleteAmount(event.target.value.replace(/[^0-9.]/g, ''))}
            />
          </div>
          <div className={styles.formField}>
            <span className={styles.formLabel}>{strings.markLineItemComplete.statusLabel}</span>
            <div className={styles.statusToggle}>
              <button
                type="button"
                className={`${styles.statusToggleOption} ${completeFullyPaid ? styles.statusToggleOptionActive : ''}`}
                onClick={() => setCompleteFullyPaid(true)}
              >
                {strings.markLineItemComplete.fullyPaidLabel}
              </button>
              <button
                type="button"
                className={`${styles.statusToggleOption} ${!completeFullyPaid ? styles.statusToggleOptionActive : ''}`}
                onClick={() => setCompleteFullyPaid(false)}
              >
                {strings.markLineItemComplete.partiallyPaidLabel}
              </button>
            </div>
          </div>
          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="complete-category">
              {isTransferGoal ? strings.markLineItemComplete.transferTypeLabel : strings.markLineItemComplete.categoryLabel}
            </label>
            <select
              id="complete-category"
              className={styles.formInput}
              value={completeCategoryId}
              onChange={(event) => setCompleteCategoryId(event.target.value)}
            >
              {categoryOptions.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
          {isTransferGoal && (
            <div className={styles.formField}>
              <label className={styles.formLabel} htmlFor="complete-charges">
                {strings.markLineItemComplete.chargesLabel}
              </label>
              <input
                id="complete-charges"
                inputMode="numeric"
                className={styles.formInput}
                value={completeCharges}
                onChange={(event) => setCompleteCharges(event.target.value.replace(/[^0-9.]/g, ''))}
              />
            </div>
          )}
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
            disabled={
              !completeAccountId ||
              !(Number(completeAmount) > 0) ||
              completing ||
              (isTransferGoal && (!completeToAccountId || completeToAccountId === completeAccountId))
            }
            onClick={handleRecordPayment}
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
          {goalKind !== 'Fixed' && (
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
          )}
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
          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="goal-type">
              {strings.createGoal.typeLabel}
            </label>
            <select
              id="goal-type"
              className={styles.formInput}
              value={goalTypeEdit}
              onChange={(event) => setGoalTypeEdit(event.target.value as typeof goalTypeEdit)}
            >
              <option value="Expense">{strings.createGoal.typeExpense}</option>
              <option value="Income">{strings.createGoal.typeIncome}</option>
              <option value="Savings">{strings.createGoal.typeSavings}</option>
              <option value="Transfer">{strings.createGoal.typeTransfer}</option>
            </select>
          </div>
          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="goal-kind">
              {strings.createGoal.kindLabel}
            </label>
            <select
              id="goal-kind"
              className={styles.formInput}
              value={goalKind}
              onChange={(event) => {
                const next = event.target.value as typeof goalKind;
                setGoalKind(next);
                // A Fixed goal repeats — its one-off target date field is
                // hidden above, so drop any value it held rather than
                // saving a stale deadline behind a hidden field.
                if (next === 'Fixed') setGoalDeadline('');
              }}
            >
              <option value="Variable">{strings.createGoal.kindVariable}</option>
              <option value="Fixed">{strings.createGoal.kindFixed}</option>
            </select>
          </div>
          <p className={styles.hintText}>{strings.goalDetail.editKindTypeHint}</p>
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

      {confirmDeleteGoal && (
        <ConfirmDialog
          title={strings.goals.deleteGoalConfirmTitle}
          message={strings.goals.deleteGoalConfirmMessage}
          confirmLabel={strings.goals.deleteGoalAction}
          cancelLabel={strings.common.cancel}
          onConfirm={() => {
            setConfirmDeleteGoal(false);
            deleteGoal();
          }}
          onCancel={() => setConfirmDeleteGoal(false)}
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
