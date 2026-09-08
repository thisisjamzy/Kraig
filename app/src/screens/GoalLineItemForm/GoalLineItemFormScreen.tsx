'use client';

// Add/edit a goal line item — its own page (not a modal over Goal Detail),
// reusing that screen's own useLogic(goalId) wholesale rather than
// duplicating its category/account-filtering and save logic here. Editing
// an existing item just seeds the same form state on mount via
// openEditItem; adding starts it fresh via openAdd. A successful save
// navigates back to the goal (see goalDetail/useLogic.ts's
// handleAddLineItem), same as this page's own back button.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, X } from 'lucide-react';
import { useLogic, FIXED_ITEM_FREQUENCIES } from '@/src/logic/goalDetail/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { HeroDatePicker } from '@/src/widgets/HeroDatePicker/HeroDatePicker';
import { PRIORITY_LEVELS, NECESSITY_OPTIONS, NECESSITY_LABEL } from '@/src/viewmodels/projects';
import type { Priority, GoalItemNecessity } from '@/src/shared/firestore/types';
import styles from '@/src/screens/GoalDetail/GoalDetailScreen.module.css';

// yyyy-MM-dd -> dd/mm/yy, matching the placeholder format shown before any
// date is picked.
function formatShortDate(iso: string) {
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year.slice(2)}`;
}

export function GoalLineItemFormScreen({ goalId, itemId }: { goalId: string; itemId?: string }) {
  const strings = useStrings();
  const router = useRouter();
  const {
    goal,
    isFixedGoal,
    lineItems,
    categories,

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
    itemCategoryId,
    setItemCategoryId,
    itemAccountId,
    setItemAccountId,
    itemDueDate,
    setItemDueDate,
    itemRecurrenceFrequency,
    setItemRecurrenceFrequency,
    accountOptionsForCategory,
    canSaveLineItem,
    savingItem,
    itemError,
    handleAddLineItem,

    loading,
    error,
  } = useLogic(goalId);

  // Seed the form exactly once — after the target item (if any) has
  // actually loaded, not before, or openEditItem would seed from nothing.
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (seeded || loading) return;
    if (itemId) {
      const item = lineItems.find((entry) => entry.id === itemId);
      if (!item) return;
      openEditItem(item);
    } else {
      openAdd();
    }
    setSeeded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, itemId, lineItems, seeded]);

  const isEditing = Boolean(editingItemId);

  function goBack() {
    router.push(`/goals/${goalId}`);
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={goBack} aria-label={strings.goalDetail.backLabel}>
          <ChevronLeft size={18} strokeWidth={2} />
        </button>
        <h1 className={styles.title}>
          {isEditing ? strings.goalDetail.editLineItemTitle : strings.goalDetail.addLineItem}
        </h1>
      </header>

      {goal && <p className={styles.goalName}>{goal.name}</p>}

      <ScreenState loading={loading} error={error} />

      {!loading && !error && seeded && (
        <>
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
          <div className={styles.formRow}>
            <div className={styles.formField}>
              <label className={styles.formLabel} htmlFor="line-item-category">
                {strings.goalDetail.categoryLabel}
              </label>
              <select
                id="line-item-category"
                className={styles.formInput}
                value={itemCategoryId}
                onChange={(event) => setItemCategoryId(event.target.value)}
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.formField}>
              <label className={styles.formLabel} htmlFor="line-item-priority">
                {strings.goalDetail.priorityLabel}
              </label>
              <select
                id="line-item-priority"
                className={styles.formInput}
                value={itemPriority}
                onChange={(event) => setItemPriority(event.target.value as Priority)}
              >
                {PRIORITY_LEVELS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="line-item-necessity">
              {strings.goalDetail.necessityLabel}
            </label>
            <select
              id="line-item-necessity"
              className={styles.formInput}
              value={itemNecessity}
              onChange={(event) => setItemNecessity(event.target.value as GoalItemNecessity)}
            >
              {NECESSITY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {NECESSITY_LABEL[option]}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="line-item-account">
              {strings.goalDetail.accountLabel}
            </label>
            <select
              id="line-item-account"
              className={styles.formInput}
              value={itemAccountId}
              onChange={(event) => setItemAccountId(event.target.value)}
            >
              <option value="">{strings.goalDetail.accountNone}</option>
              {accountOptionsForCategory(itemCategoryId).map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.dueDateFieldRow}>
            <span className={styles.formLabel}>{strings.goalDetail.dueDateLabel}</span>
            <div className={styles.dueDateInlineRow}>
              <HeroDatePicker
                value={itemDueDate || new Date().toISOString().slice(0, 10)}
                onChange={setItemDueDate}
                triggerLabel={itemDueDate ? formatShortDate(itemDueDate) : strings.goalDetail.dueDatePlaceholder}
                triggerClassName={itemDueDate ? styles.dueDateTrigger : styles.dueDateTriggerPlaceholder}
              />
              {itemDueDate && (
                <button
                  type="button"
                  className={styles.clearDueDateButton}
                  onClick={() => setItemDueDate('')}
                  aria-label="Clear due date"
                >
                  <X size={14} strokeWidth={2} />
                </button>
              )}
            </div>
          </div>
          {isFixedGoal && (
            <div className={styles.formField}>
              <span className={styles.formLabel}>{strings.goalDetail.recurrenceLabel}</span>
              <div className={styles.chipGroup}>
                {FIXED_ITEM_FREQUENCIES.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={`${styles.chip} ${itemRecurrenceFrequency === option ? styles.chipActive : ''}`}
                    onClick={() => setItemRecurrenceFrequency(option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          )}
          {itemError && <p className={styles.errorText}>{itemError}</p>}
          <button
            type="button"
            className={styles.modalSaveButton}
            disabled={!canSaveLineItem || savingItem}
            onClick={handleAddLineItem}
          >
            {savingItem ? strings.goalDetail.saving : strings.goalDetail.save}
          </button>
        </>
      )}
    </div>
  );
}
