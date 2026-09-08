'use client';

import { ChevronLeft, ChevronDown, Check, Repeat, Plus } from 'lucide-react';
import { Modal } from '@/src/widgets/Modal/Modal';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import {
  useLogic,
  formatAmount,
  dueLabel,
  isOverdue,
  formatDueDate,
  formatToday,
  DUE_FILTERS,
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
}: {
  payment: PendingPayment;
  onMarkAsPaid: (id: string) => void;
  markAsPaidLabel: string;
  recurringLabel: string;
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
    goToGoals,

    loading,
    error,
  } = useLogic();

  const selectedFilterLabel = DUE_FILTERS.find((entry) => entry.key === dueFilter)?.label ?? '';

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

        <button type="button" className={styles.addPaymentButton} onClick={goToGoals}>
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
              />
            ))}
          </div>
        </Modal>
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
    </div>
  );
}
