import { pool } from '../db';

export type DateRange = { from?: string; to?: string };

function rangeClause(from?: string, to?: string, col = 'jo.created_at') {
  const parts: string[] = [];
  const params: unknown[] = [];
  if (from) { params.push(from); parts.push(`${col} >= $${params.length}`); }
  if (to) { params.push(to); parts.push(`${col} <= $${params.length}`); }
  return { where: parts.length ? `AND ${parts.join(' AND ')}` : '', params };
}

export async function salesReport({ from, to }: DateRange) {
  const { where, params } = rangeClause(from, to, 'jo.created_at');
  const { rows } = await pool.query(
    `SELECT jo.job_order_no, jo.created_at, c.name AS customer, joi.category, joi.description,
            joi.quantity, joi.standard_rate, joi.collected_amount, jo.amount_paid,
            jo.outstanding_balance, jo.payment_status, u.username AS cashier
       FROM job_orders jo
       JOIN job_order_items joi ON joi.job_order_id = jo.id
       JOIN customers c ON c.id = jo.customer_id
       JOIN users u ON u.id = jo.cashier_id
      WHERE jo.deleted_at IS NULL ${where}
      ORDER BY jo.created_at DESC`,
    params
  );
  return rows;
}

export async function materialReport(inventoryItemId: string, { from, to }: DateRange) {
  const { where, params } = rangeClause(from, to, 'im.created_at');
  const { rows } = await pool.query(
    `SELECT
        i.name AS material,
        COALESCE(SUM(joi.collected_amount) FILTER (WHERE jo.deleted_at IS NULL), 0) AS revenue,
        COALESCE(SUM(-im.quantity_delta) FILTER (WHERE im.movement_type = 'sale_deduction'), 0) AS material_consumed,
        COALESCE(SUM(-im.quantity_delta * im.unit_cost_at_time) FILTER (WHERE im.movement_type = 'sale_deduction'), 0) AS material_cost,
        COUNT(DISTINCT jo.id) AS job_order_count
     FROM inventory_items i
     LEFT JOIN inventory_movements im ON im.inventory_item_id = i.id ${where}
     LEFT JOIN job_orders jo ON jo.id = im.source_job_order_id
     LEFT JOIN job_order_items joi ON joi.job_order_id = jo.id AND joi.inventory_item_id = i.id
     WHERE i.id = $${params.length + 1}
     GROUP BY i.name`,
    [...params, inventoryItemId]
  );
  return rows[0] ?? null;
}

export async function financialReport({ from, to }: DateRange) {
  const { where, params } = rangeClause(from, to, 'day');
  const { rows } = await pool.query(
    `SELECT * FROM v_profit_and_loss_daily WHERE 1=1 ${where} ORDER BY day`,
    params
  );
  // The underlying view FULL JOINs job-order revenue against expenses by day —
  // a day with revenue but zero recorded expenses has no matching row on the
  // expenses side, so Postgres returns NULL rather than 0. Coerce once here
  // so every consumer (totals below, and the client) gets real numbers.
  const daily = rows.map((r) => ({
    day: r.day,
    revenue: Number(r.revenue || 0),
    material_cost: Number(r.material_cost || 0),
    gross_profit: Number(r.gross_profit || 0),
    expenses: Number(r.expenses || 0),
    net_profit: Number(r.revenue || 0) - Number(r.material_cost || 0) - Number(r.expenses || 0),
  }));
  const totals = daily.reduce(
    (acc, r) => ({
      revenue: acc.revenue + r.revenue,
      material_cost: acc.material_cost + r.material_cost,
      gross_profit: acc.gross_profit + r.gross_profit,
      expenses: acc.expenses + r.expenses,
      net_profit: acc.net_profit + r.net_profit,
    }),
    { revenue: 0, material_cost: 0, gross_profit: 0, expenses: 0, net_profit: 0 }
  );
  return { daily, totals };
}

export async function customerReport() {
  const { rows } = await pool.query(`SELECT * FROM v_customer_stats ORDER BY total_revenue DESC`);
  // pg returns bigint/numeric columns as strings by default — coerce the numeric fields
  // reports actually do arithmetic/comparison on, so callers don't have to remember to.
  return rows.map((r) => ({
    ...r,
    total_job_orders: Number(r.total_job_orders),
    total_revenue: Number(r.total_revenue),
    total_payments: Number(r.total_payments),
    outstanding_balance: Number(r.outstanding_balance),
    avg_job_order_value: Number(r.avg_job_order_value),
  }));
}

export async function inventoryReport() {
  const { rows } = await pool.query(`SELECT * FROM v_inventory_valuation ORDER BY inventory_value DESC`);
  return rows;
}
