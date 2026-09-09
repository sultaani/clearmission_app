-- =========================================================
-- File 12: Friendly out-of-stock errors
--
-- Bug found in production use: selling more of a material than is in stock
-- (e.g. a large-format job needing 22.5m of Flex when only ~2.5m remains)
-- hit the chk_qty_nonneg CHECK constraint directly, surfacing a raw
-- Postgres constraint-violation error with column/table names in it,
-- instead of a clear "not enough stock" message. Fixed by checking
-- sufficiency explicitly and RAISE EXCEPTION-ing with a real message
-- before the UPDATE ever runs.
--
-- Safe to re-run: CREATE OR REPLACE FUNCTION replaces the existing
-- function bodies in place, no data changes, no DROP.
-- =========================================================

CREATE OR REPLACE FUNCTION fn_consume_inventory_for_item() RETURNS TRIGGER AS $$
DECLARE
    v_item inventory_items%ROWTYPE;
    v_qty_to_deduct NUMERIC(14,3);
BEGIN
    IF NEW.inventory_item_id IS NULL THEN
        RETURN NEW;  -- no material tracked for this line (e.g. a plain service)
    END IF;

    SELECT * INTO v_item FROM inventory_items WHERE id = NEW.inventory_item_id FOR UPDATE;

    IF v_item.category = 'large_format_material' THEN
        RETURN NEW;  -- deduction deferred to material_layouts — see note above
    END IF;

    v_qty_to_deduct := NEW.quantity;  -- sheets, yards, pieces, bottles etc. deduct 1:1

    IF v_qty_to_deduct IS NULL OR v_qty_to_deduct <= 0 THEN
        RETURN NEW;
    END IF;

    IF v_item.quantity_on_hand < v_qty_to_deduct THEN
        RAISE EXCEPTION 'Not enough % in stock: need % % but only % % available',
            v_item.name, v_qty_to_deduct, v_item.unit, v_item.quantity_on_hand, v_item.unit;
    END IF;

    UPDATE inventory_items
       SET quantity_on_hand = quantity_on_hand - v_qty_to_deduct,
           updated_at = now()
     WHERE id = NEW.inventory_item_id;

    INSERT INTO inventory_movements
        (inventory_item_id, movement_type, quantity_delta, unit_cost_at_time,
         source_job_order_id, calculation_method, performed_by, remark)
    VALUES
        (NEW.inventory_item_id, 'sale_deduction', -v_qty_to_deduct, v_item.weighted_avg_cost,
         NEW.job_order_id, 'direct_unit',
         (SELECT cashier_id FROM job_orders WHERE id = NEW.job_order_id),
         'auto-consumption for job order item');

    UPDATE job_order_items
       SET material_cost = v_qty_to_deduct * v_item.weighted_avg_cost
     WHERE id = NEW.id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_apply_material_layout() RETURNS TRIGGER AS $$
DECLARE
    v_item inventory_items%ROWTYPE;
BEGIN
    SELECT * INTO v_item FROM inventory_items WHERE id = NEW.inventory_item_id FOR UPDATE;

    IF v_item.quantity_on_hand < NEW.quantity_consumed THEN
        RAISE EXCEPTION 'Not enough % in stock: this job needs % % but only % % available',
            v_item.name, NEW.quantity_consumed, v_item.unit, v_item.quantity_on_hand, v_item.unit;
    END IF;

    UPDATE inventory_items
       SET quantity_on_hand = quantity_on_hand - NEW.quantity_consumed,
           updated_at = now()
     WHERE id = NEW.inventory_item_id;

    INSERT INTO inventory_movements
        (inventory_item_id, movement_type, quantity_delta, unit_cost_at_time,
         source_job_order_id, material_layout_id, calculation_method, performed_by, remark)
    VALUES
        (NEW.inventory_item_id, 'sale_deduction', -NEW.quantity_consumed, v_item.weighted_avg_cost,
         NEW.job_order_id, NEW.id, NEW.layout_method, NEW.created_by, NEW.remark);

    IF NEW.job_order_item_id IS NOT NULL THEN
        UPDATE job_order_items
           SET material_cost = NEW.quantity_consumed * v_item.weighted_avg_cost
         WHERE id = NEW.job_order_item_id;
    ELSE
        UPDATE job_order_items joi
           SET material_cost = ROUND(
                 (NEW.quantity_consumed * v_item.weighted_avg_cost)
                 * (joi.area_sqft / NULLIF(cov.total_area, 0)), 2)
          FROM (
                SELECT job_order_id, inventory_item_id, SUM(area_sqft) AS total_area
                  FROM job_order_items
                 WHERE job_order_id = NEW.job_order_id AND inventory_item_id = NEW.inventory_item_id
                   AND material_cost = 0
                   AND NOT EXISTS (
                       SELECT 1 FROM material_layouts ml
                        WHERE ml.job_order_item_id = job_order_items.id
                   )
                 GROUP BY job_order_id, inventory_item_id
               ) cov
         WHERE joi.job_order_id = cov.job_order_id AND joi.inventory_item_id = cov.inventory_item_id
           AND joi.material_cost = 0
           AND NOT EXISTS (SELECT 1 FROM material_layouts ml WHERE ml.job_order_item_id = joi.id);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
