'use client';

import {
  ChevronLeft,
  ChevronRight,
  Share2,
  Coins,
  KeyRound,
  ShieldCheck,
  Bell,
  LogOut,
  Plus,
  Trash2,
  Check,
  Search,
  Tags,
  FileDown,
  Download,
  Upload,
  FileBarChart,
} from 'lucide-react';
import Link from 'next/link';
import { Modal } from '@/src/widgets/Modal/Modal';
import { useLogic } from '@/src/logic/settings/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { iconTint } from '@/src/viewmodels/iconTint';
import styles from './SettingsScreen.module.css';

export function SettingsScreen() {
  const strings = useStrings();
  const {
    user,
    currency,
    currencyOpen,
    setCurrencyOpen,
    currencySearch,
    setCurrencySearch,
    filteredCurrencies,
    currencySaving,
    currencyError,
    settingsLoading,
    settingsError,
    pinModalOpen,
    openPinModal,
    closePinModal,
    pinStep,
    currentPinDraft,
    setCurrentPinDraft,
    confirmingPin,
    handleConfirmCurrentPin,
    pinDraft,
    setPinDraft,
    pinError,
    pinEnabled,
    pinTogglePending,
    togglePinEnabled,
    reminders,
    shareCopied,
    handleShare,
    addReminder,
    updateReminder,
    removeReminder,
    handleSignOut,
    handleSavePin,
    setCurrency,
    goBack,
    downloadCsvTemplate,
    exportTransactionsCsv,
  } = useLogic();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={goBack} aria-label="Back">
          <ChevronLeft size={18} strokeWidth={2} />
        </button>
        <h1 className={styles.title}>{strings.settings.title}</h1>
      </header>

      <ScreenState loading={settingsLoading} error={settingsError} />

      <div className={styles.profileCard}>
        <span className={styles.avatar}>{user.name.charAt(0)}</span>
        <div className={styles.profileText}>
          <p className={styles.profileName}>{user.name}</p>
          <p className={styles.profileEmail}>{user.email}</p>
        </div>
      </div>

      <button
        type="button"
        className={styles.actionRow}
        onClick={() => handleShare(strings.settings.shareText)}
      >
        <span className={styles.actionRowIcon} style={{ background: iconTint(0) }}>
          <Share2 size={18} strokeWidth={1.75} />
        </span>
        <span className={styles.actionRowText}>
          <span className={styles.actionRowLabel}>{strings.settings.shareTitle}</span>
          <span className={styles.actionRowMeta}>
            {shareCopied ? strings.settings.shareCopied : strings.settings.shareMeta}
          </span>
        </span>
        <ChevronRight size={16} strokeWidth={2} className={styles.actionRowChevron} />
      </button>

      <button type="button" className={styles.actionRow} onClick={() => setCurrencyOpen(true)}>
        <span className={styles.actionRowIcon} style={{ background: iconTint(1) }}>
          <Coins size={18} strokeWidth={1.75} />
        </span>
        <span className={styles.actionRowText}>
          <span className={styles.actionRowLabel}>{strings.settings.currency}</span>
          <span className={styles.actionRowMeta}>{currency}</span>
        </span>
        <ChevronRight size={16} strokeWidth={2} className={styles.actionRowChevron} />
      </button>

      <button type="button" className={styles.actionRow} onClick={openPinModal} disabled={!pinEnabled}>
        <span className={styles.actionRowIcon} style={{ background: iconTint(2) }}>
          <KeyRound size={18} strokeWidth={1.75} />
        </span>
        <span className={styles.actionRowText}>
          <span className={styles.actionRowLabel}>{strings.settings.appPin}</span>
          <span className={styles.actionRowMeta}>{strings.settings.appPinMeta}</span>
        </span>
        <ChevronRight size={16} strokeWidth={2} className={styles.actionRowChevron} />
      </button>

      <label className={styles.actionRow}>
        <span className={styles.actionRowIcon} style={{ background: iconTint(3) }}>
          <ShieldCheck size={18} strokeWidth={1.75} />
        </span>
        <span className={styles.actionRowText}>
          <span className={styles.actionRowLabel}>{strings.settings.requirePin}</span>
          <span className={styles.actionRowMeta}>{strings.settings.requirePinMeta}</span>
        </span>
        <input
          type="checkbox"
          checked={pinEnabled}
          disabled={pinTogglePending}
          onChange={togglePinEnabled}
        />
      </label>

      <Link href="/categories" className={styles.actionRow}>
        <span className={styles.actionRowIcon} style={{ background: iconTint(4) }}>
          <Tags size={18} strokeWidth={1.75} />
        </span>
        <span className={styles.actionRowText}>
          <span className={styles.actionRowLabel}>{strings.settings.createCategory}</span>
          <span className={styles.actionRowMeta}>{strings.settings.createCategoryMeta}</span>
        </span>
        <ChevronRight size={16} strokeWidth={2} className={styles.actionRowChevron} />
      </Link>

      <section className={styles.section}>
        <div className={styles.sectionHeaderRow}>
          <h2 className={styles.sectionTitle}>{strings.settings.dataSectionTitle}</h2>
        </div>

        <button type="button" className={styles.actionRow} onClick={downloadCsvTemplate}>
          <span className={styles.actionRowIcon} style={{ background: iconTint(5) }}>
            <FileDown size={18} strokeWidth={1.75} />
          </span>
          <span className={styles.actionRowText}>
            <span className={styles.actionRowLabel}>{strings.settings.downloadTemplate}</span>
            <span className={styles.actionRowMeta}>{strings.settings.downloadTemplateMeta}</span>
          </span>
        </button>

        <Link href="/settings/import" className={styles.actionRow}>
          <span className={styles.actionRowIcon} style={{ background: iconTint(6) }}>
            <Upload size={18} strokeWidth={1.75} />
          </span>
          <span className={styles.actionRowText}>
            <span className={styles.actionRowLabel}>{strings.settings.importTransactions}</span>
            <span className={styles.actionRowMeta}>{strings.settings.importTransactionsMeta}</span>
          </span>
          <ChevronRight size={16} strokeWidth={2} className={styles.actionRowChevron} />
        </Link>

        <button type="button" className={styles.actionRow} onClick={exportTransactionsCsv}>
          <span className={styles.actionRowIcon} style={{ background: iconTint(7) }}>
            <Download size={18} strokeWidth={1.75} />
          </span>
          <span className={styles.actionRowText}>
            <span className={styles.actionRowLabel}>{strings.settings.exportTransactions}</span>
            <span className={styles.actionRowMeta}>{strings.settings.exportTransactionsMeta}</span>
          </span>
        </button>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeaderRow}>
          <span className={styles.sectionIcon} style={{ background: iconTint(8) }}>
            <ShieldCheck size={16} strokeWidth={1.75} />
          </span>
          <h2 className={styles.sectionTitle}>{strings.settings.auditSectionTitle}</h2>
        </div>

        <Link href="/settings/reconcile" className={styles.actionRow}>
          <span className={styles.actionRowIcon} style={{ background: iconTint(9) }}>
            <ShieldCheck size={18} strokeWidth={1.75} />
          </span>
          <span className={styles.actionRowText}>
            <span className={styles.actionRowLabel}>{strings.settings.reconcileBalances}</span>
            <span className={styles.actionRowMeta}>{strings.settings.reconcileBalancesMeta}</span>
          </span>
          <ChevronRight size={16} strokeWidth={2} className={styles.actionRowChevron} />
        </Link>

        <Link href="/settings/audit-reports" className={styles.actionRow}>
          <span className={styles.actionRowIcon} style={{ background: iconTint(10) }}>
            <FileBarChart size={18} strokeWidth={1.75} />
          </span>
          <span className={styles.actionRowText}>
            <span className={styles.actionRowLabel}>{strings.auditReports.entryLabel}</span>
            <span className={styles.actionRowMeta}>{strings.auditReports.entryMeta}</span>
          </span>
          <ChevronRight size={16} strokeWidth={2} className={styles.actionRowChevron} />
        </Link>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeaderRow}>
          <span className={styles.sectionIcon} style={{ background: iconTint(11) }}>
            <Bell size={16} strokeWidth={1.75} />
          </span>
          <h2 className={styles.sectionTitle}>{strings.settings.dailyReminders}</h2>
        </div>
        <p className={styles.sectionCaption}>{strings.settings.dailyRemindersCaption}</p>

        <div className={styles.reminderList}>
          {reminders.map((time, index) => (
            <div key={index} className={styles.reminderRow}>
              <input
                type="time"
                className={styles.timeInput}
                value={time}
                onChange={(event) => updateReminder(index, event.target.value)}
              />
              <button
                type="button"
                className={styles.iconButtonDanger}
                onClick={() => removeReminder(index)}
                aria-label="Remove reminder"
              >
                <Trash2 size={16} strokeWidth={1.75} />
              </button>
            </div>
          ))}
        </div>

        <button type="button" className={styles.addButton} onClick={addReminder}>
          <Plus size={16} strokeWidth={2.25} />
          {strings.settings.addReminder}
        </button>
      </section>

      <button type="button" className={styles.signOutButton} onClick={handleSignOut}>
        <LogOut size={18} strokeWidth={1.75} />
        {strings.settings.signOut}
      </button>

      {currencyOpen && (
        <Modal title={strings.settings.chooseCurrency} onClose={() => setCurrencyOpen(false)}>
          <div className={styles.searchRow}>
            <Search size={16} strokeWidth={2} className={styles.searchIcon} />
            <input
              className={styles.searchInput}
              placeholder={strings.settings.searchCurrenciesPlaceholder}
              value={currencySearch}
              onChange={(event) => setCurrencySearch(event.target.value)}
            />
          </div>
          {currencyError && (
            <p className={styles.currencyErrorText} role="alert">
              {currencyError}
            </p>
          )}
          <div className={styles.currencyList}>
            {filteredCurrencies.map((entry) => (
              <button
                key={entry.code}
                type="button"
                className={styles.currencyRow}
                disabled={currencySaving}
                onClick={() => setCurrency(entry.code)}
              >
                <span className={styles.currencyLabelGroup}>
                  <span className={styles.currencyCode}>{entry.code}</span>
                  <span className={styles.currencyName}>{entry.name}</span>
                </span>
                {currency === entry.code && <Check size={16} strokeWidth={2.25} />}
              </button>
            ))}
          </div>
        </Modal>
      )}

      {pinModalOpen && (
        <Modal
          title={pinStep === 'confirm' ? strings.settings.confirmPinTitle : strings.settings.changePinTitle}
          onClose={closePinModal}
        >
          {pinStep === 'confirm' ? (
            <>
              <div className={styles.formField}>
                <label className={styles.formLabel} htmlFor="current-pin">
                  {strings.settings.currentPinLabel}
                </label>
                <input
                  id="current-pin"
                  className={styles.formInput}
                  inputMode="numeric"
                  type="password"
                  maxLength={5}
                  value={currentPinDraft}
                  onChange={(event) => setCurrentPinDraft(event.target.value.replace(/[^0-9]/g, '').slice(0, 5))}
                  placeholder="•••••"
                />
              </div>
              {pinError && (
                <p className={styles.errorText} role="alert">
                  {pinError}
                </p>
              )}
              <button
                type="button"
                className={styles.modalSaveButton}
                disabled={currentPinDraft.length !== 5 || confirmingPin}
                onClick={handleConfirmCurrentPin}
              >
                {strings.common.continueLabel}
              </button>
            </>
          ) : (
            <>
              <div className={styles.formField}>
                <label className={styles.formLabel} htmlFor="new-pin">
                  {strings.settings.newPinLabel}
                </label>
                <input
                  id="new-pin"
                  className={styles.formInput}
                  inputMode="numeric"
                  type="password"
                  maxLength={5}
                  value={pinDraft}
                  onChange={(event) => setPinDraft(event.target.value.replace(/[^0-9]/g, '').slice(0, 5))}
                  placeholder="•••••"
                />
              </div>
              {pinError && (
                <p className={styles.errorText} role="alert">
                  {pinError}
                </p>
              )}
              <button
                type="button"
                className={styles.modalSaveButton}
                disabled={pinDraft.length !== 5}
                onClick={handleSavePin}
              >
                {strings.common.save}
              </button>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
