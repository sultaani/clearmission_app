-- =========================================================
-- CLEARMISSION BOOKKEEPING SYSTEM — Phase 0 Schema
-- File 01: extensions, users/roles, customers
-- =========================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pg_trgm;    -- fuzzy customer/global search

CREATE TYPE user_role AS ENUM ('admin', 'cashier');
CREATE TYPE payment_method AS ENUM ('cash', 'bank_transfer', 'pos', 'other');
CREATE TYPE payment_status AS ENUM ('unpaid', 'partial', 'paid');
CREATE TYPE unit_type AS ENUM ('sheet', 'metre', 'piece', 'yard', 'bottle', 'litre', 'other');

-- ---------------------------------------------------------
-- USERS  (exactly two accounts per PRD: admin, cashier — schema allows more)
-- ---------------------------------------------------------
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username        TEXT UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,
    role            user_role NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------
-- CUSTOMERS
-- ---------------------------------------------------------
CREATE SEQUENCE customer_seq START 1;

CREATE TABLE customers (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_code       TEXT UNIQUE NOT NULL DEFAULT
                            ('CUS-' || LPAD(nextval('customer_seq')::TEXT, 6, '0')),
    name                TEXT NOT NULL,
    phone               TEXT,
    address             TEXT,
    is_walk_in          BOOLEAN NOT NULL DEFAULT FALSE,
    status              TEXT NOT NULL DEFAULT 'active',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ,
    deleted_by          UUID REFERENCES users(id)
);

CREATE INDEX idx_customers_phone ON customers(phone) WHERE phone IS NOT NULL;
CREATE INDEX idx_customers_name_trgm ON customers USING gin (name gin_trgm_ops);
