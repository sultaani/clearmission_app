-- =========================================================
-- TEST 3: Audit trail, soft-delete integrity, debt aging,
--         customer of the month, cashier session reconciliation
-- =========================================================
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
    v_admin UUID; v_cashier UUID; v_c1 UUID; v_c2 UUID;
    v_jo1 UUID; v_jo2 UUID; v_jo3 UUID; v_inv1 UUID;
    v_revenue_before NUMERIC; v_revenue_after NUMERIC; v_revenue_restored NUMERIC;
    v_session UUID;
BEGIN
    SELECT id INTO v_admin FROM users WHERE username='admin';
    SELECT id INTO v_cashier FROM users WHERE username='cashier';
    INSERT INTO customers (name) VALUES ('XYZ Limited') RETURNING id INTO v_c1;
    INSERT INTO customers (name) VALUES ('ABC Limited') RETURNING id INTO v_c2;

    -- -----------------------------------------------------
    -- 3a. Soft delete must remove a job order from revenue, restore must bring it back (PRD #78)
    -- -----------------------------------------------------
    INSERT INTO job_orders (customer_id, cashier_id) VALUES (v_c1, v_cashier) RETURNING id INTO v_jo1;
    INSERT INTO job_order_items (job_order_id, category, description, quantity, unit, standard_rate, calculated_amount, collected_amount)
        VALUES (v_jo1, 'Other', 'test item', 1, 'piece', 30000, 30000, 30000);

    v_revenue_before := (SELECT COALESCE(SUM(revenue),0) FROM v_revenue_by_day WHERE day = CURRENT_DATE);

    UPDATE job_orders SET deleted_at = now(), deleted_by = v_admin WHERE id = v_jo1;
    v_revenue_after := (SELECT COALESCE(SUM(revenue),0) FROM v_revenue_by_day WHERE day = CURRENT_DATE);

    ASSERT v_revenue_after = v_revenue_before - 30000,
        'FAIL: deleted job order should drop out of revenue entirely';

    -- audit log must still show the delete happened
    ASSERT EXISTS (SELECT 1 FROM audit_logs WHERE module='job_orders' AND record_id=v_jo1 AND action='soft_delete'),
        'FAIL: soft_delete action not logged in audit_logs';

    -- restore
    UPDATE job_orders SET deleted_at = NULL, deleted_by = NULL WHERE id = v_jo1;
    v_revenue_restored := (SELECT COALESCE(SUM(revenue),0) FROM v_revenue_by_day WHERE day = CURRENT_DATE);

    ASSERT v_revenue_restored = v_revenue_before,
        'FAIL: restored job order should reinstate its revenue';
    ASSERT EXISTS (SELECT 1 FROM audit_logs WHERE module='job_orders' AND record_id=v_jo1 AND action='restore'),
        'FAIL: restore action not logged in audit_logs';

    -- original insert should also be logged
    ASSERT EXISTS (SELECT 1 FROM audit_logs WHERE module='job_orders' AND record_id=v_jo1 AND action='insert'),
        'FAIL: insert action not logged in audit_logs';

    -- -----------------------------------------------------
    -- 3b. Debt aging — an invoice created "today" with an outstanding balance
    --     should land in the 'current' bucket (age_days <= 0 for same-day)
    -- -----------------------------------------------------
    INSERT INTO invoices (job_order_id, customer_id, subtotal, amount_paid)
    VALUES (v_jo1, v_c1, 30000, 10000) RETURNING id INTO v_inv1;

    ASSERT EXISTS (SELECT 1 FROM v_debts WHERE invoice_id = v_inv1 AND age_bucket = 'current'),
        'FAIL: same-day invoice with outstanding balance should be in the current debt bucket';
    ASSERT (SELECT outstanding FROM v_debts WHERE invoice_id = v_inv1) = 20000,
        'FAIL: v_debts outstanding amount incorrect';

    -- -----------------------------------------------------
    -- 3c. Customer of the Month — most Job Orders this month wins;
    --     tie broken by revenue (PRD #13)
    -- -----------------------------------------------------
    -- give v_c2 (ABC Limited) 2 job orders this month, v_c1 (XYZ) already has 1
    INSERT INTO job_orders (customer_id, cashier_id) VALUES (v_c2, v_cashier) RETURNING id INTO v_jo2;
    INSERT INTO job_order_items (job_order_id, category, description, quantity, unit, standard_rate, calculated_amount, collected_amount)
        VALUES (v_jo2, 'Other', 'x', 1, 'piece', 5000, 5000, 5000);
    INSERT INTO job_orders (customer_id, cashier_id) VALUES (v_c2, v_cashier) RETURNING id INTO v_jo3;
    INSERT INTO job_order_items (job_order_id, category, description, quantity, unit, standard_rate, calculated_amount, collected_amount)
        VALUES (v_jo3, 'Other', 'y', 1, 'piece', 5000, 5000, 5000);

    ASSERT (SELECT name FROM v_customer_of_month WHERE month = date_trunc('month', CURRENT_DATE)::date) = 'ABC Limited',
        'FAIL: ABC Limited (2 job orders) should be customer of the month over XYZ Limited (1)';

    -- -----------------------------------------------------
    -- 3d. Cashier session reconciliation variance
    -- -----------------------------------------------------
    INSERT INTO cashier_sessions (cashier_id, expected_cash, expected_transfer, expected_pos)
    VALUES (v_cashier, 80000, 150000, 50000) RETURNING id INTO v_session;

    UPDATE cashier_sessions
       SET actual_cash = 78000, actual_transfer = 150000, actual_pos = 50000,
           closed_at = now(), status = 'closed'
     WHERE id = v_session;

    ASSERT (SELECT variance FROM cashier_sessions WHERE id = v_session) = -2000,
        'FAIL: cashier session variance should be -2000 (short by 2000), got %',
        (SELECT variance FROM cashier_sessions WHERE id = v_session);

    RAISE NOTICE 'TEST 3 PASSED: soft-delete/restore financial exclusion + audit trail, debt aging, customer of month, cashier reconciliation all correct';
END $$;

ROLLBACK;
