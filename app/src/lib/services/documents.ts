import PDFDocument from 'pdfkit';
import { pool } from '../db';

/**
 * Renders straight onto the space below Clearmission's existing A4 letterhead
 * (PRD #72) — deliberately leaves a large top margin blank rather than
 * drawing a logo/header, since the physical letterhead already has one.
 *
 * IMPORTANT — this value is an unverified guess, not a measurement: nobody
 * building this had access to Clearmission's actual letterhead stock to
 * measure where its printed header actually ends. Before relying on this
 * for real printed documents, print `renderLetterheadAlignmentGuide()`
 * (below) onto an actual sheet of the letterhead and adjust this constant
 * to match what's measured — see the guide's own instructions.
 */
const LETTERHEAD_TOP_MARGIN = 180; // points — ADJUST AFTER PRINTING THE ALIGNMENT GUIDE

function newDoc(): PDFKit.PDFDocument {
  return new PDFDocument({ size: 'A4', margins: { top: LETTERHEAD_TOP_MARGIN, bottom: 50, left: 50, right: 50 } });
}

function streamToBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

export async function renderInvoicePdf(invoiceId: string): Promise<Buffer> {
  const inv = await pool.query(
    `SELECT i.*, c.name AS customer_name, c.phone AS customer_phone, jo.job_order_no
       FROM invoices i JOIN customers c ON c.id = i.customer_id
       JOIN job_orders jo ON jo.id = i.job_order_id
      WHERE i.id = $1`,
    [invoiceId]
  );
  if (!inv.rows[0]) throw new Error('Invoice not found');
  const invoice = inv.rows[0];

  const items = await pool.query(
    `SELECT description, quantity, unit, standard_rate, collected_amount
       FROM job_order_items WHERE job_order_id = $1 ORDER BY created_at`,
    [invoice.job_order_id]
  );

  const doc = newDoc();
  doc.fontSize(16).text(`INVOICE ${invoice.invoice_no}`, { align: 'right' });
  doc.moveDown(0.5);
  doc.fontSize(10)
    .text(`Date: ${new Date(invoice.created_at).toLocaleDateString('en-NG')}`, { align: 'right' })
    .text(`Job Order: ${invoice.job_order_no}`, { align: 'right' });
  doc.moveDown();
  doc.fontSize(11).text(`Bill To: ${invoice.customer_name}`);
  if (invoice.customer_phone) doc.text(invoice.customer_phone);
  doc.moveDown();

  doc.fontSize(10);
  const colX = { desc: 50, qty: 300, rate: 370, amount: 460 };
  doc.text('Description', colX.desc, doc.y, { continued: false });
  doc.text('Qty', colX.qty, doc.y - doc.currentLineHeight());
  doc.text('Rate', colX.rate, doc.y - doc.currentLineHeight());
  doc.text('Amount', colX.amount, doc.y - doc.currentLineHeight());
  doc.moveDown(0.3);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
  doc.moveDown(0.3);

  for (const item of items.rows) {
    const y = doc.y;
    doc.text(item.description ?? '', colX.desc, y, { width: 240 });
    doc.text(String(item.quantity), colX.qty, y);
    doc.text(Number(item.standard_rate).toLocaleString('en-NG'), colX.rate, y);
    doc.text(Number(item.collected_amount).toLocaleString('en-NG'), colX.amount, y);
    doc.moveDown(0.6);
  }

  doc.moveDown();
  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
  doc.moveDown(0.5);
  doc.fontSize(11);
  doc.text(`Subtotal: NGN ${Number(invoice.subtotal).toLocaleString('en-NG')}`, { align: 'right' });
  doc.text(`Paid: NGN ${Number(invoice.amount_paid).toLocaleString('en-NG')}`, { align: 'right' });
  doc.font('Helvetica-Bold').text(`Outstanding: NGN ${Number(invoice.outstanding).toLocaleString('en-NG')}`, { align: 'right' });

  return streamToBuffer(doc);
}

export async function renderReceiptPdf(receiptId: string): Promise<Buffer> {
  const rec = await pool.query(
    `SELECT r.*, p.amount, p.method, c.name AS customer_name
       FROM receipts r
       JOIN payments p ON p.id = r.payment_id
       JOIN customers c ON c.id = r.customer_id
      WHERE r.id = $1`,
    [receiptId]
  );
  if (!rec.rows[0]) throw new Error('Receipt not found');
  const receipt = rec.rows[0];

  const allocations = await pool.query(
    `SELECT inv.invoice_no, pa.amount_allocated, inv.outstanding
       FROM payment_allocations pa JOIN invoices inv ON inv.id = pa.invoice_id
      WHERE pa.payment_id = $1`,
    [receipt.payment_id]
  );

  const doc = newDoc();
  doc.fontSize(16).text(`RECEIPT ${receipt.receipt_no}`, { align: 'right' });
  doc.fontSize(10).text(`Date: ${new Date(receipt.created_at).toLocaleDateString('en-NG')}`, { align: 'right' });
  doc.moveDown();
  doc.fontSize(11).text(`Received From: ${receipt.customer_name}`);
  doc.text(`Amount: NGN ${Number(receipt.amount).toLocaleString('en-NG')}`);
  doc.text(`Method: ${receipt.method}`);
  doc.moveDown();
  doc.fontSize(10).text('Applied to:');
  for (const a of allocations.rows) {
    doc.text(`  ${a.invoice_no} — NGN ${Number(a.amount_allocated).toLocaleString('en-NG')} ` +
      `(remaining balance: NGN ${Number(a.outstanding).toLocaleString('en-NG')})`);
  }

  return streamToBuffer(doc);
}

/**
 * Renders any of this module's PDF documents as a single JPG image instead —
 * for sharing over WhatsApp/SMS where a PDF attachment is awkward but an
 * image isn't (a common real-world pattern for Nigerian small businesses,
 * and explicitly one of the PRD's required export formats, #72).
 *
 * Shells out to poppler's `pdftoppm` rather than a JS-only library: the
 * popular pure-JS PDF rasterizers either depend on a browser canvas (not
 * available in a server route) or produce noticeably worse text rendering
 * than poppler's actual PDF renderer, which is the same rendering engine
 * used by most Linux PDF viewers.
 */
export async function pdfToJpg(pdfBuffer: Buffer): Promise<Buffer> {
  const { execFile } = await import('child_process');
  const { promisify } = await import('util');
  const { mkdtemp, readFile, rm, writeFile } = await import('fs/promises');
  const { tmpdir } = await import('os');
  const { join } = await import('path');
  const execFileAsync = promisify(execFile);

  const dir = await mkdtemp(join(tmpdir(), 'clm-pdf-'));
  const pdfPath = join(dir, 'input.pdf');
  const outPrefix = join(dir, 'output');

  try {
    await writeFile(pdfPath, pdfBuffer);
    // -r 150: 150 DPI is legible for both on-screen viewing and print without
    // producing an unreasonably large file for a WhatsApp attachment.
    await execFileAsync('pdftoppm', ['-jpeg', '-r', '150', '-singlefile', pdfPath, outPrefix]);
    return await readFile(`${outPrefix}.jpg`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function renderInvoiceJpg(invoiceId: string): Promise<Buffer> {
  return pdfToJpg(await renderInvoicePdf(invoiceId));
}

export async function renderReceiptJpg(receiptId: string): Promise<Buffer> {
  return pdfToJpg(await renderReceiptPdf(receiptId));
}

/**
 * A calibration tool, not a real document: prints a ruler down the left
 * edge (in points, matching PDFKit's coordinate system) and horizontal
 * tick marks every 20pt, with the CURRENT LETTERHEAD_TOP_MARGIN line drawn
 * in bold. Print this onto an actual sheet of Clearmission's letterhead —
 * wherever the printed letterhead's header/logo actually ends is the real
 * margin value, read straight off the ruler, then update
 * LETTERHEAD_TOP_MARGIN above to match. This exists because nobody
 * building this had the physical letterhead to measure against; the 180pt
 * default is a reasonable guess for a standard A4 header, not a
 * measurement.
 */
export async function renderLetterheadAlignmentGuide(): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margins: { top: 0, bottom: 0, left: 0, right: 0 } });
  const pageHeight = doc.page.height; // ~842pt for A4
  const pageWidth = doc.page.width;   // ~595pt for A4

  doc.fontSize(9).fillColor('#888888');
  for (let y = 0; y <= pageHeight; y += 20) {
    doc.moveTo(0, y).lineTo(y % 100 === 0 ? 30 : 15, y).strokeColor('#cccccc').stroke();
    if (y % 100 === 0) doc.text(String(y), 32, y - 4);
  }

  doc.fillColor('#1B5E20').fontSize(10)
    .text(
      `Current LETTERHEAD_TOP_MARGIN = ${LETTERHEAD_TOP_MARGIN}pt — print this sheet on real letterhead, ` +
      `find where the printed header actually ends on the ruler at left, and update the constant to match.`,
      80, LETTERHEAD_TOP_MARGIN - 30, { width: pageWidth - 100 }
    );
  doc.moveTo(0, LETTERHEAD_TOP_MARGIN).lineTo(pageWidth, LETTERHEAD_TOP_MARGIN)
    .strokeColor('#1B5E20').lineWidth(2).stroke();
  doc.fontSize(9).fillColor('#1B5E20')
    .text('<- content currently starts here', 40, LETTERHEAD_TOP_MARGIN + 4);

  return streamToBuffer(doc);
}
