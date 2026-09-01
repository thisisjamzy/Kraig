'use client';

import { useLogic, formatAmount } from '@/src/logic/onboarding/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { Logo } from '@/src/widgets/Logo/Logo';
import styles from './OnboardingScreen.module.css';

export function OnboardingScreen() {
  const allStrings = useStrings();
  const strings = allStrings.onboarding;
  const monthNames = allStrings.months;
  const {
    step,
    stepIndex,
    stepCount,
    goNext,
    goBack,
    finish,
    canContinue,

    wallets,
    walletName,
    setWalletName,
    walletType,
    setWalletType,
    walletCurrency,
    setWalletCurrency,
    walletStartingBalance,
    setWalletStartingBalance,
    accountTypes,
    currencyOptions,
    creatingWallet,
    walletError,
    createWallet,

    categories,
    categoryName,
    setCategoryName,
    categoryType,
    setCategoryType,
    creatingCategory,
    categoryError,
    createCategory,
    availablePresets,

    expenseCategories,
    budgetMonthIndex,
    setBudgetMonthIndex,
    budgetYear,
    setBudgetYear,
    budgetYearOptions,
    budgetCategoryId,
    setBudgetCategoryId,
    budgetAmount,
    setBudgetAmount,
    creatingBudget,
    budgetError,
    createBudgetItem,
    createdBudgetCount,
  } = useLogic();

  return (
    <div className={styles.page}>
      <div className={styles.logoRow}>
        <Logo className={styles.logo} />
      </div>

      <div className={styles.progress}>
        {Array.from({ length: stepCount }, (_, i) => (
          <span key={i} className={`${styles.progressDot} ${i <= stepIndex ? styles.progressDotActive : ''}`} />
        ))}
      </div>

      {step === 'wallets' && (
        <section className={styles.section}>
          <h1 className={styles.title}>{strings.walletsTitle}</h1>
          <p className={styles.subtitle}>{strings.walletsSubtitle}</p>

          {wallets.length > 0 && (
            <div className={styles.list}>
              {wallets.map((wallet) => (
                <div key={wallet.id} className={styles.listRow}>
                  <span className={styles.dot} style={{ background: wallet.color }} />
                  <span className={styles.listName}>{wallet.name}</span>
                  <span className={styles.listMeta}>
                    {formatAmount(wallet.amount)} {wallet.currency}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className={styles.form}>
            <input
              className={styles.input}
              placeholder={strings.namePlaceholder}
              value={walletName}
              onChange={(e) => setWalletName(e.target.value)}
            />
            <div className={styles.row}>
              <select
                className={styles.input}
                value={walletType}
                onChange={(e) => setWalletType(e.target.value as typeof walletType)}
              >
                {accountTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <select className={styles.input} value={walletCurrency} onChange={(e) => setWalletCurrency(e.target.value)}>
                {currencyOptions.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.code}
                  </option>
                ))}
              </select>
            </div>
            <input
              className={styles.input}
              inputMode="numeric"
              placeholder={strings.startingBalancePlaceholder}
              value={walletStartingBalance}
              onChange={(e) => setWalletStartingBalance(e.target.value.replace(/[^0-9.]/g, ''))}
            />
            {walletError && (
              <p className={styles.errorText} role="alert">
                {walletError}
              </p>
            )}
            <button
              type="button"
              className={styles.addButton}
              disabled={!walletName.trim() || creatingWallet}
              onClick={createWallet}
            >
              {strings.addWallet}
            </button>
          </div>
        </section>
      )}

      {step === 'categories' && (
        <section className={styles.section}>
          <h1 className={styles.title}>{strings.categoriesTitle}</h1>
          <p className={styles.subtitle}>{strings.categoriesSubtitle}</p>

          {categories.length > 0 && (
            <div className={styles.list}>
              {categories.map((category) => (
                <div key={category.id} className={styles.listRow}>
                  <span className={styles.listName}>{category.name}</span>
                  <span className={styles.listMeta}>{category.transactionType}</span>
                </div>
              ))}
            </div>
          )}

          {availablePresets.length > 0 && (
            <div className={styles.presetSection}>
              <span className={styles.presetLabel}>{strings.suggestions}</span>
              <div className={styles.presetGrid}>
                {availablePresets.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    className={styles.presetChip}
                    disabled={creatingCategory}
                    onClick={() => createCategory(preset.name, preset.transactionType)}
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className={styles.form}>
            <input
              className={styles.input}
              placeholder={strings.namePlaceholder}
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
            />
            <select
              className={styles.input}
              value={categoryType}
              onChange={(e) => setCategoryType(e.target.value as typeof categoryType)}
            >
              <option value="Expense">Expense</option>
              <option value="Income">Income</option>
              <option value="Savings">Savings</option>
            </select>
            {categoryError && (
              <p className={styles.errorText} role="alert">
                {categoryError}
              </p>
            )}
            <button
              type="button"
              className={styles.addButton}
              disabled={!categoryName.trim() || creatingCategory}
              onClick={() => createCategory()}
            >
              {strings.addCategory}
            </button>
          </div>
        </section>
      )}

      {step === 'budget' && (
        <section className={styles.section}>
          <h1 className={styles.title}>{strings.budgetTitle}</h1>
          <p className={styles.subtitle}>{strings.budgetSubtitle}</p>

          {createdBudgetCount > 0 && (
            <p className={styles.subtitle}>
              {createdBudgetCount} {strings.budgetItemsAddedSuffix}
            </p>
          )}

          {expenseCategories.length > 0 ? (
            <div className={styles.form}>
              <div className={styles.row}>
                <select
                  className={styles.input}
                  value={budgetMonthIndex}
                  onChange={(e) => setBudgetMonthIndex(Number(e.target.value))}
                >
                  {monthNames.map((name, index) => (
                    <option key={name} value={index}>
                      {name}
                    </option>
                  ))}
                </select>
                <select
                  className={styles.input}
                  value={budgetYear}
                  onChange={(e) => setBudgetYear(Number(e.target.value))}
                >
                  {budgetYearOptions.map((yearOption) => (
                    <option key={yearOption} value={yearOption}>
                      {yearOption}
                    </option>
                  ))}
                </select>
              </div>
              <select
                className={styles.input}
                value={budgetCategoryId}
                onChange={(e) => setBudgetCategoryId(e.target.value)}
              >
                <option value="" disabled>
                  {strings.categoryPlaceholder}
                </option>
                {expenseCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              <input
                className={styles.input}
                inputMode="numeric"
                placeholder={strings.amountPlaceholder}
                value={budgetAmount}
                onChange={(e) => setBudgetAmount(e.target.value.replace(/[^0-9]/g, ''))}
              />
              {budgetError && (
                <p className={styles.errorText} role="alert">
                  {budgetError}
                </p>
              )}
              <button
                type="button"
                className={styles.addButton}
                disabled={!budgetCategoryId || !budgetAmount || creatingBudget}
                onClick={createBudgetItem}
              >
                {strings.addBudgetItem}
              </button>
            </div>
          ) : (
            <p className={styles.subtitle}>No expense categories yet — add one back in step 2 to budget it.</p>
          )}
        </section>
      )}

      <div className={styles.footer}>
        {stepIndex > 0 && (
          <button type="button" className={styles.backButton} onClick={goBack}>
            {strings.back}
          </button>
        )}
        {step === 'budget' ? (
          <button type="button" className={styles.continueButton} onClick={finish}>
            {strings.finishSetup}
          </button>
        ) : (
          <button type="button" className={styles.continueButton} disabled={!canContinue} onClick={goNext}>
            {strings.continueLabel}
          </button>
        )}
      </div>
    </div>
  );
}
