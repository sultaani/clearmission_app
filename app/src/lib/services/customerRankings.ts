import { pool } from '../db';

export type RankMetric = 'orders' | 'revenue';

// Whitelisted ORDER BY clauses; the metric string from the request is never put into SQL directly.
const ORDER_BY: Record<RankMetric, string> = {
  orders: 'job_orders DESC, revenue DESC',
  revenue: 'revenue DESC, job_orders DESC',
};

export type RankedCustomer = {
  customer_id: string;
  name: string;
  job_orders: number;
  revenue: number;
  rank: number; // 1 = winner; two customers can share rank 1 on an exact tie
};

export type MonthRanking = {
  month: string; // 'YYYY-MM'
  top: RankedCustomer[];
  tied: boolean;
};

const TZ = 'Africa/Lagos';

function coerce(r: any): RankedCustomer {
  return {
    customer_id: r.customer_id,
    name: r.name,
    job_orders: Number(r.job_orders),
    revenue: Number(r.revenue),
    rank: Number(r.rnk),
  };
}

/**
 * Top customers for each month of a year, plus the customer of the year.
 * By default WALK-IN CUSTOMER and internal (Clearmission's own) jobs are left out.
 * Deleted job orders never count, same as every other report.
 */
export async function getCustomerRankings(opts: {
  year: number;
  metric: RankMetric;
  includeExcluded: boolean;
  topPerMonth?: number;
  topForYear?: number;
}) {
  const metric: RankMetric = opts.metric === 'revenue' ? 'revenue' : 'orders';
  const orderBy = ORDER_BY[metric];
  const topPerMonth = Math.min(Math.max(opts.topPerMonth ?? 3, 1), 10);
  const topForYear = Math.min(Math.max(opts.topForYear ?? 10, 1), 50);
  const params = [opts.year, opts.includeExcluded];

  const baseCte = `
    base AS (
      SELECT jo.customer_id, c.name, jo.subtotal,
             to_char(jo.created_at AT TIME ZONE '${TZ}', 'YYYY-MM') AS ym
        FROM v_active_job_orders jo
        JOIN customers c ON c.id = jo.customer_id
       WHERE extract(year FROM jo.created_at AT TIME ZONE '${TZ}') = $1
         AND ($2::boolean OR (NOT c.is_walk_in AND NOT c.is_internal))
    )`;

  const [monthly, yearly, years, totals] = await Promise.all([
    pool.query(
      `WITH ${baseCte},
       agg AS (
         SELECT ym, customer_id, name, COUNT(*) AS job_orders, SUM(subtotal) AS revenue
           FROM base GROUP BY ym, customer_id, name
       ),
       ranked AS (
         SELECT *, RANK() OVER (PARTITION BY ym ORDER BY ${orderBy}) AS rnk,
                   ROW_NUMBER() OVER (PARTITION BY ym ORDER BY ${orderBy}, name) AS rn
           FROM agg
       )
       SELECT ym, customer_id, name, job_orders, revenue, rnk
         FROM ranked WHERE rn <= ${topPerMonth} OR rnk = 1
        ORDER BY ym, rn`,
      params
    ),
    pool.query(
      `WITH ${baseCte},
       agg AS (
         SELECT customer_id, name, COUNT(*) AS job_orders, SUM(subtotal) AS revenue
           FROM base GROUP BY customer_id, name
       ),
       ranked AS (
         SELECT *, RANK() OVER (ORDER BY ${orderBy}) AS rnk,
                   ROW_NUMBER() OVER (ORDER BY ${orderBy}, name) AS rn
           FROM agg
       )
       SELECT customer_id, name, job_orders, revenue, rnk
         FROM ranked WHERE rn <= ${topForYear} OR rnk = 1
        ORDER BY rn`,
      params
    ),
    pool.query(
      `SELECT DISTINCT extract(year FROM created_at AT TIME ZONE '${TZ}')::int AS year
         FROM v_active_job_orders ORDER BY year DESC`
    ),
    pool.query(
      `WITH ${baseCte} SELECT COUNT(*) AS orders, COALESCE(SUM(subtotal), 0) AS revenue FROM base`,
      params
    ),
  ]);

  const byMonth = new Map<string, RankedCustomer[]>();
  for (const r of monthly.rows) {
    if (!byMonth.has(r.ym)) byMonth.set(r.ym, []);
    byMonth.get(r.ym)!.push(coerce(r));
  }
  const months: MonthRanking[] = Array.from({ length: 12 }, (_, i) => {
    const key = `${opts.year}-${String(i + 1).padStart(2, '0')}`;
    const top = byMonth.get(key) ?? [];
    return { month: key, top, tied: top.filter((t) => t.rank === 1).length > 1 };
  });

  const yearTop = yearly.rows.map(coerce);
  return {
    year: opts.year,
    metric,
    includeExcluded: opts.includeExcluded,
    availableYears: years.rows.map((r) => r.year as number),
    totals: { orders: Number(totals.rows[0].orders), revenue: Number(totals.rows[0].revenue) },
    customerOfTheYear: yearTop.filter((t) => t.rank === 1),
    yearTop,
    months,
  };
}
