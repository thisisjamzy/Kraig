'use client';

// New wallet on tablet and web: the same fields and logic as the phone's
// Add wallet (src/logic/wallets), in a dialog opened from "New wallet".

import { Modal } from '@/src/widgets/Modal/Modal';
import type { useLogic } from '@/src/logic/wallets/useLogic';
import styles from './WalletsScreen.module.css';

export function AddWalletSheet({ v }: { v: ReturnType<typeof useLogic> }) {
  return (
    <Modal title="New wallet" onClose={() => v.setAddOpen(false)}>
      <div className={styles.form}>
        <label>
          Name
          <input value={v.newName} onChange={(e) => v.setNewName(e.target.value)} placeholder="e.g. MTN Mobile Money" autoFocus />
        </label>
        <label>
          Short name
          <input value={v.newShortName} maxLength={5} onChange={(e) => v.setNewShortName(e.target.value.slice(0, 5))} placeholder={v.newName.trim().slice(0, 5) || 'MTN'} />
        </label>
        <label>
          Type
          <select value={v.newType} onChange={(e) => v.setNewType(e.target.value as typeof v.newType)}>
            {v.accountTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label>
          Currency
          <select value={v.newCurrency} onChange={(e) => v.setNewCurrency(e.target.value)}>
            {v.currencyOptions.map((o) => (
              <option key={o.code} value={o.code}>
                {o.code}, {o.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Starting balance
          <input inputMode="decimal" value={v.newStartingBalance} onChange={(e) => v.setNewStartingBalance(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0" />
        </label>
        {v.createError && (
          <p className={styles.error} role="alert">
            {v.createError}
          </p>
        )}
        <button type="button" className={styles.primary} disabled={!v.newName.trim() || v.creating} onClick={v.handleCreateWallet}>
          {v.creating ? 'Creating…' : 'Create wallet'}
        </button>
      </div>
    </Modal>
  );
}
