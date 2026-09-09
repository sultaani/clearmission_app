-- =========================================================
-- File 04: Job Orders, Invoices, Payments, Receipts, Quotations
-- =========================================================

CREATE SEQUENCE job_order_seq START 1;
CREATE SEQUENCE invoice_seq START 1;
CREATE SEQUENCE receipt_seq START 1;
CREATE SEQUENCE quotation_seq START 1;

CREATE TABLE job_orders (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_order_no        TEXT UNIQUE NOT NULL DEFAULT
                            ('CLM/JO/' || to_char(now(),'YYYYMMDD') || '/' ||
                             LPAD(nextval('job_order_seq')::TEXT, 3, '0')),
    customer_id         UUID NOT NULL REFERENCES customers(id),
    cashier_id          UUID NOT NULL REFERENCES users(id),
    subtotal            NUMERIC(14,2) NOT NULL DEFAULT 0,   -- sum of item collected_amount
    amount_paid         NUMERIC(14,2) NOT NULL DEFAULT 0,   -- denormalized, kept in sync by trigger
    outstanding_balance NUMERIC(14,2) GENERATED ALWAYS AS (subtotal - amount_paid) STORED,
    payment_status      payment_status NOT NULL DEFAULT 'unpaid',
    remark              TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ,
    deleted_by          UUID REFERENCES users(id)
);

ALTER TABLE material_layouts
    ADD CONSTRAINT fk_material_layouts_job_order
    FOREIGN KEY (job_order_id) REFERENCES job_orders(id);

ALTER TABLE inventory_movements
    ADD CONSTRAINT fk_inv_movements_job_order
    FOREIGN KEY (source_job_order_id) REFERENCES job_orders(id);

CREATE TABLE job_order_items (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_order_id        UUID NOT NULL REFERENCES job_orders(id),
    product_service_id  UUID REFERENCES products_services(id),
    inventory_item_id   UUID REFERENCES inventory_items(id),  -- material consumed, if any
    category             TEXT NOT NULL,
    description          TEXT,
    width                NUMERIC(10,2),
    height               NUMERIC(10,2),
    -- total physical area for this line = width * height * quantity (PRD #18: "Width x Height x Rate x Quantity")
    -- i.e. quantity here means "N pieces at this size", not "N sqft" — matches the PRD's own example
    area_sqft            NUMERIC(12,2) GENERATED ALWAYS AS (
                              CASE WHEN width IS NOT NULL AND height IS NOT NULL
                                   THEN width * height * quantity ELSE NULL END
                          ) STORED,
    quantity             NUMERIC(14,3) NOT NULL DEFAULT 1,
    unit                 unit_type,
    standard_rate        NUMERIC(14,2) NOT NULL,       -- system default rate at time of sale
    calculated_amount    NUMERIC(14,2) NOT NULL,       -- standard_rate * qty (or area) — system's number
    collected_amount     NUMERIC(14,2) NOT NULL,       -- what the cashier actually entered
    effective_rate       NUMERIC(14,4) GENERATED ALWAYS AS (
                              collected_amount / NULLIF(quantity,0)
                          ) STORED,
    material_cost        NUMERIC(14,2) NOT NULL DEFAULT 0,   -- filled from weighted_avg_cost at consumption
    profit_contribution  NUMERIC(14,2) GENERATED ALWAYS AS (collected_amount - material_cost) STORED,
    remark                TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_job_order_items_job ON job_order_items(job_order_id);

ALTER TABLE material_layouts
    ADD CONSTRAINT fk_material_layouts_job_order_item
    FOREIGN KEY (job_order_item_id) REFERENCES job_order_items(id);

-- One invoice per job order (MVP simplification, matches PRD's "generated from Job Orders")
CREATE TABLE invoices (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_no      TEXT UNIQUE NOT NULL DEFAULT
                        ('CLM/INV/' || to_char(now(),'YYYYMMDD') || '/' ||
                         LPAD(nextval('invoice_seq')::TEXT, 3, '0')),
    job_order_id    UUID NOT NULL REFERENCES job_orders(id),
    customer_id     UUID NOT NULL REFERENCES customers(id),
    subtotal        NUMERIC(14,2) NOT NULL,
    amount_paid     NUMERIC(14,2) NOT NULL DEFAULT 0,
    outstanding     NUMERIC(14,2) GENERATED ALWAYS AS (subtotal - amount_paid) STORED,
    payment_status  payment_status NOT NULL DEFAULT 'unpaid',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);

CREATE TABLE payments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id     UUID NOT NULL REFERENCES customers(id),
    amount          NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    method          payment_method NOT NULL,
    recorded_by     UUID NOT NULL REFERENCES users(id),
    cashier_session_id UUID,   -- FK added in 06_sessions.sql
    remark          TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ,
    deleted_by      UUID REFERENCES users(id)
);

-- One payment can settle many invoices; one invoice can receive many payments.
CREATE TABLE payment_allocations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id      UUID NOT NULL REFERENCES payments(id),
    invoice_id      UUID NOT NULL REFERENCES invoices(id),
    amount_allocated NUMERIC(14,2) NOT NULL CHECK (amount_allocated > 0),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (payment_id, invoice_id)
);

CREATE TABLE receipts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_no      TEXT UNIQUE NOT NULL DEFAULT
                        ('CLM/RC/' || to_char(now(),'YYYYMMDD') || '/' ||
                         LPAD(nextval('receipt_seq')::TEXT, 3, '0')),
    payment_id      UUID NOT NULL REFERENCES payments(id),
    customer_id     UUID NOT NULL REFERENCES customers(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE quotations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quotation_no    TEXT UNIQUE NOT NULL DEFAULT
                        ('CLM/QT/' || to_char(now(),'YYYYMMDD') || '/' ||
                         LPAD(nextval('quotation_seq')::TEXT, 3, '0')),
    customer_id     UUID NOT NULL REFERENCES customers(id),
    items           JSONB NOT NULL,      -- lightweight: quotations don't need full relational item tracking
    total            NUMERIC(14,2) NOT NULL,
    valid_until      DATE,
    remark           TEXT,
    created_by       UUID NOT NULL REFERENCES users(id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at       TIMESTAMPTZ
);

CREATE INDEX idx_invoices_customer ON invoices(customer_id);
CREATE INDEX idx_payments_customer ON payments(customer_id);
CREATE INDEX idx_payment_allocations_invoice ON payment_allocations(invoice_id);
