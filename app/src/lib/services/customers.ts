import { pool } from '../db';

function coerceStats<T extends Record<string, any>>(row: T) {
  return {
    ...row,
    total_job_orders: Number(row.total_job_orders),
    total_revenue: Number(row.total_revenue),
    total_payments: Number(row.total_payments),
    outstanding_balance: Number(row.outstanding_balance),
    avg_job_order_value: Number(row.avg_job_order_value),
  };
}

export async function listCustomers(search?: string) {
  const { rows } = await pool.query(
    search
      ? `SELECT * FROM v_customer_stats WHERE name ILIKE $1 ORDER BY name LIMIT 50`
      : `SELECT * FROM v_customer_stats ORDER BY name LIMIT 200`,
    search ? [`%${search}%`] : []
  );
  return rows.map(coerceStats);
}

export async function getCustomerProfile(id: string) {
  const stats = await pool.query(`SELECT * FROM v_customer_stats WHERE customer_id = $1`, [id]);
  if (!stats.rows[0]) return null;
  const [jobOrders, debts] = await Promise.all([
    pool.query(
      `SELECT id, job_order_no, subtotal, amount_paid, outstanding_balance, payment_status, created_at
         FROM job_orders WHERE customer_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 50`,
      [id]
    ),
    pool.query(`SELECT * FROM v_debts WHERE customer_id = $1`, [id]),
  ]);
  return { ...coerceStats(stats.rows[0]), jobOrders: jobOrders.rows, debts: debts.rows };
}

export async function createCustomer(input: { name: string; phone?: string; address?: string }) {
  const { rows } = await pool.query(
    `INSERT INTO customers (name, phone, address) VALUES ($1,$2,$3) RETURNING *`,
    [input.name, input.phone ?? null, input.address ?? null]
  );
  return rows[0];
}

export async function updateCustomer(id: string, input: { name?: string; phone?: string; address?: string }) {
  const { rows } = await pool.query(
    `UPDATE customers SET
       name = COALESCE($2, name), phone = COALESCE($3, phone), address = COALESCE($4, address),
       updated_at = now()
     WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
    [id, input.name ?? null, input.phone ?? null, input.address ?? null]
  );
  return rows[0] ?? null;
}
