-- =========================================================
-- File 02: Inventory — items, weighted-average costing, procurement,
--          consumption movements, large-format material layouts
-- =========================================================

CREATE TYPE inventory_category AS ENUM (
    'di_material', 'large_format_material', 'dtf_consumable', 'ink', 'branding_stock', 'other'
);

CREATE TYPE movement_type AS ENUM (
    'procurement', 'consumption', 'sale_deduction', 'adjustment', 'damage', 'carry_out'
);

-- Master item: one row per trackable material/product (e.g. "Art Card A3", "SAV", "DTF Powder")
CREATE TABLE inventory_items (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                TEXT NOT NULL,
    category            inventory_category NOT NULL,
    unit                unit_type NOT NULL,
    roll_width_ft       NUMERIC(6,2),              -- only for large-format rolls
    quantity_on_hand    NUMERIC(14,3) NOT NULL DEFAULT 0,
    weighted_avg_cost   NUMERIC(14,4) NOT NULL DEFAULT 0,   -- per unit
    min_stock_threshold NUMERIC(14,3) NOT NULL DEFAULT 0,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ,
    CONSTRAINT chk_qty_nonneg CHECK (quantity_on_hand >= 0)
);

CREATE SEQUENCE procurement_seq START 1;

-- Procurement = a purchase event. Each one is also a costing "batch" input.
CREATE TABLE procurements (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    procurement_no  TEXT UNIQUE NOT NULL DEFAULT
                        ('CLM/PR/' || to_char(now(),'YYYYMMDD') || '/' ||
                         LPAD(nextval('procurement_seq')::TEXT, 3, '0')),
    inventory_item_id UUID NOT NULL REFERENCES inventory_items(id),
    quantity        NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
    total_cost      NUMERIC(14,2) NOT NULL CHECK (total_cost >= 0),
    unit_cost       NUMERIC(14,4) GENERATED ALWAYS AS (total_cost / NULLIF(quantity,0)) STORED,
    recorded_by     UUID NOT NULL REFERENCES users(id),
    remark          TEXT,
    procured_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Large-format "combine several job items onto one physical sheet" override.
-- job_order_id is added via FK once job_orders exists (file 03) — placeholder table created here,
-- constraint added later to avoid circular dependency at create time.
-- Large-format consumption ALWAYS goes through this table — never deducted
-- straight off a job_order_item insert. That's deliberate: the cashier adds
-- items first and only knows the true physical layout (one sheet per item,
-- or several items combined onto one sheet) once all items are in. A single
-- row here can represent either a default single-item layout or a combined
-- multi-item override; job_order_item_id is set for the single-item case
-- and left NULL for combined layouts covering several items.
CREATE TABLE material_layouts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_order_id        UUID NOT NULL,   -- FK added in 03_job_orders.sql
    job_order_item_id   UUID,            -- FK added in 03_job_orders.sql; NULL = combined layout
    inventory_item_id   UUID NOT NULL REFERENCES inventory_items(id),
    specified_length    NUMERIC(10,2) NOT NULL,   -- e.g. 10 ft actual layout length
    specified_width_ft  NUMERIC(6,2),
    quantity_consumed   NUMERIC(14,3) NOT NULL,   -- resolved physical consumption in item's unit
    layout_method       TEXT NOT NULL DEFAULT 'default_orientation'
                            CHECK (layout_method IN ('default_orientation','manual_layout')),
    remark              TEXT,
    created_by          UUID NOT NULL REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Every inventory change (procurement in, consumption out, adjustment, damage) is one immutable row.
CREATE TABLE inventory_movements (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inventory_item_id   UUID NOT NULL REFERENCES inventory_items(id),
    movement_type       movement_type NOT NULL,
    quantity_delta      NUMERIC(14,3) NOT NULL,     -- positive = in, negative = out
    unit_cost_at_time   NUMERIC(14,4) NOT NULL,      -- weighted avg cost at moment of movement
    source_job_order_id UUID,                        -- FK added in 03_job_orders.sql (nullable)
    source_procurement_id UUID REFERENCES procurements(id),
    material_layout_id  UUID REFERENCES material_layouts(id),
    calculation_method  TEXT,                        -- 'default_orientation' | 'manual_layout' | 'direct_unit'
    performed_by        UUID NOT NULL REFERENCES users(id),
    remark               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_inv_movements_item ON inventory_movements(inventory_item_id);
CREATE INDEX idx_inv_movements_job ON inventory_movements(source_job_order_id);
