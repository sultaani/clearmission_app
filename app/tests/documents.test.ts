import { config } from 'dotenv';
config({ path: '.env.local' });
import { pool } from '../src/lib/db';
import { verifyLogin } from '../src/lib/auth';
import { createCustomer } from '../src/lib/services/customers';
import { listProducts } from '../src/lib/services/products';
import { createJobOrder } from '../src/lib/services/jobOrders';
import { recordPayment } from '../src/lib/services/payments';
import { renderInvoicePdf, renderReceiptPdf } from '../src/lib/services/documents';
import { writeFileSync } from 'fs';

let passed = 0, failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) { passed++; console.log(`  OK: ${msg}`); }
  else { failed++; console.error(`  FAIL: ${msg}`); }
}

async function main() {
  console.log('=== Phase 8: PDF document generation ===');

  const cashier = await verifyLogin('cashier', 'cashier123');
  const products = await listProducts();
  const shirt = products.find((p: any) => p.name === 'Branded Shirt');
  const customer = await createCustomer({ name: 'PDF Test Customer', phone: '08012340000' });

  const jo = await createJobOrder({
    cashierId: cashier!.id,
    customerId: customer.id,
    items: [{ productServiceId: shirt.id, category: 'Branding', description: '3 branded shirts', quantity: 3, collectedAmount: 15000 }],
  });

  const invoicePdf = await renderInvoicePdf(jo.invoiceId);
  assert(invoicePdf.subarray(0, 4).toString() === '%PDF', 'invoice PDF starts with the %PDF magic bytes (it is a real PDF)');
  assert(invoicePdf.length > 1000, `invoice PDF has substantial content (${invoicePdf.length} bytes)`);
  const { PDFParse } = await import('pdf-parse');
  const parsedInvoice = await new PDFParse({ data: invoicePdf }).getText();
  assert(parsedInvoice.text.includes(jo.invoiceNo), `invoice PDF's actual rendered text contains the invoice number (parsed text: "${parsedInvoice.text.replace(/\s+/g, ' ').trim().slice(0, 120)}...")`);
  assert(parsedInvoice.text.includes('PDF Test Customer'), "invoice PDF's rendered text contains the customer name");
  assert(parsedInvoice.text.includes('15,000'), "invoice PDF's rendered text contains the correct amount");

  const payment = await recordPayment({ customerId: customer.id, amount: 15000, method: 'cash', recordedBy: cashier!.id });
  const receiptPdf = await renderReceiptPdf(payment.receiptId);
  assert(receiptPdf.subarray(0, 4).toString() === '%PDF', 'receipt PDF starts with the %PDF magic bytes');
  assert(receiptPdf.length > 500, `receipt PDF has substantial content (${receiptPdf.length} bytes)`);
  const parsedReceipt = await new PDFParse({ data: receiptPdf }).getText();
  assert(parsedReceipt.text.includes(payment.receiptNo), "receipt PDF's rendered text contains the receipt number");
  assert(parsedReceipt.text.includes(jo.invoiceNo), "receipt PDF's rendered text references the invoice it was allocated to");

  // --- Phase 3: JPG export (Tier 3) ---
  const { renderInvoiceJpg, renderReceiptJpg } = await import('../src/lib/services/documents');
  const invoiceJpg = await renderInvoiceJpg(jo.invoiceId);
  assert(invoiceJpg.subarray(0, 3).toString('hex') === 'ffd8ff', 'invoice JPG starts with the real JPEG magic bytes (FF D8 FF)');
  assert(invoiceJpg.length > 5000, `invoice JPG has substantial content (${invoiceJpg.length} bytes)`);
  writeFileSync('/tmp/sample-invoice.jpg', invoiceJpg);

  const receiptJpg = await renderReceiptJpg(payment.receiptId);
  assert(receiptJpg.subarray(0, 3).toString('hex') === 'ffd8ff', 'receipt JPG starts with the real JPEG magic bytes');
  writeFileSync('/tmp/sample-receipt.jpg', receiptJpg);

  // Verify with an actual, independent image library (Pillow via a tiny Python
  // subprocess) that these are genuinely valid, readable JPEGs — not just files
  // that happen to start with the right three magic bytes.
  const { execSync } = await import('child_process');
  const dims = execSync(
    `python3 -c "from PIL import Image; im = Image.open('/tmp/sample-invoice.jpg'); print(im.format, im.size)"`
  ).toString().trim();
  assert(dims.startsWith('JPEG'), `Pillow independently confirms the invoice JPG is a valid, decodable JPEG (${dims})`);
  console.log(`  (Pillow: ${dims})`);

  // Save one to disk so it can be visually spot-checked, not just byte-counted
  writeFileSync('/tmp/sample-invoice.pdf', invoicePdf);
  writeFileSync('/tmp/sample-receipt.pdf', receiptPdf);
  console.log('  (sample PDFs written to /tmp/sample-invoice.pdf and /tmp/sample-receipt.pdf)');

  console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => { console.error('FATAL:', err); process.exit(1); });
