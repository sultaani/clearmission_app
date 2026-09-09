-- =========================================================
-- File 05: Expenses, Cashier Sessions, Audit Log
-- =========================================================

CREATE TABLE expense_categories (
    id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name    TEXT UNIQUE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE expenses (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id     UUID NOT NULL REFERENCES expense_categories(id),
    description     TEXT,
    amount          NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    payment_method  payment_method NOT NULL,
    recorded_by     UUID NOT NULL REFERENCES users(id),
    cashier_session_id UUID,   -- FK added below
    remark          TEXT,
    incurred_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ,
    deleted_by      UUID REFERENCES users(id)
);

CREATE TABLE cashier_sessions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cashier_id          UUID NOT NULL REFERENCES users(id),
    opened_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_at           TIMESTAMPTZ,
    expected_cash       NUMERIC(14,2),
    expected_transfer   NUMERIC(14,2),
    expected_pos        NUMERIC(14,2),
    actual_cash         NUMERIC(14,2),
    actual_transfer     NUMERIC(14,2),
    actual_pos          NUMERIC(14,2),
    variance            NUMERIC(14,2) GENERATED ALWAYS AS (
                            (COALESCE(actual_cash,0)+COALESCE(actual_transfer,0)+COALESCE(actual_pos,0)) -
                            (COALESCE(expected_cash,0)+COALESCE(expected_transfer,0)+COALESCE(expected_pos,0))
                         ) STORED,
    status              TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed'))
);

ALTER TABLE payments
    ADD CONSTRAINT fk_payments_session FOREIGN KEY (cashier_session_id) REFERENCES cashier_sessions(id);
ALTER TABLE expenses
    ADD CONSTRAINT fk_expenses_session FOREIGN KEY (cashier_session_id) REFERENCES cashier_sessions(id);

-- ---------------------------------------------------------
-- AUDIT LOG — append-only, populated by generic triggers (see 06_functions_triggers.sql)
-- ---------------------------------------------------------
CREATE TABLE audit_logs (
    id              BIGSERIAL PRIMARY KEY,
    actor_id        UUID REFERENCES users(id),
    actor_role      user_role,
    action          TEXT NOT NULL,     -- 'insert' | 'update' | 'soft_delete' | 'restore'
    module          TEXT NOT NULL,     -- table name
    record_id       UUID NOT NULL,
    previous_data   JSONB,
    new_data        JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_module_record ON audit_logs(module, record_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at);
