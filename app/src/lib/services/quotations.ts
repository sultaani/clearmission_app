import { pool, withTransaction } from '../db';
import { withActor } from '../auth';

export type QuotationItem = { description: string; quantity: number; rate: number; total: number };

export async function createQuotation(input: {
  customerId: string;
  items: QuotationItem[];
  validUntil?: string; // ISO date
  remark?: string;
  createdBy: string;
}) {
  const total = input.items.reduce((s, i) => s + i.total, 0);
  return withTransaction((client) =>
    withActor(client, input.createdBy, () =>
      client.query(
        `INSERT INTO quotations (customer_id, items, total, valid_until, remark, created_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, quotation_no`,
        [input.customerId, JSON.stringify(input.items), total, input.validUntil ?? null,
         input.remark ?? null, input.createdBy]
      )
    )
  ).then((r) => r.rows[0]);
}

export async function listQuotations(customerId?: string) {
  const { rows } = await pool.query(
    customerId
      ? `SELECT * FROM quotations WHERE deleted_at IS NULL AND customer_id = $1 ORDER BY created_at DESC`
      : `SELECT * FROM quotations WHERE deleted_at IS NULL ORDER BY created_at DESC`,
    customerId ? [customerId] : []
  );
  return rows;
}

export async function getQuotationDetail(id: string) {
  const { rows } = await pool.query(
    `SELECT q.*, c.name AS customer_name FROM quotations q JOIN customers c ON c.id = q.customer_id WHERE q.id = $1`,
    [id]
  );
  return rows[0] ?? null;
}
