import { PoolClient } from 'pg';
import { pool, withTransaction } from '../db';
import { withActor } from '../auth';

export type Allocation = { invoiceId: string; amount: number };

export type RecordPaymentInput = {
  customerId: string;
  amount: number;
  method: 'cash' | 'bank_transfer' | 'pos' | 'other';
  recordedBy: string;
  cashierSessionId?: string;
  remark?: string;
  /** Explicit invoice allocations. If omitted, auto-allocates oldest-outstanding-first (PRD #44). */
  allocations?: Allocation[];
  /** Set when this payment originated offline — used for idempotent sync (Phase 7). */
  clientRequestId?: string;
};

export async function findPaymentByClientRequestId(clientRequestId: string) {
  const { rows } = await pool.query(
    `SELECT p.id, p.amount, r.receipt_no
       FROM payments p LEFT JOIN receipts r ON r.payment_id = p.id
      WHERE p.client_request_id = $1`,
    [clientRequestId]
  );
  return rows[0] ?? null;
}

export async function listOutstandingInvoicesForCustomer(customerId: string) {
  const { rows } = await pool.query(
    `SELECT id, invoice_no, subtotal, amount_paid, outstanding FROM invoices
      WHERE customer_id = $1 AND deleted_at IS NULL AND outstanding > 0
      ORDER BY created_at ASC`,
    [customerId]
  );
  return rows;
}

export async function listInvoices(limit = 100) {
  const { rows } = await pool.query(
    `SELECT i.id, i.invoice_no, i.subtotal, i.amount_paid, i.outstanding, i.payment_status, i.created_at, c.name AS customer_name
       FROM invoices i JOIN customers c ON c.id = i.customer_id
      WHERE i.deleted_at IS NULL
      ORDER BY i.created_at DESC LIMIT $1`,
    [limit]
  );
  return rows;
}

export async function getInvoiceDetail(id: string) {
  const inv = await pool.query(
    `SELECT i.*, c.name AS customer_name, c.phone AS customer_phone, jo.job_order_no, jo.id AS job_order_id
       FROM invoices i
       JOIN customers c ON c.id = i.customer_id
       JOIN job_orders jo ON jo.id = i.job_order_id
      WHERE i.id = $1`,
    [id]
  );
  if (!inv.rows[0]) return null;
  const items = await pool.query(
    `SELECT description, quantity, unit, standard_rate, collected_amount
       FROM job_order_items WHERE job_order_id = $1 ORDER BY created_at`,
    [inv.rows[0].job_order_id]
  );
  const allocations = await pool.query(
    `SELECT pa.amount_allocated, p.method, p.created_at, r.receipt_no, r.id AS receipt_id
       FROM payment_allocations pa
       JOIN payments p ON p.id = pa.payment_id
       LEFT JOIN receipts r ON r.payment_id = p.id
      WHERE pa.invoice_id = $1 ORDER BY p.created_at`,
    [id]
  );
  return { ...inv.rows[0], items: items.rows, payments: allocations.rows };
}

export async function listReceipts(limit = 100) {
  const { rows } = await pool.query(
    `SELECT r.id, r.receipt_no, r.created_at, p.amount, p.method, c.name AS customer_name
       FROM receipts r JOIN payments p ON p.id = r.payment_id JOIN customers c ON c.id = r.customer_id
      ORDER BY r.created_at DESC LIMIT $1`,
    [limit]
  );
  return rows;
}

export async function getReceiptDetail(id: string) {
  const rec = await pool.query(
    `SELECT r.id, r.receipt_no, r.created_at, r.payment_id, p.amount, p.method, p.remark,
            c.name AS customer_name, c.phone AS customer_phone
       FROM receipts r
       JOIN payments p ON p.id = r.payment_id
       JOIN customers c ON c.id = r.customer_id
      WHERE r.id = $1`,
    [id]
  );
  if (!rec.rows[0]) return null;
  const allocations = await pool.query(
    `SELECT inv.invoice_no, inv.id AS invoice_id, pa.amount_allocated, inv.outstanding
       FROM payment_allocations pa JOIN invoices inv ON inv.id = pa.invoice_id
      WHERE pa.payment_id = $1`,
    [rec.rows[0].payment_id]
  );
  return { ...rec.rows[0], allocations: allocations.rows };
}

export async function listAllPayments(limit = 150) {
  const { rows } = await pool.query(
    `SELECT p.id, p.amount, p.method, p.created_at, c.name AS customer_name, u.username AS recorded_by, r.receipt_no
       FROM payments p
       JOIN customers c ON c.id = p.customer_id
       JOIN users u ON u.id = p.recorded_by
       LEFT JOIN receipts r ON r.payment_id = p.id
      WHERE p.deleted_at IS NULL
      ORDER BY p.created_at DESC LIMIT $1`,
    [limit]
  );
  return rows;
}

async function autoAllocate(client: PoolClient, customerId: string, amount: number): Promise<Allocation[]> {
  const { rows } = await client.query(
    `SELECT id, outstanding FROM invoices
      WHERE customer_id = $1 AND deleted_at IS NULL AND outstanding > 0
      ORDER BY created_at ASC`,
    [customerId]
  );
  const allocations: Allocation[] = [];
  let remaining = amount;
  for (const inv of rows) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, Number(inv.outstanding));
    allocations.push({ invoiceId: inv.id, amount: take });
    remaining -= take;
  }
  return allocations;
}

export async function recordPayment(input: RecordPaymentInput) {
  if (input.amount <= 0) throw new Error('Payment amount must be positive');

  return withTransaction(async (client) => {
    return withActor(client, input.recordedBy, async () => {
      const allocations =
        input.allocations && input.allocations.length > 0
          ? input.allocations
          : await autoAllocate(client, input.customerId, input.amount);

      const allocatedTotal = allocations.reduce((s, a) => s + a.amount, 0);
      if (Math.abs(allocatedTotal - input.amount) > 0.01) {
        throw new Error(
          `Allocation total (${allocatedTotal}) does not match payment amount (${input.amount}). ` +
          `If the customer has no outstanding invoices to allocate the excess against, hold it or reject the overpayment at the POS.`
        );
      }

      const payment = await client.query(
        `INSERT INTO payments (customer_id, amount, method, recorded_by, cashier_session_id, remark, client_request_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [input.customerId, input.amount, input.method, input.recordedBy,
         input.cashierSessionId ?? null, input.remark ?? null, input.clientRequestId ?? null]
      );
      const paymentId = payment.rows[0].id;

      for (const alloc of allocations) {
        await client.query(
          `INSERT INTO payment_allocations (payment_id, invoice_id, amount_allocated)
           VALUES ($1,$2,$3)`,
          [paymentId, alloc.invoiceId, alloc.amount]
        );
      }

      const receipt = await client.query(
        `INSERT INTO receipts (payment_id, customer_id) VALUES ($1,$2) RETURNING id, receipt_no`,
        [paymentId, input.customerId]
      );

      return {
        paymentId,
        receiptId: receipt.rows[0].id,
        receiptNo: receipt.rows[0].receipt_no,
        allocations,
      };
    });
  });
}
