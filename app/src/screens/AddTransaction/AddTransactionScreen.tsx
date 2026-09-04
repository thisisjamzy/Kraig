'use client';

import {
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowRight,
  PiggyBank,
  Delete,
  Check,
} from 'lucide-react';
import Link from 'next/link';
import { Modal } from '@/src/widgets/Modal/Modal';
import { useLogic, KEYPAD_KEYS, formatMoney, type TransactionType } from '@/src/logic/addTransaction/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import styles from './AddTransactionScreen.module.css';

const TYPE_ICONS: Record<TransactionType, typeof ArrowUpRight> = {
  expense: ArrowUpRight,
  income: ArrowDownLeft,
  transfer: ArrowLeftRight,
  savings: PiggyBank,
};

export function AddTransactionScreen() {
  const strings = useStrings();
  const {
    step,
    type,
    category,
    setCategory,
    description,
    setDescription,
    amountString,
    chargesString,
    setChargesString,
    fromAccount,
    toAccount,
    date,
    dateValue,
    categoriesForType,
    hasBudgetedCategories,
    showUnplanned,
    setShowUnplanned,
    budgetHref,
    accounts,
    datePickerOpen,
    setDatePickerOpen,
    pickerMonth,
    pickerYear,
    accountPickerFor,
    setAccountPickerFor,
    fromAccountId,
    toAccountId,
    daysInMonth,
    canContinue,
    selectType,
    openDatePicker,
    chooseDay,
    shiftPickerMonth,
    chooseAccount,
    pressKey,
    goBack,
    goNext,
    handleConfirm,
    loading,
    error,
    submitting,
    submitError,
  } = useLogic();

  const transactionTypes = (Object.keys(TYPE_ICONS) as TransactionType[]).map((key) => ({
    key,
    icon: TYPE_ICONS[key],
    label: strings.addTransaction.types[key].label,
    description: strings.addTransaction.types[key].description,
  }));

  const stepHighlight =
    step === 'type'
      ? strings.addTransaction.stepType
      : step === 'category'
        ? strings.addTransaction.stepCategory
        : step === 'details'
          ? strings.addTransaction.stepDetails
          : strings.addTransaction.stepReview;
  const stepPrefix =
    step === 'type' || step === 'category'
      ? strings.addTransaction.chooseTransactionPrefix
      : strings.addTransaction.provideTransactionPrefix;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={goBack} aria-label="Back">
          <ChevronLeft size={18} strokeWidth={2} />
        </button>
        <h1 className={styles.title}>{strings.addTransaction.title}</h1>
      </header>

      <p className={styles.subheading}>
        {stepPrefix} <span className={styles.subheadingHighlight}>{stepHighlight}</span>
      </p>

      <ScreenState loading={loading} error={error} />

      {!loading && !error && (
        <>
      {step === 'type' && (
        <div className={styles.typeGrid}>
          {transactionTypes.map(({ key, label, description: typeDescription, icon: Icon }) => {
            const active = type === key;
            return (
              <button
                key={key}
                type="button"
                className={`${styles.typeCard} ${active ? styles.typeCardActive : ''}`}
                onClick={() => selectType(key)}
              >
                <span className={styles.typeIcon}>
                  <Icon size={18} strokeWidth={1.75} />
                </span>
                <span className={styles.typeLabel}>{label}</span>
                <span className={styles.typeDescription}>{typeDescription}</span>
              </button>
            );
          })}
        </div>
      )}

      {step === 'category' && (
        <div className={styles.categorySection}>
          {!hasBudgetedCategories && (
            <div className={styles.noBudgetCard}>
              <p className={styles.noBudgetTitle}>{strings.addTransaction.noBudgetTitle}</p>
              <p className={styles.helperText}>{strings.addTransaction.noBudgetBody}</p>
              <div className={styles.noBudgetActions}>
                <Link href={budgetHref} className={styles.pillButtonInteractive}>
                  {strings.addTransaction.addBudgetCta}
                </Link>
                {!showUnplanned && (
                  <button
                    type="button"
                    className={styles.pillButtonInteractive}
                    onClick={() => setShowUnplanned(true)}
                  >
                    {strings.addTransaction.recordUnplannedCta}
                  </button>
                )}
              </div>
            </div>
          )}

          {showUnplanned && (
            <p className={styles.helperText}>{strings.addTransaction.unplannedNotice}</p>
          )}

          {categoriesForType.length > 0 && (
            <div className={styles.categoryList}>
              {categoriesForType.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={styles.categoryRow}
                  onClick={() => setCategory(option.id)}
                >
                  {option.name}
                  <span
                    className={`${styles.radio} ${category === option.id ? styles.radioActive : ''}`}
                  />
                </button>
              ))}
            </div>
          )}

          {(hasBudgetedCategories || showUnplanned) && (
            <button
              type="button"
              className={styles.unplannedLink}
              onClick={() => setShowUnplanned((current) => !current)}
            >
              {showUnplanned ? strings.addTransaction.showBudgetedOnlyCta : strings.addTransaction.recordUnplannedCta}
            </button>
          )}

          <div className={styles.descriptionCard}>
            <span className={styles.descriptionLabel}>{strings.addTransaction.descriptionLabel}</span>
            <input
              type="text"
              className={styles.descriptionInput}
              placeholder={strings.addTransaction.descriptionPlaceholder}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
        </div>
      )}

      {step === 'details' && (
        <div className={styles.detailsSection}>
          <div className={styles.infoRow}>
            <div className={styles.infoRowText}>
              <span className={styles.infoRowLabel}>{strings.addTransaction.transactionDate}</span>
              <span className={styles.infoRowValue}>{date}</span>
            </div>
            <button type="button" className={styles.pillButtonInteractive} onClick={openDatePicker}>
              {strings.common.change}
            </button>
          </div>

          <p className={styles.amountDisplay}>{amountString || '0'}</p>

          {type === 'transfer' ? (
            <>
              <div className={styles.transferRow}>
                <button
                  type="button"
                  className={styles.transferSide}
                  onClick={() => setAccountPickerFor('from')}
                >
                  <span className={styles.infoRowLabel}>{strings.addTransaction.fromAccount}</span>
                  <span className={styles.transferAccountValue}>{fromAccount}</span>
                </button>
                <ArrowRight size={16} strokeWidth={2} className={styles.transferArrow} />
                <button
                  type="button"
                  className={styles.transferSide}
                  onClick={() => setAccountPickerFor('to')}
                >
                  <span className={styles.infoRowLabel}>{strings.addTransaction.toAccount}</span>
                  <span className={styles.transferAccountValue}>{toAccount}</span>
                </button>
              </div>

              <div className={styles.infoRow}>
                <div className={styles.infoRowText}>
                  <span className={styles.infoRowLabel}>{strings.addTransaction.chargesLabel}</span>
                  <span className={styles.helperText}>{strings.addTransaction.chargesHint}</span>
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  className={styles.chargesInput}
                  placeholder="0"
                  value={chargesString}
                  onChange={(event) => setChargesString(event.target.value.replace(/[^0-9.]/g, ''))}
                />
              </div>
            </>
          ) : (
            <div className={styles.infoRow}>
              <div className={styles.infoRowText}>
                <span className={styles.infoRowLabel}>
                  {type === 'income'
                    ? strings.addTransaction.incomeAccount
                    : strings.addTransaction.expenseAccount}
                </span>
                <span className={styles.infoRowValueAccent}>{fromAccount}</span>
              </div>
              <button
                type="button"
                className={styles.pillButtonInteractive}
                onClick={() => setAccountPickerFor('from')}
              >
                {strings.common.change}
              </button>
            </div>
          )}

          <div className={styles.keypad}>
            {KEYPAD_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                className={styles.key}
                onClick={() => pressKey(key)}
                aria-label={key === 'clear' ? 'Clear last digit' : undefined}
              >
                {key === 'clear' ? <Delete size={18} strokeWidth={1.75} /> : key}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 'review' && (
        <div className={styles.reviewCard}>
          <h2 className={styles.reviewTitle}>{strings.addTransaction.reviewTitle}</h2>
          <div className={styles.reviewRow}>
            <span className={styles.reviewLabel}>{strings.addTransaction.reviewDescription}</span>
            <span className={styles.reviewValue}>{description || '—'}</span>
          </div>
          <div className={styles.reviewRow}>
            <span className={styles.reviewLabel}>{strings.addTransaction.reviewCategory}</span>
            <span className={styles.reviewValue}>{category || '—'}</span>
          </div>
          <div className={styles.reviewRow}>
            <span className={styles.reviewLabel}>{strings.addTransaction.reviewAmount}</span>
            <span className={styles.reviewValue}>{formatMoney(amountString)} XAF</span>
          </div>
          {type === 'transfer' && Number(chargesString) > 0 && (
            <div className={styles.reviewRow}>
              <span className={styles.reviewLabel}>{strings.addTransaction.reviewCharges}</span>
              <span className={styles.reviewValue}>{formatMoney(chargesString)} XAF</span>
            </div>
          )}
          <div className={styles.reviewRow}>
            <span className={styles.reviewLabel}>{strings.addTransaction.reviewType}</span>
            <span className={styles.reviewValue}>
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </span>
          </div>
          <div className={styles.reviewRow}>
            <span className={styles.reviewLabel}>{strings.addTransaction.reviewAccounts}</span>
            <span className={styles.reviewValueWithAction}>
              <span className={styles.reviewValue}>
                {type === 'transfer' ? `${fromAccount} to ${toAccount}` : fromAccount}
              </span>
              <button
                type="button"
                className={styles.reviewChangeButton}
                onClick={() => setAccountPickerFor('from')}
              >
                {strings.common.change}
              </button>
            </span>
          </div>
          <div className={styles.reviewRow}>
            <span className={styles.reviewLabel}>{strings.addTransaction.reviewDate}</span>
            <span className={styles.reviewValueWithAction}>
              <span className={styles.reviewValue}>{date}</span>
              <button type="button" className={styles.reviewChangeButton} onClick={openDatePicker}>
                {strings.common.change}
              </button>
            </span>
          </div>
        </div>
      )}

      {step === 'review' && submitError && (
        <p className={styles.submitError} role="alert">
          {submitError}
        </p>
      )}

      <button
        type="button"
        className={styles.continueButton}
        disabled={!canContinue}
        onClick={step === 'review' ? handleConfirm : goNext}
      >
        {step === 'review'
          ? submitting
            ? strings.addTransaction.saving
            : strings.common.confirm
          : strings.common.continueLabel}
        <ArrowUpRight size={18} strokeWidth={2.25} />
      </button>

      {step !== 'type' && (
        <p className={styles.typeIndicator}>
          {strings.addTransaction.addingAnPrefix}{' '}
          <strong>{strings.addTransaction.types[type].label}</strong>
        </p>
      )}
        </>
      )}

      {datePickerOpen && (
        <Modal title={strings.addTransaction.chooseDate} onClose={() => setDatePickerOpen(false)}>
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
              const iso = `${pickerYear}-${String(pickerMonth + 1).padStart(2, '0')}-${String(
                day
              ).padStart(2, '0')}`;
              const active = iso === dateValue;
              return (
                <button
                  key={day}
                  type="button"
                  className={`${styles.dayButton} ${active ? styles.dayButtonActive : ''}`}
                  onClick={() => chooseDay(day)}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </Modal>
      )}

      {accountPickerFor && (
        <Modal title={strings.addTransaction.chooseAccount} onClose={() => setAccountPickerFor(null)}>
          <div className={styles.accountList}>
            {accounts.map((account) => {
              const active =
                (accountPickerFor === 'from' && account.id === fromAccountId) ||
                (accountPickerFor === 'to' && account.id === toAccountId);
              return (
                <button
                  key={account.id}
                  type="button"
                  className={styles.accountRow}
                  onClick={() => chooseAccount(account.id)}
                >
                  {account.name}
                  {active && <Check size={16} strokeWidth={2.25} />}
                </button>
              );
            })}
          </div>
        </Modal>
      )}
    </div>
  );
}
