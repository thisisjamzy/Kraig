'use client';

// Print or export a basket's budget snapshot, on tablet and web: a side
// panel with a live preview of the snapshot beside the options (above them
// on a narrow panel) as field cards (Month, Paper, what to include,
// grouping), then Print and Export as PDF (a download, or the share sheet
// where it takes files). Opened from the basket page's "..." menu and from each basket's
// row menu on the Baskets page. The logic is useBasketReceipt's, shared
// with the phone sheet.

import { FileDown, Printer } from 'lucide-react';
import { useBasketReceipt } from '@/src/logic/planningBucket/useBasketReceipt';
import { FormChrome, SegmentedField, SelectField, SwitchField, formFrameStyles } from '@/src/widgets/FormFrame/FormFrame';
import { ReceiptPrint, ReceiptView } from '@/src/widgets/Receipt/ReceiptView';
import { ScreenState } from '@/src/widgets/ScreenState/ScreenState';
import { WebFormPanel } from '@/src/widgets/WebFormPanel/WebFormPanel';
import styles from './ReceiptPanel.module.css';

export function ReceiptPanel({ bucketId, month, onClose }: { bucketId: string; month: string; onClose: () => void }) {
  const r = useBasketReceipt(bucketId, month);
  const ready = Boolean(r.receipt);

  return (
    <WebFormPanel onClose={onClose} width={1040}>
      <FormChrome title="Print or export" context={r.receipt?.header.name} onClose={onClose}>
        {r.loading && !r.receipt ? (
          <ScreenState loading />
        ) : r.missing ? (
          <ScreenState error="This basket could not be found." />
        ) : (
          <div className={styles.layout}>
            <div className={styles.preview} aria-label="Preview">
              {r.receipt && <ReceiptView receipt={r.receipt} />}
            </div>
            <div className={styles.options}>
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
                  hint={r.options.paper === 'receipt' ? 'One continuous page, as long as the snapshot.' : 'Centred on the page, continued on the next if long.'}
                />
                <SwitchField label="Adjustments" description="Money moved in or out, if any." checked={r.options.adjustments} onChange={(v) => r.setOption('adjustments', v)} />
                <SwitchField label="Notes" description="The basket's notes, if any." checked={r.options.notes} onChange={(v) => r.setOption('notes', v)} />
                <SwitchField label="QR code" description="Opens the basket in Dreda, for you only." checked={r.options.qr} onChange={(v) => r.setOption('qr', v)} />
                <SwitchField label="Group items by status" checked={r.options.groupByStatus} onChange={(v) => r.setOption('groupByStatus', v)} />
              </div>
              {r.amountsHidden && <p className={styles.note}>Amounts will be visible on the snapshot.</p>}
              {r.error && (
                <p className={styles.error} role="alert">
                  {r.error}
                </p>
              )}
              <div className={styles.actions}>
                <button type="button" className={styles.secondary} disabled={!ready} onClick={r.print}>
                  <Printer size={16} strokeWidth={2} aria-hidden /> Print
                </button>
                <button type="button" className={formFrameStyles.primary} disabled={!ready || r.busy !== null} onClick={r.exportPdf}>
                  <FileDown size={16} strokeWidth={2} aria-hidden /> {r.busy ? 'Making the PDF…' : 'Export as PDF'}
                </button>
              </div>
            </div>
          </div>
        )}
      </FormChrome>
      {r.printing && r.receipt && <ReceiptPrint receipt={r.receipt} onDone={r.donePrinting} />}
    </WebFormPanel>
  );
}
