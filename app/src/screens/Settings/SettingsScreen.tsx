'use client';

import {
  ChevronLeft,
  ChevronRight,
  Share2,
  Coins,
  KeyRound,
  Bell,
  LogOut,
  Plus,
  Trash2,
  Check,
  Search,
} from 'lucide-react';
import { Modal } from '@/src/widgets/Modal/Modal';
import { useLogic } from '@/src/logic/settings/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
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
    setPinModalOpen,
    pinDraft,
    setPinDraft,
    pinError,
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
        <span className={styles.actionRowIcon}>
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
        <span className={styles.actionRowIcon}>
          <Coins size={18} strokeWidth={1.75} />
        </span>
        <span className={styles.actionRowText}>
          <span className={styles.actionRowLabel}>{strings.settings.currency}</span>
          <span className={styles.actionRowMeta}>{currency}</span>
        </span>
        <ChevronRight size={16} strokeWidth={2} className={styles.actionRowChevron} />
      </button>

      <button type="button" className={styles.actionRow} onClick={() => setPinModalOpen(true)}>
        <span className={styles.actionRowIcon}>
          <KeyRound size={18} strokeWidth={1.75} />
        </span>
        <span className={styles.actionRowText}>
          <span className={styles.actionRowLabel}>{strings.settings.appPin}</span>
          <span className={styles.actionRowMeta}>{strings.settings.appPinMeta}</span>
        </span>
        <ChevronRight size={16} strokeWidth={2} className={styles.actionRowChevron} />
      </button>

      <section className={styles.section}>
        <div className={styles.sectionHeaderRow}>
          <span className={styles.sectionIcon}>
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
          title={strings.settings.changePinTitle}
          onClose={() => {
            setPinModalOpen(false);
            setPinDraft('');
          }}
        >
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
        </Modal>
      )}
    </div>
  );
}
