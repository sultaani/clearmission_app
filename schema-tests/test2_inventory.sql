-- =========================================================
-- TEST 2: Inventory engine
-- =========================================================
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
    v_cashier UUID; v_customer UUID; v_jo UUID;
    v_flex UUID; v_artcard UUID;
    v_before_qty NUMERIC; v_after_qty NUMERIC; v_avg_cost NUMERIC;
BEGIN
    SELECT id INTO v_cashier FROM users WHERE username='cashier';
    SELECT id INTO v_customer FROM customers WHERE is_walk_in = TRUE;
    SELECT id INTO v_flex FROM inventory_items WHERE name = 'Flex';
    SELECT id INTO v_artcard FROM inventory_items WHERE name = 'Art Card A3';

    -- -----------------------------------------------------
    -- 2a. Weighted-average costing across two procurements (PRD #37)
    -- 100m @ 1600/m, then 50m @ 1700/m -> new avg = ((100*1600)+(50*1700))/150 = 1633.33
    -- -----------------------------------------------------
    INSERT INTO procurements (inventory_item_id, quantity, total_cost, recorded_by)
    VALUES (v_flex, 100, 160000, v_cashier);
    INSERT INTO procurements (inventory_item_id, quantity, total_cost, recorded_by)
    VALUES (v_flex, 50, 85000, v_cashier);  -- 1700/m

    SELECT weighted_avg_cost, quantity_on_hand INTO v_avg_cost, v_after_qty
    FROM inventory_items WHERE id = v_flex;

    ASSERT ROUND(v_avg_cost, 2) = 1633.33,
        'FAIL: weighted avg cost should be 1633.33, got %', v_avg_cost;
    ASSERT v_after_qty = 150, 'FAIL: Flex quantity_on_hand should be 150, got %', v_after_qty;

    -- -----------------------------------------------------
    -- 2b. DI inventory: 500 A3 Art Cards sold -> 500 sheets deducted (PRD #27)
    -- -----------------------------------------------------
    INSERT INTO procurements (inventory_item_id, quantity, total_cost, recorded_by)
    VALUES (v_artcard, 1000, 150000, v_cashier);  -- stock up first

    INSERT INTO job_orders (customer_id, cashier_id) VALUES (v_customer, v_cashier) RETURNING id INTO v_jo;

    INSERT INTO job_order_items
        (job_order_id, inventory_item_id, category, description, quantity, unit,
         standard_rate, calculated_amount, collected_amount)
    VALUES (v_jo, v_artcard, 'DI Printing', '500 A3 Art Cards', 500, 'sheet', 200, 100000, 100000);

    ASSERT (SELECT quantity_on_hand FROM inventory_items WHERE id = v_artcard) = 500,
        'FAIL: Art Card A3 should have 500 sheets left (1000-500), got %',
        (SELECT quantity_on_hand FROM inventory_items WHERE id = v_artcard);

    -- -----------------------------------------------------
    -- 2c. Large format, default (un-combined) case: 4x2 Flex job.
    -- Adding the item alone must NOT deduct anything yet (deferred to layout).
    -- -----------------------------------------------------
    v_before_qty := (SELECT quantity_on_hand FROM inventory_items WHERE id = v_flex);

    DECLARE v_item_id UUID;
    BEGIN
        INSERT INTO job_order_items
            (job_order_id, inventory_item_id, category, description, width, height, quantity, unit,
             standard_rate, calculated_amount, collected_amount)
        VALUES (v_jo, v_flex, 'Large Format', '4x2 Flex', 4, 2, 1, 'metre', 200, 1600, 1600)
        RETURNING id INTO v_item_id;

        ASSERT (SELECT quantity_on_hand FROM inventory_items WHERE id = v_flex) = v_before_qty,
            'FAIL: large-format item insert must NOT auto-deduct before a layout is registered';

        -- Cashier confirms default single-sheet layout: 8 sqft / 4ft roll width = 2 linear metres
        INSERT INTO material_layouts
            (job_order_id, job_order_item_id, inventory_item_id, specified_length, specified_width_ft,
             quantity_consumed, layout_method, created_by)
        VALUES (v_jo, v_item_id, v_flex, 4, 2, 2, 'default_orientation', v_cashier);
    END;

    v_after_qty := (SELECT quantity_on_hand FROM inventory_items WHERE id = v_flex);
    ASSERT (v_before_qty - v_after_qty) = 2,
        'FAIL: 4x2 Flex (8 sqft / 4ft roll width) should deduct 2 linear metres, deducted %',
        (v_before_qty - v_after_qty);
    ASSERT (SELECT ROUND(material_cost,2) FROM job_order_items
             WHERE job_order_id = v_jo AND description = '4x2 Flex')
           = ROUND(2 * v_avg_cost, 2),
        'FAIL: material_cost for Flex item not costed at weighted avg';

    -- -----------------------------------------------------
    -- 2d. Manual layout override: two jobs physically combined onto one 10x2 Flex sheet.
    -- Items are added first (as a cashier actually would); no deduction happens until
    -- the combined layout is registered — then it deducts ONCE for both.
    -- -----------------------------------------------------
    v_before_qty := (SELECT quantity_on_hand FROM inventory_items WHERE id = v_flex);

    INSERT INTO job_order_items
        (job_order_id, inventory_item_id, category, description, width, height, quantity, unit,
         standard_rate, calculated_amount, collected_amount)
    VALUES (v_jo, v_flex, 'Large Format', 'Job A 4x2 x2', 4, 2, 2, 'metre', 200, 3200, 3200);

    INSERT INTO job_order_items
        (job_order_id, inventory_item_id, category, description, width, height, quantity, unit,
         standard_rate, calculated_amount, collected_amount)
    VALUES (v_jo, v_flex, 'Large Format', 'Job B 2x2', 2, 2, 1, 'metre', 200, 800, 800);

    ASSERT (SELECT quantity_on_hand FROM inventory_items WHERE id = v_flex) = v_before_qty,
        'FAIL: combined-layout candidate items must not deduct independently before override is set';

    -- Cashier now specifies the real combined layout: 10ft x 2ft -> 20 sqft / 4ft = 5 linear metres
    INSERT INTO material_layouts
        (job_order_id, inventory_item_id, specified_length, specified_width_ft,
         quantity_consumed, layout_method, remark, created_by)
    VALUES (v_jo, v_flex, 10, 2, 5, 'manual_layout', 'Job A + Job B combined on one sheet', v_cashier);

    v_after_qty := (SELECT quantity_on_hand FROM inventory_items WHERE id = v_flex);
    ASSERT (v_before_qty - v_after_qty) = 5,
        'FAIL: combined layout should deduct exactly 5m once (not 6.5m from summing independent per-item deductions), deducted %',
        (v_before_qty - v_after_qty);

    -- Job A is 2 pieces at 4x2 = 16 sqft total; Job B is 1 piece at 2x2 = 4 sqft. Split 16:4 (4:1).
    ASSERT (SELECT ROUND(material_cost,2) FROM job_order_items WHERE job_order_id = v_jo AND description = 'Job A 4x2 x2')
           = ROUND((5 * v_avg_cost) * (16.0/20.0), 2),
        'FAIL: Job A share of combined layout cost incorrect';
    ASSERT (SELECT ROUND(material_cost,2) FROM job_order_items WHERE job_order_id = v_jo AND description = 'Job B 2x2')
           = ROUND((5 * v_avg_cost) * (4.0/20.0), 2),
        'FAIL: Job B share of combined layout cost incorrect';

    -- -----------------------------------------------------
    -- 2e. Low stock alert (PRD #38)
    -- -----------------------------------------------------
    UPDATE inventory_items SET quantity_on_hand = 15 WHERE name = 'SAV';  -- threshold is 20
    ASSERT EXISTS (SELECT 1 FROM v_low_stock WHERE name = 'SAV'),
        'FAIL: SAV at 15/20 should appear in low stock view';

    RAISE NOTICE 'TEST 2 PASSED: weighted avg costing, DI deduction, large-format sqft->metre conversion (single + combined layouts, proportional cost split), low stock all correct';
END $$;

ROLLBACK;
