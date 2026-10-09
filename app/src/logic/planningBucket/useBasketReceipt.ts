'use client';

// A basket's budget snapshot, its options step shared by the phone sheet
// (src/phone/screens/PlanningBucket/ReceiptSheet.tsx) and the wide side
// panel (src/screens/PlanningBucket/ReceiptPanel.tsx): the month and
// options, the snapshot built from that month's budget (the same data and
// builder the basket page uses), and Print or Export as PDF.
// Works offline from the cached data, saying so on the snapshot.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useMonthBudget } from '@/src/shared/hooks/useMonthBudget';
import { addMonths } from '@/src/shared/budget/monthBudget';
import { monthTitle } from '@/src/viewmodels/planning';
import { useAmountsHidden } from '@/src/shared/hooks/usePrivacy';
import { useSyncState } from '@/src/shared/hooks/useSyncStatus';
import { buildAdjustments } from '@/src/logic/planning/adjustments';
import { buildBasketReceipt, DEFAULT_RECEIPT_OPTIONS, type ReceiptOptions } from './basketReceipt';
import { canShareFiles, downloadFile, loadReceiptAssets, receiptFile, receiptPdf, shareOrDownload } from './receiptPdf';

export function useBasketReceipt(bucketId: string, initialMonth: string) {
  const [month, setMonth] = useState(initialMonth);
  /** The twelve months before the one shown, and three after. */
  const months = useMemo(() => Array.from({ length: 16 }, (_, i) => addMonths(initialMonth, 3 - i)).map((m) => ({ value: m, label: monthTitle(m) })), [initialMonth]);
  const [options, setOptions] = useState<ReceiptOptions>(DEFAULT_RECEIPT_OPTIONS);
  const [busy, setBusy] = useState<'pdf' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const [amountsHidden] = useAmountsHidden();
  const sync = useSyncState();
  const data = useMonthBudget(month);
  const [now, setNow] = useState(() => new Date());

  const bucket = data.buckets.find((b) => b.id === bucketId) ?? null;

  const receipt = useMemo(() => {
    if (!bucket) return null;
    const { budget, accounts, ctx } = data;
    const adjustments = buildAdjustments(data.allocations, data.justifications, { itemsByBucket: data.itemsByBucket, accounts, ctx }, bucketId);
    return buildBasketReceipt(bucketId, month, options, {
      budget,
      bucket,
      accountName: (id) => (id ? (accounts.find((a) => a.id === id)?.name ?? null) : null),
      adjustments,
      currency: ctx.display,
      now,
      offline: sync.online ? null : { lastSync: sync.lastSync ? new Date(sync.lastSync) : null },
      link: typeof window === 'undefined' ? undefined : `${window.location.origin}/budget/basket/${bucketId}?month=${month}`,
    });
  }, [bucket, data, bucketId, month, options, now, sync.online, sync.lastSync]);

  // The PDF is made ahead, so the share sheet opens straight from the tap
  // (browsers only allow it right after one).
  const [pdf, setPdf] = useState<{ file: File; for: typeof receipt } | null>(null);
  useEffect(() => {
    void loadReceiptAssets().catch(() => {});
  }, []);
  useEffect(() => {
    if (!receipt) return;
    let live = true;
    const timer = window.setTimeout(() => {
      receiptPdf(receipt)
        .then((bytes) => live && setPdf({ file: receiptFile(bytes, receipt.fileName), for: receipt }))
        .catch(() => {});
    }, 250);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [receipt]);

  const latest = useRef(receipt);
  useLayoutEffect(() => {
    latest.current = receipt;
  }, [receipt]);
  async function fileNow(): Promise<File | null> {
    const r = latest.current;
    if (!r) return null;
    if (pdf && pdf.for === r) return pdf.file;
    return receiptFile(await receiptPdf(r), r.fileName);
  }

  async function run(action: (file: File) => Promise<unknown> | void) {
    setError(null);
    setBusy('pdf');
    try {
      const file = await fileNow();
      if (file) await action(file);
    } catch {
      setError('The PDF could not be made. Try again.');
    } finally {
      setBusy(null);
    }
  }

  const shareable = useMemo(() => canShareFiles(), []);

  return {
    loading: data.loading,
    missing: !data.loading && !bucket,
    month,
    setMonth,
    months,
    options,
    setOption: <K extends keyof ReceiptOptions>(key: K, value: ReceiptOptions[K]) => setOptions((o) => ({ ...o, [key]: value })),
    receipt,
    /** The hide-amounts switch is on: the receipt still shows them. */
    amountsHidden,
    busy,
    error,
    printing,
    print: () => {
      setNow(new Date());
      setPrinting(true);
    },
    donePrinting: () => setPrinting(false),
    /** Export as PDF: the share sheet where it takes files (phones, tablets), else a download. */
    exportPdf: () => run((file) => (shareable ? shareOrDownload(file, latest.current?.header.name ?? 'Budget snapshot') : downloadFile(file))),
  };
}

export type BasketReceiptLogic = ReturnType<typeof useBasketReceipt>;
