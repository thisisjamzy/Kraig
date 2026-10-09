'use client';

// A basket's budget snapshot drawn in HTML from its data (src/logic/
// planningBucket/basketReceipt.ts): the live preview in the options step,
// and what the browser prints. White paper, JetBrains Mono, black with one
// grey, the Dreda logo on top, dashed rules between sections, and the items
// as a plain table (Item, Planned, Spent) with amounts right-aligned and
// never wrapped. A4 uses larger type than the 80 mm roll. The PDF
// (receiptPdf.ts) draws the same data the same way.
// Used on the phone and on wide screens alike.

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { BasketReceipt, ReceiptLine } from '@/src/logic/planningBucket/basketReceipt';
import { qrPath, RECEIPT_LOGO_SRC } from '@/src/logic/planningBucket/receiptPdf';
import styles from './Receipt.module.css';

function Row({ line, strong }: { line: ReceiptLine; strong?: boolean }) {
  return (
    <div className={styles.row} data-strong={strong || undefined}>
      <span className={styles.rowLabel}>{line.label}</span>
      <span className={styles.amount}>{line.value}</span>
    </div>
  );
}

function Qr({ text }: { text: string }) {
  const qr = useMemo(() => qrPath(text), [text]);
  return (
    <svg className={styles.qr} viewBox={`0 0 ${qr.size} ${qr.size}`} shapeRendering="crispEdges" aria-label="QR code to the basket">
      <path d={qr.d} fill="#000" />
    </svg>
  );
}

export function ReceiptView({ receipt, className }: { receipt: BasketReceipt; className?: string }) {
  const { columns } = receipt;
  return (
    <article className={`${styles.receipt} ${className ?? ''}`} data-paper={receipt.paper} aria-label={`${receipt.header.name} budget snapshot`}>
      <header className={styles.header}>
        {/* eslint-disable-next-line @next/next/no-img-element -- printed as is, no optimisation */}
        <img className={styles.logo} src={RECEIPT_LOGO_SRC} alt="Dreda" />
        <p className={styles.title}>{receipt.header.title}</p>
        <p className={styles.name}>{receipt.header.name}</p>
        <p className={styles.muted}>{receipt.header.typeLine}</p>
        {receipt.header.description && <p className={styles.muted}>{receipt.header.description}</p>}
        <p className={styles.muted}>Amounts in {receipt.currency}</p>
      </header>

      <section className={styles.section}>
        {receipt.details.map((d) => (
          <Row key={d.label} line={d} />
        ))}
      </section>

      <section className={styles.section}>
        <p className={styles.label}>Summary</p>
        {receipt.summary.map((d) => (
          <Row key={d.label} line={d} />
        ))}
        {receipt.overLines.map((o) => (
          <p key={o} className={styles.over}>
            {o}
          </p>
        ))}
      </section>

      <section className={styles.section}>
        <p className={styles.label}>Items</p>
        <table className={styles.items}>
          <thead>
            <tr>
              <th scope="col">{columns.item}</th>
              <th scope="col">{columns.planned}</th>
              <th scope="col">{columns.actual}</th>
            </tr>
          </thead>
          {receipt.groups.map((g, gi) => (
            <tbody key={g.label ?? gi}>
              {g.label && (
                <tr className={styles.groupRow}>
                  <th scope="rowgroup" colSpan={3}>
                    {g.label}
                  </th>
                </tr>
              )}
              {g.items.map((it, i) => (
                <tr key={`${it.name}-${i}`}>
                  <td>{it.name}</td>
                  <td>{it.plannedText}</td>
                  <td>{it.actualText}</td>
                </tr>
              ))}
              {g.subtotal && (
                <tr className={styles.subtotal}>
                  <td>Subtotal</td>
                  <td>{g.subtotal.planned}</td>
                  <td>{g.subtotal.actual}</td>
                </tr>
              )}
            </tbody>
          ))}
        </table>
        {receipt.emptyText && <p className={styles.empty}>{receipt.emptyText}</p>}
      </section>

      {receipt.adjustments.length > 0 && (
        <section className={styles.section}>
          <p className={styles.label}>Adjustments</p>
          {receipt.adjustments.map((a, i) => (
            <Row key={i} line={{ label: [a.date, a.title].filter(Boolean).join('  '), value: a.amount }} />
          ))}
        </section>
      )}

      {receipt.notes && (
        <section className={styles.section}>
          <p className={styles.label}>Notes</p>
          <p className={styles.notes}>{receipt.notes}</p>
        </section>
      )}

      <section className={`${styles.section} ${styles.totals}`}>
        {receipt.totals.map((t) => (
          <Row key={t.label} line={t} strong />
        ))}
      </section>

      <footer className={styles.footer}>
        <p>{receipt.footer.text}</p>
        <p>{receipt.footer.reference}</p>
        {receipt.footer.qr && <Qr text={receipt.footer.qr} />}
      </footer>
    </article>
  );
}

const MM_PER_PX = 25.4 / 96;

/**
 * Prints the snapshot and nothing else: it goes into a node of its own
 * under <body>, a print style hides everything else, and @page takes the
 * paper (A4 with the snapshot in a 150 mm column, "continued" and page
 * numbers, or 80 mm wide and as tall as the snapshot). Calls `onDone` after
 * the print dialog closes.
 */
export function ReceiptPrint({ receipt, onDone }: { receipt: BasketReceipt; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [heightMm, setHeightMm] = useState<number | null>(null);
  const done = useRef(onDone);
  useLayoutEffect(() => {
    done.current = onDone;
  });

  useLayoutEffect(() => {
    if (ref.current) setHeightMm(Math.ceil(ref.current.getBoundingClientRect().height * MM_PER_PX) + 2);
  }, [receipt]);

  useLayoutEffect(() => {
    if (heightMm === null) return;
    document.body.setAttribute('data-receipt-printing', '');
    const finish = () => {
      document.body.removeAttribute('data-receipt-printing');
      done.current();
    };
    window.addEventListener('afterprint', finish, { once: true });
    // Let the fonts, the logo and the @page rule apply first.
    const timer = window.setTimeout(() => {
      const logo = ref.current?.querySelector('img');
      const logoReady = !logo || logo.complete ? Promise.resolve() : new Promise((ok) => logo.addEventListener('load', ok, { once: true }));
      void Promise.all([document.fonts?.ready, logoReady]).then(() => window.print());
    }, 60);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('afterprint', finish);
      document.body.removeAttribute('data-receipt-printing');
    };
  }, [heightMm]);

  const a4 = receipt.paper === 'a4';
  const quote = (s: string) => `"${s.replace(/["\\]/g, '\\$&')}"`;
  const page = a4
    ? `@page { size: A4; margin: 18mm 0; @bottom-center { content: "Page " counter(page) " of " counter(pages); font: 8.5pt 'Dreda Receipt Mono', monospace; color: #666; } @top-left { content: ${quote(`${receipt.header.name}, continued`)}; font: 8.5pt 'Dreda Receipt Mono', monospace; color: #666; padding-left: 30mm; } }
       @page :first { @top-left { content: none; } }`
    : `@page { size: 80mm ${heightMm ?? 297}mm; margin: 0; }`;
  const css = `
    @media print {
      ${page}
      html, body { background: #fff !important; height: auto !important; overflow: visible !important; }
      body[data-receipt-printing] > *:not([data-receipt-print]) { display: none !important; }
      [data-receipt-print] { position: static !important; left: auto !important; background: #fff !important; }
    }`;

  return createPortal(
    <div data-receipt-print className={styles.printRoot} data-paper={receipt.paper} ref={ref}>
      <style>{css}</style>
      <ReceiptView receipt={receipt} />
    </div>,
    document.body
  );
}
