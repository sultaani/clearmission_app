import { pool, withTransaction } from '../db';
import { withActor } from '../auth';

export async function recordExpense(input: {
  categoryId: string;
  description?: string;
  amount: number;
  paymentMethod: 'cash' | 'bank_transfer' | 'pos' | 'other';
  recordedBy: string;
  cashierSessionId?: string;
  remark?: string;
  clientRequestId?: string;
}) {
  if (input.amount <= 0) throw new Error('Expense amount must be positive');
  return withTransaction((client) =>
    withActor(client, input.recordedBy, () =>
      client.query(
        `INSERT INTO expenses (category_id, description, amount, payment_method, recorded_by, cashier_session_id, remark, client_request_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [input.categoryId, input.description ?? null, input.amount, input.paymentMethod,
         input.recordedBy, input.cashierSessionId ?? null, input.remark ?? null, input.clientRequestId ?? null]
      )
    )
  ).then((r) => r.rows[0]);
}

export async function findExpenseByClientRequestId(clientRequestId: string) {
  const { rows } = await pool.query(`SELECT id FROM expenses WHERE client_request_id = $1`, [clientRequestId]);
  return rows[0] ?? null;
}

export async function listExpenses(limit = 100) {
  const { rows } = await pool.query(
    `SELECT e.id, e.description, e.amount, e.payment_method, e.incurred_at, ec.name AS category_name, u.username AS recorded_by_username
       FROM expenses e
       JOIN expense_categories ec ON ec.id = e.category_id
       JOIN users u ON u.id = e.recorded_by
      WHERE e.deleted_at IS NULL
      ORDER BY e.incurred_at DESC
      LIMIT $1`,
    [limit]
  );
  return rows;
}

export async function listExpenseCategories() {
  const { rows } = await pool.query(`SELECT * FROM expense_categories WHERE is_active = TRUE ORDER BY name`);
  return rows;
}

/** Includes inactive categories too — for the Settings management view (listExpenseCategories
 *  above stays active-only since that's what the expense-recording dropdown should offer). */
export async function listAllExpenseCategories() {
  const { rows } = await pool.query(`SELECT * FROM expense_categories ORDER BY name`);
  return rows;
}

export async function createExpenseCategory(name: string) {
  const { rows } = await pool.query(
    `INSERT INTO expense_categories (name) VALUES ($1) RETURNING *`,
    [name]
  );
  return rows[0];
}

export async function updateExpenseCategory(id: string, input: { name?: string; isActive?: boolean }) {
  const { rows } = await pool.query(
    `UPDATE expense_categories SET
       name = COALESCE($2, name),
       is_active = COALESCE($3, is_active)
     WHERE id = $1 RETURNING *`,
    [id, input.name ?? null, input.isActive ?? null]
  );
  return rows[0] ?? null;
}
