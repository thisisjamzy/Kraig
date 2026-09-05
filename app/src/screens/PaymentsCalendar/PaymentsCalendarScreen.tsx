'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown, Check, Repeat, Plus, Trash2, Calendar } from 'lucide-react';
import { Modal } from '@/src/widgets/Modal/Modal';
import { ConfirmDialog } from '@/src/widgets/ConfirmDialog/ConfirmDialog';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import {
  useLogic,
  formatAmount,
  dueLabel,
  isOverdue,
  formatDueDate,
  formatToday,
  DUE_FILTERS,
  FREQUENCY_OPTIONS,
} from '@/src/logic/paymentsCalendar/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import styles from './PaymentsCalendarScreen.module.css';

interface PendingPayment {
  id: string;
  title: string;
  category: string;
  account: string;
  amount: number;
  currency: string;
  dueDate: string;
  recurring: boolean;
}

function PaymentRow({
  payment,
  onMarkAsPaid,
  markAsPaidLabel,
  recurringLabel,
  onDelete,
  deleteLabel,
}: {
  payment: PendingPayment;
  onMarkAsPaid: (id: string) => void;
  markAsPaidLabel: string;
  recurringLabel: string;
  onDelete: (payment: PendingPayment) => void;
  deleteLabel: string;
}) {
  // "Mark as paid" only opens the confirm-transaction review step — see
  // PaymentsCalendarScreen's confirmingPayment modal for the actual commit.
  const overdue = isOverdue(payment.dueDate);
  return (
    <div className={styles.card}>
      <div className={styles.cardInfo}>
        <p className={styles.paymentTitle}>{payment.title}</p>
        <p className={styles.paymentMeta}>
          {payment.category} &bull; {payment.account}
        </p>
        <div className={styles.badgeRow}>
          <span className={`${styles.dueBadge} ${overdue ? styles.dueBadgeOverdue : ''}`}>
            {formatDueDate(payment.dueDate)} &bull; {dueLabel(payment.dueDate)}
          </span>
          {payment.recurring && (
            <span className={styles.recurringBadge}>
              <Repeat size={11} strokeWidth={2} />
              {recurringLabel}
            </span>
          )}
        </div>
      </div>
      <div className={styles.cardActions}>
        <span className={styles.amount}>
          {formatAmount(payment.amount)} {payment.currency}
        </span>
        <div className={styles.badgeRow}>
          <button
            type="button"
            className={styles.deleteButton}
            onClick={() => onDelete(payment)}
            aria-label={`${deleteLabel}: ${payment.title}`}
          >
            <Trash2 size={14} strokeWidth={2} />
          </button>
          <button
            type="button"
            className={styles.paidButton}
            onClick={() => onMarkAsPaid(payment.id)}
            aria-label={`${markAsPaidLabel}: ${payment.title}`}
          >
            <Check size={16} strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </div>
  );
}

export function PaymentsCalendarScreen() {
  const strings = useStrings();
  const {
    filteredPending,
    visiblePending,
    hasMorePending,
    dueFilter,
    dueFilterPickerOpen,
    setDueFilterPickerOpen,
    chooseDueFilter,
    viewAllOpen,
    setViewAllOpen,
    captured,
    confirmingPayment,
    confirmAccountId,
    setConfirmAccountId,
    accounts,
    confirming,
    confirmError,
    openConfirmPayment,
    cancelConfirmPayment,
    confirmPayment,
    goBack,

    addOpen,
    setAddOpen,
    openAddPayment,
    expenseCategories,
    newCategoryId,
    setNewCategoryId,
    newDescription,
    setNewDescription,
    newAmount,
    setNewAmount,
    newDueDate,
    newAccountId,
    setNewAccountId,
    newFrequency,
    setNewFrequency,
    newInterval,
    setNewInterval,
    newEndAfterOccurrences,
    setNewEndAfterOccurrences,
    creating,
    createError,
    handleCreatePayment,
    handleDeletePayment,

    datePickerOpen,
    setDatePickerOpen,
    openDatePicker,
    chooseDueDay,
    shiftPickerMonth,
    pickerMonth,
    pickerYear,
    daysInMonth,

    loading,
    error,
  } = useLogic();

  const frequencyOption = FREQUENCY_OPTIONS.find((option) => option.key === newFrequency)!;
  const intervalCount = Number(newInterval) || 1;
  const intervalUnitLabel = intervalCount === 1 ? frequencyOption.unitLabel : frequencyOption.unitLabelPlural;

  const selectedFilterLabel = DUE_FILTERS.find((entry) => entry.key === dueFilter)?.label ?? '';

  const [confirmDeletePayment, setConfirmDeletePayment] = useState<PendingPayment | null>(null);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={goBack} aria-label="Back">
          <ChevronLeft size={18} strokeWidth={2} />
        </button>
        <h1 className={styles.title}>{strings.paymentsCalendar.title}</h1>
      </header>

      <ScreenState loading={loading} error={error} />

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>{strings.paymentsCalendar.upcoming}</h2>
          <button
            type="button"
            className={styles.filterTrigger}
            onClick={() => setDueFilterPickerOpen(true)}
          >
            <span>{selectedFilterLabel}</span>
            <ChevronDown size={14} strokeWidth={2} />
          </button>
        </div>

        {filteredPending.length === 0 ? (
          <p className={styles.emptyText}>{strings.paymentsCalendar.noUpcomingPayments}</p>
        ) : (
          <>
            <div className={styles.list}>
              {visiblePending.map((payment) => (
                <PaymentRow
                  key={payment.id}
                  payment={payment}
                  onMarkAsPaid={openConfirmPayment}
                  markAsPaidLabel={strings.paymentsCalendar.markAsPaid}
                  recurringLabel={strings.paymentsCalendar.recurring}
                  onDelete={setConfirmDeletePayment}
                  deleteLabel={strings.paymentsCalendar.deletePaymentLabel}
                />
              ))}
            </div>

            {hasMorePending && (
              <button
                type="button"
                className={styles.viewAllTextButton}
                onClick={() => setViewAllOpen(true)}
              >
                {strings.paymentsCalendar.viewAll} ({filteredPending.length})
              </button>
            )}
          </>
        )}

        <button type="button" className={styles.addPaymentButton} onClick={openAddPayment}>
          <Plus size={16} strokeWidth={2.25} />
          {strings.paymentsCalendar.addPayment}
        </button>
      </section>

      {captured.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{strings.paymentsCalendar.recentlyCaptured}</h2>
          <div className={styles.capturedList}>
            {captured.map((entry) => (
              <div key={entry.id} className={styles.capturedRow}>
                <span className={styles.capturedIcon}>
                  <Check size={14} strokeWidth={2.5} />
                </span>
                <div className={styles.capturedInfo}>
                  <p className={styles.capturedTitle}>{entry.title}</p>
                  <p className={styles.capturedMeta}>
                    {entry.account} &bull; {strings.paymentsCalendar.capturedSuffix}
                  </p>
                </div>
                <span className={styles.capturedAmount}>
                  {formatAmount(entry.amount)} {entry.currency}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {dueFilterPickerOpen && (
        <Modal
          title={strings.paymentsCalendar.filterByDueDate}
          onClose={() => setDueFilterPickerOpen(false)}
        >
          <div className={styles.filterList}>
            {DUE_FILTERS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                className={styles.filterRow}
                onClick={() => chooseDueFilter(key)}
              >
                {label}
                {dueFilter === key && <Check size={16} strokeWidth={2.25} />}
              </button>
            ))}
          </div>
        </Modal>
      )}

      {viewAllOpen && (
        <Modal title={strings.paymentsCalendar.upcoming} onClose={() => setViewAllOpen(false)}>
          <div className={`${styles.list} ${styles.modalList}`}>
            {filteredPending.map((payment) => (
              <PaymentRow
                key={payment.id}
                payment={payment}
                onMarkAsPaid={openConfirmPayment}
                markAsPaidLabel={strings.paymentsCalendar.markAsPaid}
                recurringLabel={strings.paymentsCalendar.recurring}
                onDelete={setConfirmDeletePayment}
                deleteLabel={strings.paymentsCalendar.deletePaymentLabel}
              />
            ))}
          </div>
        </Modal>
      )}

      {addOpen && (
        <div className={styles.fullScreen}>
          <header className={styles.header}>
            <button
              type="button"
              className={styles.backButton}
              onClick={() => setAddOpen(false)}
              aria-label="Close"
            >
              <ChevronLeft size={18} strokeWidth={2} />
            </button>
            <h1 className={styles.title}>{strings.paymentsCalendar.addPaymentTitle}</h1>
          </header>

          <div className={styles.fullScreenBody}>
            <p className={styles.sectionCaption}>{strings.paymentsCalendar.addPaymentHint}</p>

            {expenseCategories.length === 0 ? (
              <p className={styles.emptyText}>{strings.paymentsCalendar.noExpenseCategories}</p>
            ) : (
              <div className={styles.formField}>
                <label className={styles.formLabel} htmlFor="new-payment-category">
                  {strings.paymentsCalendar.categoryLabel}
                </label>
                <select
                  id="new-payment-category"
                  className={styles.formInput}
                  value={newCategoryId}
                  onChange={(event) => setNewCategoryId(event.target.value)}
                >
                  <option value="" disabled>
                    {strings.paymentsCalendar.categoryPlaceholder}
                  </option>
                  {expenseCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className={styles.formField}>
              <label className={styles.formLabel} htmlFor="new-payment-description">
                {strings.paymentsCalendar.descriptionLabel}
              </label>
              <input
                id="new-payment-description"
                className={styles.formInput}
                value={newDescription}
                onChange={(event) => setNewDescription(event.target.value)}
                placeholder={strings.paymentsCalendar.descriptionPlaceholder}
              />
            </div>

            <div className={styles.formField}>
              <label className={styles.formLabel} htmlFor="new-payment-amount">
                {strings.paymentsCalendar.amountLabel}
              </label>
              <input
                id="new-payment-amount"
                className={styles.formInput}
                inputMode="numeric"
                value={newAmount}
                onChange={(event) => setNewAmount(event.target.value.replace(/[^0-9]/g, ''))}
                placeholder="0"
              />
            </div>

            <div className={styles.formField}>
              <span className={styles.formLabel}>{strings.paymentsCalendar.dueDateLabel}</span>
              <button type="button" className={styles.dateChip} onClick={openDatePicker}>
                <Calendar size={16} strokeWidth={1.75} />
                {newDueDate ? formatDueDate(newDueDate) : strings.paymentsCalendar.chooseDate}
              </button>
            </div>

            <div className={styles.formField}>
              <label className={styles.formLabel} htmlFor="new-payment-account">
                {strings.paymentsCalendar.accountLabel}
              </label>
              <select
                id="new-payment-account"
                className={styles.formInput}
                value={newAccountId}
                onChange={(event) => setNewAccountId(event.target.value)}
              >
                <option value="">{strings.paymentsCalendar.accountOptional}</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.formField}>
              <span className={styles.formLabel}>{strings.paymentsCalendar.repeatsLabel}</span>
              <div className={styles.recurrenceGroup}>
                {FREQUENCY_OPTIONS.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    className={`${styles.recurrenceOption} ${
                      newFrequency === option.key ? styles.recurrenceOptionActive : ''
                    }`}
                    onClick={() => setNewFrequency(option.key)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              {newFrequency !== 'Once' && (
                <>
                  <div className={styles.recurrenceMonthsRow}>
                    <span className={styles.recurrenceMonthsLabel}>{strings.paymentsCalendar.everyPrefix}</span>
                    <input
                      className={styles.recurrenceMonthsInput}
                      inputMode="numeric"
                      value={newInterval}
                      onChange={(event) => setNewInterval(event.target.value.replace(/[^0-9]/g, ''))}
                    />
                    <span className={styles.recurrenceMonthsLabel}>{intervalUnitLabel}</span>
                  </div>

                  <div className={styles.formField}>
                    <label className={styles.formLabel} htmlFor="new-payment-end-after">
                      {strings.paymentsCalendar.endAfterLabel}
                    </label>
                    <input
                      id="new-payment-end-after"
                      className={styles.formInput}
                      inputMode="numeric"
                      value={newEndAfterOccurrences}
                      onChange={(event) => setNewEndAfterOccurrences(event.target.value.replace(/[^0-9]/g, ''))}
                      placeholder={strings.paymentsCalendar.endAfterPlaceholder}
                    />
                  </div>
                </>
              )}
            </div>

            {createError && (
              <p className={styles.errorText} role="alert">
                {createError}
              </p>
            )}
          </div>

          <div className={styles.fullScreenFooter}>
            <button
              type="button"
              className={styles.modalSaveButton}
              disabled={!newCategoryId || !newDescription.trim() || !newAmount || !newDueDate || creating}
              onClick={handleCreatePayment}
            >
              {strings.common.save}
            </button>
          </div>

          {datePickerOpen && (
            <Modal title={strings.paymentsCalendar.chooseDate} onClose={() => setDatePickerOpen(false)}>
              <div className={styles.monthStepper}>
                <button
                  type="button"
                  className={styles.monthStepButton}
                  onClick={() => shiftPickerMonth(-1)}
                  aria-label="Previous month"
                >
                  <ChevronLeft size={16} strokeWidth={2} />
                </button>
                <span className={styles.monthStepValue}>
                  {strings.months[pickerMonth]} {pickerYear}
                </span>
                <button
                  type="button"
                  className={styles.monthStepButton}
                  onClick={() => shiftPickerMonth(1)}
                  aria-label="Next month"
                >
                  <ChevronRight size={16} strokeWidth={2} />
                </button>
              </div>
              <div className={styles.dayGrid}>
                {Array.from({ length: daysInMonth }, (_, index) => index + 1).map((day) => {
                  const iso = `${pickerYear}-${String(pickerMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const active = iso === newDueDate;
                  return (
                    <button
                      key={day}
                      type="button"
                      className={`${styles.dayButton} ${active ? styles.dayButtonActive : ''}`}
                      onClick={() => chooseDueDay(day)}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </Modal>
          )}
        </div>
      )}

      {confirmingPayment && (
        <Modal title={strings.paymentsCalendar.confirmTransactionTitle} onClose={cancelConfirmPayment}>
          <div className={styles.reviewCard}>
            <div className={styles.reviewRow}>
              <span className={styles.reviewLabel}>{strings.paymentsCalendar.reviewDescription}</span>
              <span className={styles.reviewValue}>{confirmingPayment.title}</span>
            </div>
            <div className={styles.reviewRow}>
              <span className={styles.reviewLabel}>{strings.paymentsCalendar.reviewCategory}</span>
              <span className={styles.reviewValue}>{confirmingPayment.category}</span>
            </div>
            <div className={styles.reviewRow}>
              <span className={styles.reviewLabel}>{strings.paymentsCalendar.reviewAccount}</span>
              {accounts.length > 0 ? (
                <select
                  className={styles.accountSelect}
                  value={confirmAccountId}
                  onChange={(event) => setConfirmAccountId(event.target.value)}
                >
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              ) : (
                <span className={styles.reviewValue}>—</span>
              )}
            </div>
            <div className={styles.reviewRow}>
              <span className={styles.reviewLabel}>{strings.paymentsCalendar.reviewAmount}</span>
              <span className={styles.reviewValue}>
                {formatAmount(confirmingPayment.amount)} {confirmingPayment.currency}
              </span>
            </div>
            <div className={styles.reviewRow}>
              <span className={styles.reviewLabel}>{strings.paymentsCalendar.reviewDate}</span>
              <span className={styles.reviewValue}>{formatToday()}</span>
            </div>
          </div>

          <p className={styles.confirmHint}>{strings.paymentsCalendar.confirmHint}</p>

          {confirmError && (
            <p className={styles.confirmErrorText} role="alert">
              {confirmError}
            </p>
          )}

          <div className={styles.confirmActions}>
            <button type="button" className={styles.cancelButton} onClick={cancelConfirmPayment}>
              {strings.common.cancel}
            </button>
            <button
              type="button"
              className={styles.confirmButton}
              onClick={confirmPayment}
              disabled={confirming || !confirmAccountId}
            >
              {strings.common.confirm}
            </button>
          </div>
        </Modal>
      )}

      {confirmDeletePayment && (
        <ConfirmDialog
          title={strings.paymentsCalendar.deletePaymentConfirmTitle}
          message={strings.paymentsCalendar.deletePaymentConfirmMessage}
          confirmLabel={strings.paymentsCalendar.deletePaymentLabel}
          cancelLabel={strings.common.cancel}
          onCancel={() => setConfirmDeletePayment(null)}
          onConfirm={() => {
            handleDeletePayment(confirmDeletePayment.id);
            setConfirmDeletePayment(null);
          }}
        />
      )}
    </div>
  );
}
