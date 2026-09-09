import { pool } from '../db';

export async function dashboardSummary() {
  const [today, debt, lowStock, activeSessions, customerOfMonth] = await Promise.all([
    pool.query(
      `SELECT
          COALESCE((SELECT SUM(subtotal) FROM job_orders WHERE deleted_at IS NULL AND created_at::date = CURRENT_DATE), 0) AS revenue_today,
          COALESCE((SELECT SUM(amount) FROM payments WHERE deleted_at IS NULL AND created_at::date = CURRENT_DATE), 0) AS payments_today,
          COALESCE((SELECT SUM(amount) FROM expenses WHERE deleted_at IS NULL AND incurred_at::date = CURRENT_DATE), 0) AS expenses_today,
          COALESCE((SELECT COUNT(*) FROM job_orders WHERE deleted_at IS NULL AND created_at::date = CURRENT_DATE), 0) AS job_orders_today`
    ),
    pool.query(`SELECT COALESCE(SUM(outstanding),0) AS total_outstanding FROM v_debts`),
    pool.query(`SELECT COUNT(*) AS low_stock_count FROM v_low_stock`),
    pool.query(`SELECT COUNT(*) AS active_sessions FROM cashier_sessions WHERE status = 'open'`),
    pool.query(
      `SELECT name, job_orders, revenue FROM v_customer_of_month
        WHERE month = date_trunc('month', CURRENT_DATE)::date`
    ),
  ]);

  const t = today.rows[0];
  const profitToday = Number(t.revenue_today) - Number(t.expenses_today);

  return {
    revenueToday: Number(t.revenue_today),
    paymentsToday: Number(t.payments_today),
    expensesToday: Number(t.expenses_today),
    profitToday,
    jobOrdersToday: Number(t.job_orders_today),
    outstandingDebt: Number(debt.rows[0].total_outstanding),
    lowStockCount: Number(lowStock.rows[0].low_stock_count),
    activeSessions: Number(activeSessions.rows[0].active_sessions),
    customerOfMonth: customerOfMonth.rows[0] ?? null,
  };
}
