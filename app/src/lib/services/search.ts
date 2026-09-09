import { pool } from '../db';

export type SearchResult = { type: string; id: string; label: string; sublabel: string; href: string };

/** Global search across job orders, invoices, receipts, quotations, and customers (PRD #86). */
export async function globalSearch(query: string): Promise<SearchResult[]> {
  const q = `%${query}%`;
  const [jobOrders, customers, invoices, receipts, quotations] = await Promise.all([
    pool.query(
      `SELECT id, job_order_no, subtotal FROM job_orders WHERE deleted_at IS NULL AND job_order_no ILIKE $1 LIMIT 10`,
      [q]
    ),
    pool.query(
      `SELECT id, name, phone FROM customers WHERE deleted_at IS NULL AND (name ILIKE $1 OR phone ILIKE $1) LIMIT 10`,
      [q]
    ),
    pool.query(
      `SELECT id, invoice_no, subtotal FROM invoices WHERE deleted_at IS NULL AND invoice_no ILIKE $1 LIMIT 10`,
      [q]
    ),
    pool.query(
      `SELECT id, receipt_no FROM receipts WHERE receipt_no ILIKE $1 LIMIT 10`,
      [q]
    ),
    pool.query(
      `SELECT id, quotation_no, total FROM quotations WHERE deleted_at IS NULL AND quotation_no ILIKE $1 LIMIT 10`,
      [q]
    ),
  ]);

  return [
    ...jobOrders.rows.map((r) => ({ type: 'Job Order', id: r.id, label: r.job_order_no, sublabel: `₦${Number(r.subtotal).toLocaleString()}`, href: `/job-orders/${r.id}` })),
    ...customers.rows.map((r) => ({ type: 'Customer', id: r.id, label: r.name, sublabel: r.phone ?? '', href: `/customers/${r.id}` })),
    ...invoices.rows.map((r) => ({ type: 'Invoice', id: r.id, label: r.invoice_no, sublabel: `₦${Number(r.subtotal).toLocaleString()}`, href: `/invoices/${r.id}` })),
    ...receipts.rows.map((r) => ({ type: 'Receipt', id: r.id, label: r.receipt_no, sublabel: '', href: `/receipts/${r.id}` })),
    ...quotations.rows.map((r) => ({ type: 'Quotation', id: r.id, label: r.quotation_no, sublabel: `₦${Number(r.total).toLocaleString()}`, href: `/quotations/${r.id}` })),
  ];
}
