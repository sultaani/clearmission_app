-- =========================================================
-- File 07: Views — reporting & analytics layer
-- All views exclude soft-deleted rows so deleted transactions
-- never leak into revenue/profit/inventory figures (PRD #78).
-- =========================================================

-- ---------------------------------------------------------
-- Revenue / P&L building blocks
-- ---------------------------------------------------------
CREATE VIEW v_active_job_orders AS
    SELECT * FROM job_orders WHERE deleted_at IS NULL;

CREATE VIEW v_active_job_order_items AS
    SELECT joi.* FROM job_order_items joi
    JOIN v_active_job_orders jo ON jo.id = joi.job_order_id;

CREATE VIEW v_revenue_by_day AS
    SELECT date_trunc('day', created_at)::date AS day,
           SUM(subtotal) AS revenue,
           COUNT(*) AS job_order_count
    FROM v_active_job_orders
    GROUP BY 1;

CREATE VIEW v_gross_profit AS
    SELECT jo.id AS job_order_id, jo.job_order_no, jo.created_at,
           jo.subtotal AS revenue,
           COALESCE(SUM(joi.material_cost),0) AS material_cost,
           jo.subtotal - COALESCE(SUM(joi.material_cost),0) AS gross_profit
    FROM v_active_job_orders jo
    LEFT JOIN job_order_items joi ON joi.job_order_id = jo.id
    GROUP BY jo.id, jo.job_order_no, jo.created_at, jo.subtotal;

CREATE VIEW v_profit_and_loss_daily AS
    SELECT day,
           revenue,
           material_cost,
           revenue - material_cost AS gross_profit,
           expenses,
           (revenue - material_cost) - expenses AS net_profit
    FROM (
        SELECT date_trunc('day', jo.created_at)::date AS day,
               SUM(jo.subtotal) AS revenue,
               SUM(COALESCE(gp.material_cost,0)) AS material_cost
        FROM v_active_job_orders jo
        LEFT JOIN v_gross_profit gp ON gp.job_order_id = jo.id
        GROUP BY 1
    ) rev
    FULL JOIN (
        SELECT date_trunc('day', incurred_at)::date AS day, SUM(amount) AS expenses
        FROM expenses WHERE deleted_at IS NULL
        GROUP BY 1
    ) exp USING (day);

-- ---------------------------------------------------------
-- Debt / receivables
-- ---------------------------------------------------------
CREATE VIEW v_debts AS
    SELECT i.id AS invoice_id, i.invoice_no, i.customer_id, c.name AS customer_name,
           i.subtotal AS original_amount, i.amount_paid, i.outstanding,
           i.created_at,
           (CURRENT_DATE - i.created_at::date) AS age_days,
           CASE
               WHEN (CURRENT_DATE - i.created_at::date) <= 0 THEN 'current'
               WHEN (CURRENT_DATE - i.created_at::date) BETWEEN 1 AND 30 THEN '1-30'
               WHEN (CURRENT_DATE - i.created_at::date) BETWEEN 31 AND 60 THEN '31-60'
               WHEN (CURRENT_DATE - i.created_at::date) BETWEEN 61 AND 90 THEN '61-90'
               ELSE '90+'
           END AS age_bucket
    FROM invoices i
    JOIN customers c ON c.id = i.customer_id
    WHERE i.deleted_at IS NULL AND i.outstanding > 0;

-- ---------------------------------------------------------
-- Customer profile stats (computed, not denormalized — always correct)
-- ---------------------------------------------------------
CREATE VIEW v_customer_stats AS
    SELECT c.id AS customer_id, c.customer_code, c.name,
           COUNT(jo.id) AS total_job_orders,
           COALESCE(SUM(jo.subtotal),0) AS total_revenue,
           COALESCE(SUM(jo.amount_paid),0) AS total_payments,
           COALESCE(SUM(jo.outstanding_balance),0) AS outstanding_balance,
           MAX(jo.created_at) AS last_job_order_at,
           CASE WHEN COUNT(jo.id) > 0
                THEN ROUND(COALESCE(SUM(jo.subtotal),0) / COUNT(jo.id), 2)
                ELSE 0 END AS avg_job_order_value
    FROM customers c
    LEFT JOIN v_active_job_orders jo ON jo.customer_id = c.id
    WHERE c.deleted_at IS NULL
    GROUP BY c.id, c.customer_code, c.name;

-- ---------------------------------------------------------
-- Customer of the month — highest completed-job-order count,
-- tie-break by total revenue in that month (PRD #13)
-- ---------------------------------------------------------
CREATE VIEW v_customer_of_month AS
    WITH monthly AS (
        SELECT customer_id,
               date_trunc('month', created_at)::date AS month,
               COUNT(*) AS job_orders,
               SUM(subtotal) AS revenue
        FROM v_active_job_orders
        GROUP BY customer_id, date_trunc('month', created_at)
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

-- ---------------------------------------------------------
-- Inventory: valuation + low stock
-- ---------------------------------------------------------
CREATE VIEW v_inventory_valuation AS
    SELECT id, name, category, unit, quantity_on_hand, weighted_avg_cost,
           ROUND(quantity_on_hand * weighted_avg_cost, 2) AS inventory_value
    FROM inventory_items
    WHERE deleted_at IS NULL AND is_active = TRUE;

CREATE VIEW v_low_stock AS
    SELECT id, name, category, unit, quantity_on_hand, min_stock_threshold
    FROM inventory_items
    WHERE deleted_at IS NULL AND is_active = TRUE
      AND quantity_on_hand <= min_stock_threshold;

-- ---------------------------------------------------------
-- Cashier session reconciliation summary
-- ---------------------------------------------------------
CREATE VIEW v_cashier_session_summary AS
    SELECT cs.id, cs.cashier_id, u.username, cs.opened_at, cs.closed_at, cs.status,
           cs.expected_cash, cs.expected_transfer, cs.expected_pos,
           cs.actual_cash, cs.actual_transfer, cs.actual_pos, cs.variance
    FROM cashier_sessions cs
    JOIN users u ON u.id = cs.cashier_id;
