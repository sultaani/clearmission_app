import { pool } from '../db';

export async function listDebts(customerId?: string) {
  const { rows } = await pool.query(
    customerId
      ? `SELECT * FROM v_debts WHERE customer_id = $1 ORDER BY age_days DESC`
      : `SELECT * FROM v_debts ORDER BY age_days DESC`,
    customerId ? [customerId] : []
  );
  return rows.map((r) => ({
    ...r,
    original_amount: Number(r.original_amount),
    amount_paid: Number(r.amount_paid),
    outstanding: Number(r.outstanding),
    age_days: Number(r.age_days),
  }));
}

export async function debtAgingSummary() {
  const { rows } = await pool.query(
    `SELECT age_bucket, COUNT(*) AS invoice_count, SUM(outstanding) AS total_outstanding
       FROM v_debts GROUP BY age_bucket
       ORDER BY array_position(ARRAY['current','1-30','31-60','61-90','90+'], age_bucket)`
  );
  return rows.map((r) => ({
    ...r,
    invoice_count: Number(r.invoice_count),
    total_outstanding: Number(r.total_outstanding),
  }));
}
