'use client';

// Print or export a basket's budget snapshot on the phone: a bottom sheet
// with a preview of the snapshot on top, the options as field cards (Month,
// Paper, what to include, grouping), then Print and Export as PDF (the
// share sheet where it takes files, else a download). Opened from the basket
// screen's "..." menu. The logic is useBasketReceipt's, shared with the
// wide side panel.

import { FileDown, Printer } from 'lucide-react';
import { useBasketReceipt } from '@/src/logic/planningBucket/useBasketReceipt';
import { formFrameStyles, SegmentedField, SelectField, SwitchField } from '@/src/widgets/FormFrame/FormFrame';
import { Modal } from '@/src/widgets/Modal/Modal';
import { ReceiptPrint, ReceiptView } from '@/src/widgets/Receipt/ReceiptView';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import p from '@/src/phone/screens/Planning/Planning.module.css';
import styles from '@/src/phone/screens/PlanningBucket/ReceiptSheet.module.css';

export function ReceiptSheet({ bucketId, month, onClose }: { bucketId: string; month: string; onClose: () => void }) {
  const r = useBasketReceipt(bucketId, month);
  const ready = Boolean(r.receipt);

  return (
    <Modal title="Print or export" onClose={onClose}>
      <div className={styles.body}>
        {r.loading && !r.receipt ? (
          <ScreenState loading />
        ) : r.missing ? (
          <ScreenState error="This basket could not be found." />
        ) : (
          <>
            <div className={styles.preview} aria-label="Preview">
              {r.receipt && <ReceiptView receipt={r.receipt} />}
            </div>
            <div className={formFrameStyles.cards}>
              <SelectField label="Month" value={r.month} onChange={r.setMonth} options={r.months} />
              <SegmentedField
                label="Paper"
                value={r.options.paper}
                onChange={(v) => r.setOption('paper', v)}
                options={[
                  { value: 'a4', label: 'A4' },
                  { value: 'receipt', label: 'Receipt (80 mm)' },
                ]}
              />
              <SwitchField label="Adjustments" checked={r.options.adjustments} onChange={(v) => r.setOption('adjustments', v)} />
              <SwitchField label="Notes" checked={r.options.notes} onChange={(v) => r.setOption('notes', v)} />
              <SwitchField label="QR code" checked={r.options.qr} onChange={(v) => r.setOption('qr', v)} />
              <SwitchField label="Group items by status" checked={r.options.groupByStatus} onChange={(v) => r.setOption('groupByStatus', v)} />
            </div>
            {r.amountsHidden && <p className={styles.hint}>Amounts will be visible on the snapshot.</p>}
            {r.error && (
              <p className={styles.error} role="alert">
                {r.error}
              </p>
            )}
          </>
        )}
      </div>
      <div className={styles.actions}>
        <button type="button" className={`${p.fillButton} ${styles.ghost}`} disabled={!ready} onClick={r.print}>
          <Printer size={16} strokeWidth={2} aria-hidden /> Print
        </button>
        <button type="button" className={p.fillButton} data-tone="blue" disabled={!ready || r.busy !== null} onClick={r.exportPdf}>
          <FileDown size={16} strokeWidth={2} aria-hidden />
          {r.busy ? 'Making the PDF…' : 'Export as PDF'}
        </button>
      </div>
      {r.printing && r.receipt && <ReceiptPrint receipt={r.receipt} onDone={r.donePrinting} />}
    </Modal>
  );
}
