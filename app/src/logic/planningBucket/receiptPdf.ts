// A basket's budget snapshot as a PDF (pdf-lib): selectable, searchable
// text in JetBrains Mono (embedded and subset, from public/fonts), the Dreda
// logo (public/logo_primary.png) at the top, the optional QR code as
// squares. Never an image of the page. Draws the data from
// basketReceipt.ts, nothing else.
//   A4 (the default): a 150 mm column centred on the page in readable type;
//   long snapshots continue on the next page under "<name>, continued",
//   with page numbers.
//   Receipt (80 mm): one page whose height fits the content.

import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import QRCode from 'qrcode';
import type { BasketReceipt, ReceiptLine } from './basketReceipt';

// ---- Shared with the HTML view (src/widgets/Receipt) ----

/** The Dreda logo printed at the top (dark text, for white paper). */
export const RECEIPT_LOGO_SRC = '/logo_primary.png';

/** The QR code's dark modules as one path on a size x size grid. */
export function qrPath(text: string): { size: number; d: string } {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const size = qr.modules.size;
  let d = '';
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (qr.modules.get(row, col)) d += `M${col} ${row}h1v1h-1z`;
    }
  }
  return { size, d };
}

// ---- Page geometry (points; 1 mm = 2.835 pt) ----

const MM = 72 / 25.4;
const RECEIPT_WIDTH = 80 * MM;
const RECEIPT_MARGIN = 5 * MM;
const A4 = { width: 595.28, height: 841.89, column: 150 * MM, top: 18 * MM, bottom: 18 * MM };

const BLACK = rgb(0, 0, 0);
const GREY = rgb(0.4, 0.4, 0.4);
const RULE = rgb(0.82, 0.82, 0.82);

/** Type sizes: the 80 mm roll is small print; A4 is meant to be read at a glance. */
const SIZES = {
  receipt: { body: 8, small: 6.5, title: 9, name: 11, total: 9, logo: 18, pad: 3 },
  a4: { body: 11, small: 8.5, title: 12, name: 17, total: 12.5, logo: 30, pad: 5 },
};
const LEAD = 1.4;

interface Assets {
  regular: PDFFont;
  bold: PDFFont;
  logo: PDFImage;
}

/** One horizontal slice of the snapshot: its height and how to draw it at `top`. */
interface Block {
  height: number;
  draw: (page: PDFPage, x: number, top: number) => void;
}

// ---- Fonts and logo (fetched once, kept for the session and the service worker cache) ----

export type ReceiptAssetBytes = [regular: ArrayBuffer | Uint8Array, bold: ArrayBuffer | Uint8Array, logo: ArrayBuffer | Uint8Array];

let assetBytes: Promise<ReceiptAssetBytes> | null = null;

export function loadReceiptAssets(): Promise<ReceiptAssetBytes> {
  if (!assetBytes) {
    const get = (path: string) =>
      fetch(path).then((r) => {
        if (!r.ok) throw new Error('The snapshot fonts or logo could not be loaded.');
        return r.arrayBuffer();
      });
    assetBytes = Promise.all([get('/fonts/JetBrainsMono-Regular.ttf'), get('/fonts/JetBrainsMono-Bold.ttf'), get(RECEIPT_LOGO_SRC)]).catch((e) => {
      assetBytes = null;
      throw e;
    });
  }
  return assetBytes;
}

// ---- Text helpers ----

/** Word wrap to `width`; a word longer than the line is broken. */
function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const fits = (s: string) => font.widthOfTextAtSize(s, size) <= width;
  const out: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (fits(next)) {
        line = next;
        continue;
      }
      if (line) out.push(line);
      let rest = word;
      while (!fits(rest)) {
        let n = rest.length - 1;
        while (n > 1 && !fits(rest.slice(0, n))) n--;
        out.push(rest.slice(0, n));
        rest = rest.slice(n);
      }
      line = rest;
    }
    out.push(line);
  }
  return out;
}

function layout(receipt: BasketReceipt, assets: Assets, width: number): Block[] {
  const { regular, bold } = assets;
  const SIZE = SIZES[receipt.paper];
  const blocks: Block[] = [];
  const lineH = (size: number) => size * LEAD;
  const right = (page: PDFPage, text: string, xRight: number, baseline: number, font: PDFFont, size: number, color = BLACK) =>
    page.drawText(text, { x: xRight - font.widthOfTextAtSize(text, size), y: baseline, size, font, color });
  const space = (h: number) => blocks.push({ height: h, draw: () => {} });

  function centred(text: string, font: PDFFont, size: number, color = BLACK) {
    for (const line of wrap(text, font, size, width)) {
      blocks.push({
        height: lineH(size),
        draw: (page, x, top) => page.drawText(line, { x: x + (width - font.widthOfTextAtSize(line, size)) / 2, y: top - size, size, font, color }),
      });
    }
  }
  function dashed() {
    const h = SIZE.pad * 3;
    blocks.push({
      height: h,
      draw: (page, x, top) => page.drawLine({ start: { x, y: top - h / 2 }, end: { x: x + width, y: top - h / 2 }, thickness: 0.6, color: BLACK, dashArray: [2.5, 2] }),
    });
  }
  /** Label left (wrapping), value right (never wrapping). */
  function row(line: ReceiptLine, font = regular, size = SIZE.body) {
    const valueW = font.widthOfTextAtSize(line.value, size);
    const labels = wrap(line.label, font, size, Math.max(width - valueW - 8, width * 0.35));
    blocks.push({
      height: labels.length * lineH(size),
      draw: (page, x, top) => {
        labels.forEach((l, i) => page.drawText(l, { x, y: top - size - i * lineH(size), size, font, color: BLACK }));
        right(page, line.value, x + width, top - size, font, size);
      },
    });
  }
  function label(text: string) {
    blocks.push({ height: lineH(SIZE.small) + 2, draw: (page, x, top) => page.drawText(text.toUpperCase(), { x, y: top - SIZE.small, size: SIZE.small, font: bold, color: GREY }) });
  }

  // The items table: name, then the two amounts right-aligned in their own columns.
  const amountW = regular.widthOfTextAtSize('0'.repeat(11), SIZE.body);
  const gap = SIZE.pad * 2;
  const actualRight = width;
  const plannedRight = width - amountW - gap;
  const nameW = plannedRight - amountW - gap;
  function tableRow(cells: [string, string, string], font: PDFFont, size: number, color = BLACK, rule: 'thin' | 'solid' | null = 'thin') {
    const names = wrap(cells[0], font, size, nameW);
    const height = names.length * lineH(size) + SIZE.pad * 2;
    blocks.push({
      height,
      draw: (page, x, top) => {
        const first = top - SIZE.pad - size;
        names.forEach((n, i) => page.drawText(n, { x, y: first - i * lineH(size), size, font, color }));
        right(page, cells[1], x + plannedRight, first, font, size, color);
        right(page, cells[2], x + actualRight, first, font, size, color);
        if (rule) page.drawLine({ start: { x, y: top - height }, end: { x: x + width, y: top - height }, thickness: rule === 'solid' ? 0.8 : 0.4, color: rule === 'solid' ? BLACK : RULE });
      },
    });
  }

  // 1. Header
  const logoH = SIZE.logo;
  const logoW = (assets.logo.width / assets.logo.height) * logoH;
  blocks.push({
    height: logoH + SIZE.pad * 3,
    draw: (page, x, top) => page.drawImage(assets.logo, { x: x + (width - logoW) / 2, y: top - logoH, width: logoW, height: logoH }),
  });
  centred(receipt.header.title, bold, SIZE.title, GREY);
  space(SIZE.pad);
  centred(receipt.header.name, bold, SIZE.name);
  centred(receipt.header.typeLine, regular, SIZE.small, GREY);
  if (receipt.header.description) centred(receipt.header.description, regular, SIZE.small, GREY);
  centred(`Amounts in ${receipt.currency}`, regular, SIZE.small, GREY);
  space(SIZE.pad);

  // 2. Details
  dashed();
  receipt.details.forEach((d) => row(d));
  dashed();

  // 3. Summary
  label('Summary');
  receipt.summary.forEach((d) => row(d));
  for (const o of receipt.overLines) centred(o, bold, SIZE.body);
  dashed();

  // 4. Items
  label('Items');
  const { columns } = receipt;
  tableRow([columns.item, columns.planned, columns.actual], bold, SIZE.body, BLACK, 'solid');
  if (receipt.emptyText) {
    space(SIZE.pad);
    centred(receipt.emptyText, regular, SIZE.body, GREY);
  }
  for (const group of receipt.groups) {
    if (group.label) {
      space(SIZE.pad);
      blocks.push({ height: lineH(SIZE.body), draw: (page, x, top) => page.drawText(group.label!, { x, y: top - SIZE.body, size: SIZE.body, font: bold, color: BLACK }) });
    }
    group.items.forEach((it) => tableRow([it.name, it.plannedText, it.actualText], regular, SIZE.body));
    if (group.subtotal) tableRow(['Subtotal', group.subtotal.planned, group.subtotal.actual], bold, SIZE.body, BLACK, null);
  }

  // 5. Adjustments
  if (receipt.adjustments.length) {
    dashed();
    label('Adjustments');
    receipt.adjustments.forEach((a) => row({ label: [a.date, a.title].filter(Boolean).join('  '), value: a.amount }));
  }

  // 6. Notes
  if (receipt.notes) {
    dashed();
    label('Notes');
    for (const l of wrap(receipt.notes, regular, SIZE.body, width)) {
      blocks.push({ height: lineH(SIZE.body), draw: (page, x, top) => page.drawText(l, { x, y: top - SIZE.body, size: SIZE.body, font: regular, color: BLACK }) });
    }
  }

  // 7. Totals
  dashed();
  receipt.totals.forEach((t) => row(t, bold, SIZE.total));
  dashed();

  // 8. Footer
  space(SIZE.pad);
  centred(receipt.footer.text, regular, SIZE.small, GREY);
  centred(receipt.footer.reference, regular, SIZE.small, GREY);
  if (receipt.footer.qr) {
    const qr = qrPath(receipt.footer.qr);
    const side = (receipt.paper === 'a4' ? 26 : 22) * MM;
    blocks.push({
      height: side + 8,
      draw: (page, x, top) => page.drawSvgPath(qr.d, { x: x + (width - side) / 2, y: top - 6, scale: side / qr.size, color: BLACK }),
    });
  }
  return blocks;
}

/** The snapshot as PDF bytes. */
export async function receiptPdf(receipt: BasketReceipt, bytes?: ReceiptAssetBytes): Promise<Uint8Array> {
  const [regularBytes, boldBytes, logoBytes] = bytes ?? (await loadReceiptAssets());
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const assets: Assets = {
    regular: await doc.embedFont(regularBytes, { subset: true }),
    bold: await doc.embedFont(boldBytes, { subset: true }),
    logo: await doc.embedPng(logoBytes),
  };
  doc.setTitle(`${receipt.header.name}, budget snapshot`);
  doc.setSubject(receipt.footer.reference);
  doc.setCreator('Dreda');
  doc.setProducer('Dreda');

  if (receipt.paper === 'receipt') {
    const width = RECEIPT_WIDTH - 2 * RECEIPT_MARGIN;
    const blocks = layout(receipt, assets, width);
    const height = blocks.reduce((s, b) => s + b.height, 0) + 2 * RECEIPT_MARGIN;
    const page = doc.addPage([RECEIPT_WIDTH, height]);
    let top = height - RECEIPT_MARGIN;
    for (const b of blocks) {
      b.draw(page, RECEIPT_MARGIN, top);
      top -= b.height;
    }
    return doc.save();
  }

  // A4: flow the blocks down a centred column, page after page.
  const small = SIZES.a4.small;
  const width = A4.column;
  const x = (A4.width - width) / 2;
  const blocks = layout(receipt, assets, width);
  const pages: PDFPage[] = [];
  let page = doc.addPage([A4.width, A4.height]);
  pages.push(page);
  let top = A4.height - A4.top;
  for (const b of blocks) {
    if (top - b.height < A4.bottom) {
      page = doc.addPage([A4.width, A4.height]);
      pages.push(page);
      top = A4.height - A4.top;
      page.drawText(`${receipt.header.name}, continued`, { x, y: top - small, size: small, font: assets.regular, color: GREY });
      top -= small * LEAD + 8;
    }
    b.draw(page, x, top);
    top -= b.height;
  }
  if (pages.length > 1) {
    pages.forEach((p, i) => {
      const text = `Page ${i + 1} of ${pages.length}`;
      const w = assets.regular.widthOfTextAtSize(text, small);
      p.drawText(text, { x: (A4.width - w) / 2, y: A4.bottom / 2, size: small, font: assets.regular, color: GREY });
    });
  }
  return doc.save();
}

// ---- Getting it to the person ----

export function receiptFile(bytes: Uint8Array, fileName: string): File {
  return new File([bytes as BlobPart], fileName, { type: 'application/pdf' });
}

/** True where the share sheet takes files (phones, tablets, some desktops). */
export function canShareFiles(): boolean {
  if (typeof navigator === 'undefined' || !navigator.canShare) return false;
  try {
    return navigator.canShare({ files: [new File([new Uint8Array(1)], 'x.pdf', { type: 'application/pdf' })] });
  } catch {
    return false;
  }
}

export function downloadFile(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** The share sheet with the PDF where it's supported, else a download. */
export async function shareOrDownload(file: File, title: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  if (canShareFiles()) {
    try {
      await navigator.share({ files: [file], title });
      return 'shared';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
      // No user gesture left (the PDF took too long) or refused: download instead.
    }
  }
  downloadFile(file);
  return 'downloaded';
}
