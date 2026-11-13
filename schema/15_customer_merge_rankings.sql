-- =========================================================
-- File 15: customer merge + top-customer rankings
-- Safe to run more than once.
-- =========================================================

-- 1. Customers that should never win a "top customer" ranking.
--    WALK-IN CUSTOMER already has is_walk_in = TRUE; Clearmission's own jobs are "internal".
ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_internal BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE customers
   SET is_internal = TRUE
 WHERE lower(btrim(name)) = 'clearmission'
   AND deleted_at IS NULL
   AND is_internal = FALSE;

-- 2. Merge log. Each row records exactly which records moved, so a merge can be undone.
CREATE TABLE IF NOT EXISTS customer_merges (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    survivor_id          UUID NOT NULL REFERENCES customers(id),
    source_id            UUID NOT NULL REFERENCES customers(id),
    source_name          TEXT NOT NULL,
    survivor_name_before TEXT NOT NULL,
    survivor_name_after  TEXT NOT NULL,
    moved                JSONB NOT NULL,   -- {"job_orders":[ids], "invoices":[...], "payments":[...], "receipts":[...], "quotations":[...]}
    merged_by            UUID REFERENCES users(id),
    merged_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    undone_at            TIMESTAMPTZ,
    undone_by            UUID REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_customer_merges_survivor ON customer_merges(survivor_id);
CREATE INDEX IF NOT EXISTS idx_customer_merges_merged_at ON customer_merges(merged_at DESC);

-- 3. Customer of the Month (dashboard tile) now ignores walk-in and internal customers
--    and buckets months by Lagos time. Same columns as before, so nothing else changes.
CREATE OR REPLACE VIEW v_customer_of_month AS
    WITH monthly AS (
        SELECT jo.customer_id,
               date_trunc('month', jo.created_at AT TIME ZONE 'Africa/Lagos')::date AS month,
               COUNT(*) AS job_orders,
               SUM(jo.subtotal) AS revenue
        FROM v_active_job_orders jo
        JOIN customers c ON c.id = jo.customer_id
        WHERE NOT c.is_walk_in AND NOT c.is_internal
        GROUP BY jo.customer_id, date_trunc('month', jo.created_at AT TIME ZONE 'Africa/Lagos')
    ),
    ranked AS (
        SELECT *, RANK() OVER (
            PARTITION BY month ORDER BY job_orders DESC, revenue DESC
        ) AS rnk
        FROM monthly
    )
    SELECT r.month, c.id AS customer_id, c.name, r.job_orders, r.revenue
    FROM ranked r
    JOIN customers c ON c.id = r.customer_id
    WHERE r.rnk = 1;
