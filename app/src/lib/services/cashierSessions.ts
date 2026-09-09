import { pool } from '../db';

export async function openSession(cashierId: string) {
  const existing = await pool.query(
    `SELECT id FROM cashier_sessions WHERE cashier_id = $1 AND status = 'open'`,
    [cashierId]
  );
  if (existing.rows[0]) {
    throw new Error('This cashier already has an open session — close it before opening another');
  }
  const { rows } = await pool.query(
    `INSERT INTO cashier_sessions (cashier_id) VALUES ($1) RETURNING id, opened_at`,
    [cashierId]
  );
  return rows[0];
}

/** Computes expected totals from everything recorded under this session, then records actual + variance. */
export async function closeSession(input: {
  sessionId: string;
  actualCash: number;
  actualTransfer: number;
  actualPos: number;
}) {
  const expected = await pool.query(
    `SELECT
        COALESCE(SUM(amount) FILTER (WHERE method = 'cash'), 0) AS cash,
        COALESCE(SUM(amount) FILTER (WHERE method = 'bank_transfer'), 0) AS transfer,
        COALESCE(SUM(amount) FILTER (WHERE method = 'pos'), 0) AS pos
       FROM payments WHERE cashier_session_id = $1 AND deleted_at IS NULL`,
    [input.sessionId]
  );
  const exp = expected.rows[0];

  const { rows } = await pool.query(
    `UPDATE cashier_sessions
        SET expected_cash = $2, expected_transfer = $3, expected_pos = $4,
            actual_cash = $5, actual_transfer = $6, actual_pos = $7,
            closed_at = now(), status = 'closed'
      WHERE id = $1 AND status = 'open'
      RETURNING *`,
    [input.sessionId, exp.cash, exp.transfer, exp.pos,
     input.actualCash, input.actualTransfer, input.actualPos]
  );
  if (!rows[0]) throw new Error('Session not found or already closed');
  return rows[0];
}

export async function getSessionSummary(sessionId: string) {
  const { rows } = await pool.query(`SELECT * FROM v_cashier_session_summary WHERE id = $1`, [sessionId]);
  return rows[0] ?? null;
}

export async function listCashierSessions(limit = 100) {
  const { rows } = await pool.query(
    `SELECT cs.*, u.username FROM cashier_sessions cs JOIN users u ON u.id = cs.cashier_id
      ORDER BY cs.opened_at DESC LIMIT $1`,
    [limit]
  );
  return rows;
}
