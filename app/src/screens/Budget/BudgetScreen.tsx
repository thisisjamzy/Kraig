'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronLeft, ChevronRight, Pencil, Trash2, Plus, Settings, History } from 'lucide-react';
import Link from 'next/link';
import { Modal } from '@/src/widgets/Modal/Modal';
import { ActionMenu } from '@/src/widgets/ActionMenu/ActionMenu';
import { ConfirmDialog } from '@/src/widgets/ConfirmDialog/ConfirmDialog';
import { useLogic, formatAmount, BUDGET_LINE_TYPES } from '@/src/logic/budget/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import styles from './BudgetScreen.module.css';

export function BudgetScreen() {
  const strings = useStrings();
  const router = useRouter();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const {
    monthIndex,
    year,
    retroTransactionHref,
    showRetroTransactionButton,
    monthPickerOpen,
    setMonthPickerOpen,
    pickerYear,
    setPickerYear,
    totalBudgetDraft,
    setTotalBudgetDraft,
    savingTotalBudget,
    handleSaveTotalBudget,
    configOpen,
    setConfigOpen,
    openConfig,
    projectedIncomeDraft,
    setProjectedIncomeDraft,
    savingsMode,
    setSavingsMode,
    savingsValueDraft,
    setSavingsValueDraft,
    savingPlan,
    categories,
    currency,
    addBudgetCategoryHref,
    editingCategory,
    editAvailableCategories,
    editType,
    setEditType,
    editCategoryId,
    setEditCategoryId,
    editDescriptionDraft,
    setEditDescriptionDraft,
    editAmountDraft,
    setEditAmountDraft,
    editRecurrence,
    setEditRecurrence,
    editRecurrenceMonths,
    setEditRecurrenceMonths,
    savingEdit,
    editError,
    projectedIncome,
    plannedSavings,
    actualIncome,
    actualSavings,
    incomeProgressPercent,
    savingsProgressPercent,
    totalBudgeted,
    totalSpent,
    leftToBudget,
    overspendAmount,
    isOverspending,
    loading,
    error,
    handleSavePlan,
    openMonthPicker,
    chooseMonth,
    openEdit,
    handleSaveEdit,
    handleDelete,
    setEditingId,
  } = useLogic();

  const monthNames = strings.months;

  // 0% (nothing logged yet) is neutral — there's no judgment to make yet.
  // 100%+ (target met or exceeded) is positive. Anything logged but still
  // short of the target is negative.
  function percentClass(percent: number) {
    if (percent === 0) return styles.percentNeutral;
    return percent >= 100 ? styles.percentPositive : styles.percentNegative;
  }

  function recurrenceCaption(entry: { recurrence: 'once' | 'monthly' | 'limited'; recurrenceMonths?: number }) {
    if (entry.recurrence === 'monthly') return strings.budget.recurrenceMonthly;
    if (entry.recurrence === 'limited') {
      const months = entry.recurrenceMonths ?? 1;
      const suffix =
        months === 1 ? strings.budget.recurrenceLimitedSuffixOne : strings.budget.recurrenceLimitedSuffixMany;
      return `${strings.budget.recurrenceLimitedPrefix} ${months} ${suffix}`;
    }
    return strings.budget.recurrenceOnce;
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{monthNames[monthIndex]}</h1>
        <button type="button" className={styles.yearPill} onClick={openMonthPicker}>
          {year}
          <ChevronDown size={14} strokeWidth={2} />
        </button>
        <button
          type="button"
          className={styles.configButton}
          onClick={openConfig}
          aria-label={strings.budget.editPlan}
        >
          <Settings size={18} strokeWidth={1.75} />
        </button>
      </header>

      <div className={styles.totalCard}>
        <span className={styles.totalLabel}>
          {strings.budget.totalBudgetForPrefix} {monthNames[monthIndex]}
        </span>

        <div className={styles.totalBudgetRow}>
          <input
            className={styles.totalInput}
            inputMode="numeric"
            value={totalBudgetDraft}
            onChange={(event) => setTotalBudgetDraft(event.target.value.replace(/[^0-9]/g, ''))}
            placeholder="0"
          />
          <button
            type="button"
            className={styles.saveButton}
            onClick={handleSaveTotalBudget}
            disabled={savingTotalBudget}
          >
            {strings.common.save}
          </button>
        </div>

        {isOverspending && (
          <p className={styles.overspendWarning}>
            {strings.budget.overspendWarningPrefix} {formatAmount(overspendAmount)} {currency}
          </p>
        )}

        <div className={styles.summaryRow}>
          <div className={styles.summaryItem}>
            <span className={styles.summaryItemLabel}>{strings.budget.spent}</span>
            <span className={styles.summaryItemValue}>{formatAmount(totalSpent)}</span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryItemLabel}>{strings.budget.budgeted}</span>
            <span className={styles.summaryItemValue}>{formatAmount(totalBudgeted)}</span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryItemLabel}>{strings.budget.leftToBudget}</span>
            <span className={styles.summaryItemValue}>{formatAmount(leftToBudget)}</span>
          </div>
        </div>
      </div>

      <div className={styles.trackingTable}>
        <span className={styles.trackingCorner} />
        <span className={styles.trackingTableHeaderLabel}>{strings.budget.projectedColumnLabel}</span>
        <span className={styles.trackingTableHeaderLabel}>{strings.budget.actualColumnLabel}</span>
        <span className={styles.trackingCorner} />

        <span className={styles.trackingRowLabel}>{strings.budget.incomeRowLabel}</span>
        <span className={styles.trackingTableValue}>{formatAmount(projectedIncome)}</span>
        <span className={styles.trackingTableValue}>{formatAmount(actualIncome)}</span>
        <span className={`${styles.trackingPercentBadge} ${percentClass(incomeProgressPercent)}`}>
          {incomeProgressPercent}%
        </span>

        <div className={styles.trackingTableDivider} />

        <span className={styles.trackingRowLabel}>{strings.budget.savingsRowLabel}</span>
        <span className={styles.trackingTableValue}>{formatAmount(plannedSavings)}</span>
        <span className={styles.trackingTableValue}>{formatAmount(actualSavings)}</span>
        <span className={`${styles.trackingPercentBadge} ${percentClass(savingsProgressPercent)}`}>
          {savingsProgressPercent}%
        </span>
      </div>

      <div className={styles.sectionTitleRow}>
        <h2 className={styles.sectionTitle}>{strings.budget.sectionTitle}</h2>
        <Link href={addBudgetCategoryHref} className={styles.addIconButton} aria-label={strings.budget.addCategory}>
          <Plus size={16} strokeWidth={2.25} />
        </Link>
      </div>

      <ScreenState loading={loading} error={error} />

      <div className={styles.categoryList}>
        {categories.map((entry) => (
          <div
            key={entry.id}
            role="button"
            tabIndex={0}
            className={styles.categoryRow}
            onClick={() => router.push(`/transactions?categoryId=${entry.categoryId}`)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                router.push(`/transactions?categoryId=${entry.categoryId}`);
              }
            }}
          >
            <div className={styles.categoryTopRow}>
              <p className={styles.categoryName}>{entry.category}</p>
              <span onClick={(event) => event.stopPropagation()}>
                <ActionMenu
                  title={entry.category}
                  ariaLabel={`Actions for ${entry.category}`}
                  items={[
                    {
                      key: 'edit',
                      label: strings.budget.editAction,
                      icon: <Pencil size={16} strokeWidth={1.75} />,
                      onSelect: () => openEdit(entry),
                    },
                    {
                      key: 'delete',
                      label: strings.budget.deleteAction,
                      icon: <Trash2 size={16} strokeWidth={1.75} />,
                      onSelect: () => setConfirmDeleteId(entry.id),
                      danger: true,
                    },
                  ]}
                />
              </span>
            </div>
            {entry.description && <p className={styles.categoryDescription}>{entry.description}</p>}
            <p className={styles.categoryAmount}>
              {formatAmount(entry.spent)} {strings.budget.spentOfSuffix}{' '}
              {formatAmount(entry.budgeted)} {currency} {strings.budget.spentSuffix}
            </p>
            <p className={styles.categoryRecurrence}>{recurrenceCaption(entry)}</p>
          </div>
        ))}
      </div>

      {confirmDeleteId && (
        <ConfirmDialog
          title={strings.budget.deleteConfirmTitle}
          message={
            categories.find((c) => c.id === confirmDeleteId)?.recurrence !== 'once'
              ? strings.budget.deleteRecurringHint
              : strings.budget.deleteConfirmMessage
          }
          confirmLabel={strings.budget.deleteAction}
          cancelLabel={strings.common.cancel}
          onConfirm={() => {
            handleDelete(confirmDeleteId);
            setConfirmDeleteId(null);
          }}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}

      {showRetroTransactionButton && (
        <Link href={retroTransactionHref} className={styles.retroButton}>
          <History size={18} strokeWidth={2.25} />
          <span>
            <span className={styles.retroButtonLabel}>{strings.budget.addRetroTransaction}</span>
            <span className={styles.retroButtonHint}>{strings.budget.addRetroTransactionHint}</span>
          </span>
        </Link>
      )}

      <p className={styles.footerNote}>{strings.budget.footerNote}</p>

      {monthPickerOpen && (
        <Modal title={strings.budget.chooseMonth} onClose={() => setMonthPickerOpen(false)}>
          <div className={styles.yearStepper}>
            <button
              type="button"
              className={styles.yearStepButton}
              onClick={() => setPickerYear((value) => value - 1)}
              aria-label="Previous year"
            >
              <ChevronLeft size={16} strokeWidth={2} />
            </button>
            <span className={styles.yearStepValue}>{pickerYear}</span>
            <button
              type="button"
              className={styles.yearStepButton}
              onClick={() => setPickerYear((value) => value + 1)}
              aria-label="Next year"
            >
              <ChevronRight size={16} strokeWidth={2} />
            </button>
          </div>
          <div className={styles.monthGrid}>
            {monthNames.map((name, index) => (
              <button
                key={name}
                type="button"
                className={`${styles.monthButton} ${
                  index === monthIndex && pickerYear === year ? styles.monthButtonActive : ''
                }`}
                onClick={() => chooseMonth(index)}
              >
                {name.slice(0, 3)}
              </button>
            ))}
          </div>
        </Modal>
      )}

      {configOpen && (
        <Modal title={strings.budget.configTitle} onClose={() => setConfigOpen(false)}>
          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="config-projected-income">
              {strings.budget.projectedIncomeLabel}
            </label>
            <input
              id="config-projected-income"
              className={styles.formInput}
              inputMode="numeric"
              value={projectedIncomeDraft}
              onChange={(event) => setProjectedIncomeDraft(event.target.value.replace(/[^0-9]/g, ''))}
              placeholder="0"
            />
          </div>

          <div className={styles.formField}>
            <span className={styles.formLabel}>{strings.budget.savingsModeLabel}</span>
            <div className={styles.recurrenceGroup}>
              <button
                type="button"
                className={`${styles.recurrenceOption} ${savingsMode === 'fixed' ? styles.recurrenceOptionActive : ''}`}
                onClick={() => setSavingsMode('fixed')}
              >
                {strings.budget.savingsModeFixed}
              </button>
              <button
                type="button"
                className={`${styles.recurrenceOption} ${savingsMode === 'percent' ? styles.recurrenceOptionActive : ''}`}
                onClick={() => setSavingsMode('percent')}
              >
                {strings.budget.savingsModePercent}
              </button>
            </div>
          </div>

          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="config-savings-value">
              {savingsMode === 'percent' ? strings.budget.savingsPercentLabel : strings.budget.savingsAmountLabel}
            </label>
            <input
              id="config-savings-value"
              className={styles.formInput}
              inputMode="numeric"
              value={savingsValueDraft}
              onChange={(event) => setSavingsValueDraft(event.target.value.replace(/[^0-9]/g, ''))}
              placeholder="0"
            />
          </div>

          <button type="button" className={styles.modalSaveButton} onClick={handleSavePlan} disabled={savingPlan}>
            {strings.common.save}
          </button>
        </Modal>
      )}

      {editingCategory && (
        <Modal
          title={`${editingCategory.category} ${strings.budget.editCategoryTitleSuffix}`}
          onClose={() => setEditingId(null)}
        >
          <div className={styles.formField}>
            <span className={styles.formLabel}>{strings.budget.typeLabel}</span>
            <div className={styles.recurrenceGroup}>
              {BUDGET_LINE_TYPES.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`${styles.recurrenceOption} ${editType === option ? styles.recurrenceOptionActive : ''}`}
                  onClick={() => setEditType(option)}
                >
                  {strings.budget.typeLabels[option]}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="edit-category-id">
              {strings.budget.categoryLabel}
            </label>
            {editAvailableCategories.length === 0 ? (
              <p className={styles.emptyText}>{strings.budget.noCategoriesLeft}</p>
            ) : (
              <select
                id="edit-category-id"
                className={styles.formInput}
                value={editCategoryId}
                onChange={(event) => setEditCategoryId(event.target.value)}
              >
                {editCategoryId === '' && (
                  <option value="" disabled>
                    {strings.budget.categoryPlaceholder}
                  </option>
                )}
                {editAvailableCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="edit-category-description">
              {strings.budget.descriptionLabel}
            </label>
            <textarea
              id="edit-category-description"
              className={styles.formTextarea}
              value={editDescriptionDraft}
              onChange={(event) => setEditDescriptionDraft(event.target.value)}
              placeholder={strings.budget.descriptionPlaceholder}
              rows={3}
            />
          </div>
          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="edit-category-amount">
              {strings.budget.amountLabel}
            </label>
            <input
              id="edit-category-amount"
              className={styles.formInput}
              inputMode="numeric"
              value={editAmountDraft}
              onChange={(event) => setEditAmountDraft(event.target.value.replace(/[^0-9]/g, ''))}
              placeholder="0"
            />
          </div>

          <div className={styles.formField}>
            <span className={styles.formLabel}>{strings.budget.editRecurrenceLabel}</span>
            <div className={styles.recurrenceGroup}>
              {strings.budget.recurrenceOptions.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  className={`${styles.recurrenceOption} ${
                    editRecurrence === option.key ? styles.recurrenceOptionActive : ''
                  }`}
                  onClick={() => setEditRecurrence(option.key)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {editRecurrence === 'limited' && (
              <div className={styles.recurrenceMonthsRow}>
                <input
                  className={styles.recurrenceMonthsInput}
                  inputMode="numeric"
                  value={editRecurrenceMonths}
                  onChange={(event) =>
                    setEditRecurrenceMonths(event.target.value.replace(/[^0-9]/g, ''))
                  }
                />
                <span className={styles.recurrenceMonthsLabel}>{strings.budget.monthsSuffix}</span>
              </div>
            )}
          </div>

          {editError && (
            <p className={styles.errorText} role="alert">
              {editError}
            </p>
          )}
          <button
            type="button"
            className={styles.modalSaveButton}
            disabled={!editCategoryId || savingEdit}
            onClick={handleSaveEdit}
          >
            {strings.common.save}
          </button>
        </Modal>
      )}
    </div>
  );
}
