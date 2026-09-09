-- =========================================================
-- File 09: Offline sync support (Phase 7)
-- Client-generated idempotency keys so a job order or payment created
-- offline and retried on reconnect never gets double-applied, plus a
-- table to record conflicts the sync engine couldn't auto-resolve.
-- =========================================================

ALTER TABLE job_orders ADD COLUMN client_request_id UUID UNIQUE;
ALTER TABLE payments ADD COLUMN client_request_id UUID UNIQUE;
ALTER TABLE expenses ADD COLUMN client_request_id UUID UNIQUE;

CREATE TABLE sync_conflicts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_request_id   UUID NOT NULL,
    entity_type         TEXT NOT NULL,        -- 'job_order' | 'payment' | 'expense'
    reason              TEXT NOT NULL,        -- human-readable: why it couldn't auto-apply
    payload             JSONB NOT NULL,       -- the offline-queued operation, preserved for review
    cashier_id          UUID NOT NULL REFERENCES users(id),
    resolved            BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_by         UUID REFERENCES users(id),
    resolved_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sync_conflicts_unresolved ON sync_conflicts(resolved) WHERE resolved = FALSE;
