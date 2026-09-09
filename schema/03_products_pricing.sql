-- =========================================================
-- File 03: Products / Services / Pricing configuration
-- =========================================================

CREATE TYPE pricing_model AS ENUM (
    'flat_per_unit',      -- e.g. DI sheet price, DTF size price, per-yard cutouts
    'area_based',         -- large format: width * height * rate
    'inventory_tracked'   -- roll-up banner stands: decrement stock on sale
);

CREATE TABLE products_services (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                TEXT NOT NULL,
    category            TEXT NOT NULL,     -- DI Printing, DTF, Large Format, Branding, Ink, Cut-outs, Roll-up, Other
    kind                TEXT NOT NULL CHECK (kind IN ('product','service')),
    pricing_model       pricing_model NOT NULL,
    unit                unit_type,
    default_price       NUMERIC(14,2),           -- per-unit or per-sqft rate depending on pricing_model
    inventory_item_id   UUID REFERENCES inventory_items(id),  -- linked stock, if inventory_tracked
    requires_dimensions BOOLEAN NOT NULL DEFAULT FALSE,        -- true for area_based
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ
);

-- Pricing history so price changes are auditable and standard rate at time of sale is reconstructable
CREATE TABLE pricing_rules (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_service_id  UUID NOT NULL REFERENCES products_services(id),
    rate                NUMERIC(14,2) NOT NULL,
    effective_from      TIMESTAMPTZ NOT NULL DEFAULT now(),
    effective_to        TIMESTAMPTZ,             -- null = current
    set_by              UUID NOT NULL REFERENCES users(id)
);

CREATE INDEX idx_pricing_rules_current
    ON pricing_rules(product_service_id) WHERE effective_to IS NULL;
