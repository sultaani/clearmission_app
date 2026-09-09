-- =========================================================
-- TEST 1: Core transaction loop
-- Job Order (2 items) -> Invoice -> two partial payments -> receipts
-- Verifies: revenue = job order value at creation (not at payment),
-- outstanding balance tracks correctly, payment_status transitions.
-- =========================================================
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
    v_admin UUID; v_cashier UUID; v_customer UUID; v_jo UUID; v_inv UUID;
    v_pay1 UUID; v_pay2 UUID;
BEGIN
    SELECT id INTO v_admin FROM users WHERE username='admin';
    SELECT id INTO v_cashier FROM users WHERE username='cashier';

    INSERT INTO customers (name, phone) VALUES ('ABC Limited', '08011112222') RETURNING id INTO v_customer;

    INSERT INTO job_orders (customer_id, cashier_id) VALUES (v_customer, v_cashier) RETURNING id INTO v_jo;

    -- Item 1: 500 A3 Art Cards @ 200 standard, cashier collects full standard price
    INSERT INTO job_order_items
        (job_order_id, category, description, quantity, unit, standard_rate, calculated_amount, collected_amount)
    VALUES (v_jo, 'DI Printing', '500 A3 Art Cards', 500, 'sheet', 200, 100000, 100000);

    -- Item 2: 10 branded shirts @ negotiated 5000 (standard would be higher, no discount field — just collected amount)
    INSERT INTO job_order_items
        (job_order_id, category, description, quantity, unit, standard_rate, calculated_amount, collected_amount)
    VALUES (v_jo, 'Branding', '10 branded shirts', 10, 'piece', 5000, 50000, 45000);

    -- job order subtotal should now be 100000 + 45000 = 145000 (via trigger)
    ASSERT (SELECT subtotal FROM job_orders WHERE id = v_jo) = 145000,
        'FAIL: job order subtotal not recalculated correctly';

    INSERT INTO invoices (job_order_id, customer_id, subtotal)
    VALUES (v_jo, v_customer, (SELECT subtotal FROM job_orders WHERE id = v_jo))
    RETURNING id INTO v_inv;

    -- Payment 1: 40,000
    INSERT INTO payments (customer_id, amount, method, recorded_by) VALUES (v_customer, 40000, 'cash', v_cashier) RETURNING id INTO v_pay1;
    INSERT INTO payment_allocations (payment_id, invoice_id, amount_allocated) VALUES (v_pay1, v_inv, 40000);
    INSERT INTO receipts (payment_id, customer_id) VALUES (v_pay1, v_customer);

    ASSERT (SELECT payment_status FROM invoices WHERE id = v_inv) = 'partial',
        'FAIL: invoice should be partial after first payment';
    ASSERT (SELECT outstanding_balance FROM job_orders WHERE id = v_jo) = 105000,
        'FAIL: job order outstanding should be 105000 after first payment, got %', (SELECT outstanding_balance FROM job_orders WHERE id = v_jo);

    -- Payment 2: remaining 105,000
    INSERT INTO payments (customer_id, amount, method, recorded_by) VALUES (v_customer, 105000, 'bank_transfer', v_cashier) RETURNING id INTO v_pay2;
    INSERT INTO payment_allocations (payment_id, invoice_id, amount_allocated) VALUES (v_pay2, v_inv, 105000);
    INSERT INTO receipts (payment_id, customer_id) VALUES (v_pay2, v_customer);

    ASSERT (SELECT payment_status FROM invoices WHERE id = v_inv) = 'paid',
        'FAIL: invoice should be fully paid';
    ASSERT (SELECT payment_status FROM job_orders WHERE id = v_jo) = 'paid',
        'FAIL: job order should be fully paid';
    ASSERT (SELECT outstanding_balance FROM job_orders WHERE id = v_jo) = 0,
        'FAIL: outstanding balance should be zero';

    -- Revenue recognition: full 145000 counted even though it arrived in 2 payments (PRD #48)
    ASSERT (SELECT revenue FROM v_revenue_by_day WHERE day = CURRENT_DATE) = 145000,
        'FAIL: revenue should equal job order value regardless of payment timing';

    RAISE NOTICE 'TEST 1 PASSED: core transaction loop, revenue recognition, payment allocation all correct';
END $$;

ROLLBACK;  -- test transaction, don't persist
