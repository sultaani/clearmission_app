-- =========================================================
-- File 06: Functions & Triggers — the parts that make the
-- accounting/inventory rules self-enforcing rather than app-trusted
-- =========================================================

-- ---------------------------------------------------------
-- 1. GENERIC AUDIT TRIGGER
--    Fires on every INSERT/UPDATE on audited tables.
--    Detects soft-delete / restore via deleted_at transitions.
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_audit_trigger() RETURNS TRIGGER AS $$
DECLARE
    v_action TEXT;
    v_actor  UUID;
BEGIN
    BEGIN
        v_actor := current_setting('app.current_user_id', true)::UUID;
    EXCEPTION WHEN OTHERS THEN
        v_actor := NULL;
    END;

    IF TG_OP = 'INSERT' THEN
        v_action := 'insert';
        INSERT INTO audit_logs(actor_id, action, module, record_id, previous_data, new_data)
        VALUES (v_actor, v_action, TG_TABLE_NAME, NEW.id, NULL, to_jsonb(NEW));
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
            v_action := 'soft_delete';
        ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
            v_action := 'restore';
        ELSE
            v_action := 'update';
        END IF;
        INSERT INTO audit_logs(actor_id, action, module, record_id, previous_data, new_data)
        VALUES (v_actor, v_action, TG_TABLE_NAME, NEW.id, to_jsonb(OLD), to_jsonb(NEW));
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_job_orders AFTER INSERT OR UPDATE ON job_orders
    FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();
CREATE TRIGGER trg_audit_customers AFTER INSERT OR UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();
CREATE TRIGGER trg_audit_payments AFTER INSERT OR UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();
CREATE TRIGGER trg_audit_products_services AFTER INSERT OR UPDATE ON products_services
    FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();
CREATE TRIGGER trg_audit_expenses AFTER INSERT OR UPDATE ON expenses
    FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();
CREATE TRIGGER trg_audit_inventory_items AFTER INSERT OR UPDATE ON inventory_items
    FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

-- ---------------------------------------------------------
-- 2. INVOICE PAYMENT STATUS — recalculated whenever an allocation changes
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_recalc_invoice() RETURNS TRIGGER AS $$
DECLARE
    v_invoice_id UUID := COALESCE(NEW.invoice_id, OLD.invoice_id);
    v_paid NUMERIC(14,2);
    v_subtotal NUMERIC(14,2);
BEGIN
    SELECT COALESCE(SUM(amount_allocated),0) INTO v_paid
    FROM payment_allocations WHERE invoice_id = v_invoice_id;

    SELECT subtotal INTO v_subtotal FROM invoices WHERE id = v_invoice_id;

    UPDATE invoices
       SET amount_paid = v_paid,
           payment_status = (CASE
               WHEN v_paid <= 0 THEN 'unpaid'
               WHEN v_paid >= v_subtotal THEN 'paid'
               ELSE 'partial'
           END)::payment_status
     WHERE id = v_invoice_id;

    -- propagate to the parent job order (1 invoice : 1 job order in MVP)
    UPDATE job_orders jo
       SET amount_paid = v_paid,
           payment_status = (CASE
               WHEN v_paid <= 0 THEN 'unpaid'
               WHEN v_paid >= jo.subtotal THEN 'paid'
               ELSE 'partial'
           END)::payment_status
      FROM invoices i
     WHERE i.id = v_invoice_id AND jo.id = i.job_order_id;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_recalc_invoice
    AFTER INSERT OR UPDATE OR DELETE ON payment_allocations
    FOR EACH ROW EXECUTE FUNCTION fn_recalc_invoice();

-- ---------------------------------------------------------
-- 3. WEIGHTED-AVERAGE COSTING — fires on every procurement
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_apply_procurement() RETURNS TRIGGER AS $$
DECLARE
    v_old_qty NUMERIC(14,3);
    v_old_cost NUMERIC(14,4);
    v_new_avg NUMERIC(14,4);
BEGIN
    SELECT quantity_on_hand, weighted_avg_cost INTO v_old_qty, v_old_cost
    FROM inventory_items WHERE id = NEW.inventory_item_id FOR UPDATE;

    v_new_avg := CASE WHEN (v_old_qty + NEW.quantity) = 0 THEN 0
                 ELSE ((v_old_qty * v_old_cost) + (NEW.quantity * NEW.unit_cost))
                      / (v_old_qty + NEW.quantity)
                 END;

    UPDATE inventory_items
       SET quantity_on_hand = v_old_qty + NEW.quantity,
           weighted_avg_cost = v_new_avg,
           updated_at = now()
     WHERE id = NEW.inventory_item_id;

    INSERT INTO inventory_movements
        (inventory_item_id, movement_type, quantity_delta, unit_cost_at_time,
         source_procurement_id, calculation_method, performed_by, remark)
    VALUES
        (NEW.inventory_item_id, 'procurement', NEW.quantity, NEW.unit_cost,
         NEW.id, 'direct_unit', NEW.recorded_by, NEW.remark);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_apply_procurement AFTER INSERT ON procurements
    FOR EACH ROW EXECUTE FUNCTION fn_apply_procurement();

-- ---------------------------------------------------------
-- 4. INVENTORY CONSUMPTION — fires when a job_order_item that names a
--    material is inserted.
--
--    DESIGN NOTE (found and fixed during validation): large-format
--    material items are NEVER auto-deducted on insert. A cashier adds
--    items first and only knows the true physical print layout — one
--    sheet per item, or several items combined onto one sheet — once
--    everything is on the Job Order. So for large_format_material the
--    ONLY deduction path is a material_layouts row (fn_apply_material_layout
--    below), created either automatically per item (default orientation)
--    or once, manually, covering several combined items (override).
--    Every other category (DI sheets, DTF, ink, roll-up stock, cut-outs)
--    has no such combining ambiguity and deducts immediately here.
-- ---------------------------------------------------------
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

CREATE TRIGGER trg_consume_inventory AFTER INSERT ON job_order_items
    FOR EACH ROW EXECUTE FUNCTION fn_consume_inventory_for_item();

-- ---------------------------------------------------------
-- 5. MATERIAL LAYOUT — the sole deduction path for large-format
--    materials. Handles both cases:
--      a) job_order_item_id IS NOT NULL -> default single-item layout
--      b) job_order_item_id IS NULL     -> manual combined-items override
--    Both cases deduct once, from this row, at this row's quantity_consumed.
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_apply_material_layout() RETURNS TRIGGER AS $$
DECLARE
    v_item inventory_items%ROWTYPE;
BEGIN
    SELECT * INTO v_item FROM inventory_items WHERE id = NEW.inventory_item_id FOR UPDATE;

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

    -- feed material cost back into the item(s) this layout covers
    IF NEW.job_order_item_id IS NOT NULL THEN
        UPDATE job_order_items
           SET material_cost = NEW.quantity_consumed * v_item.weighted_avg_cost
         WHERE id = NEW.job_order_item_id;
    ELSE
        -- Combined layout: split cost proportionally by area, but ONLY across items that
        -- haven't already been costed by a prior (e.g. default single-item) layout for this
        -- job+material — otherwise an earlier default layout's item would get double-counted
        -- into this layout's area total and both would come out wrong.
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

CREATE TRIGGER trg_apply_material_layout AFTER INSERT ON material_layouts
    FOR EACH ROW EXECUTE FUNCTION fn_apply_material_layout();

-- ---------------------------------------------------------
-- 6. JOB ORDER SUBTOTAL — kept in sync with its items
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_recalc_job_order_subtotal() RETURNS TRIGGER AS $$
DECLARE
    v_job_order_id UUID := COALESCE(NEW.job_order_id, OLD.job_order_id);
BEGIN
    UPDATE job_orders
       SET subtotal = (SELECT COALESCE(SUM(collected_amount),0)
                          FROM job_order_items WHERE job_order_id = v_job_order_id),
           updated_at = now()
     WHERE id = v_job_order_id;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_recalc_job_order_subtotal
    AFTER INSERT OR UPDATE OR DELETE ON job_order_items
    FOR EACH ROW EXECUTE FUNCTION fn_recalc_job_order_subtotal();
