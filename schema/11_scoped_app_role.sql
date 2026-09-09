-- =========================================================
-- File 11: Production DB role scoping
--
-- The `claude` role used throughout development in this sandbox is
-- effectively a superuser, which was fine for iterating quickly but is
-- the wrong role to point a deployed app at. This creates a role with
-- only the privileges the application layer (src/lib/services/*) actually
-- exercises: DML on every table (the app reads/writes rows across all of
-- them), sequence usage (for the CLM/JO/... style numbering), and EXECUTE
-- on nothing extra — no DDL, no ability to create/drop tables, no
-- superuser bit, no BYPASSRLS.
--
-- Run this against the production database AFTER 01-10 have been loaded
-- (it grants against tables that must already exist), then point
-- DATABASE_URL at this role instead of whatever loaded the schema.
-- =========================================================

-- Replace 'change-this-password' before running against a real database.
-- Replace 'your_database_name' with the actual database name — GRANT CONNECT
-- ON DATABASE requires a literal identifier, not an expression like
-- current_database() (confirmed by actually running this script — it fails
-- with a syntax error otherwise, this isn't a hypothetical caveat).
CREATE ROLE clearmission_app WITH LOGIN PASSWORD 'change-this-password';

GRANT CONNECT ON DATABASE your_database_name TO clearmission_app;
GRANT USAGE ON SCHEMA public TO clearmission_app;

-- DML only — no CREATE/DROP/ALTER. The app never migrates itself; schema
-- changes go through a human running the numbered files in this folder
-- with a real admin role, not through the running application.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO clearmission_app;

-- Every CLM/JO/, CLM/INV/, CLM/RC/, CLM/QT/, CLM/PR/ number, plus the
-- customer code sequence, is generated via nextval() in a DEFAULT clause —
-- needs USAGE, not full ownership.
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO clearmission_app;

-- Functions the triggers call (fn_audit_trigger, fn_apply_procurement, etc.)
-- run as the table owner by default in Postgres unless declared SECURITY
-- INVOKER, so this role doesn't need explicit EXECUTE grants on them for
-- the triggers to fire — but the app also calls two of them directly via
-- set_config() in withActor(), which needs no special grant (it's a
-- session-local setting, not a table).

-- Explicitly NOT granted: CREATE on the schema/database, TRUNCATE (the app
-- only ever soft-deletes), REFERENCES/TRIGGER (schema changes are a human
-- operation), and obviously not SUPERUSER/CREATEDB/CREATEROLE/BYPASSRLS.

-- Verify least-privilege after running this: connect as clearmission_app
-- and confirm both of these fail —
--   DROP TABLE job_orders;              -- should fail: permission denied
--   CREATE TABLE test (id int);          -- should fail: permission denied
-- and this succeeds —
--   SELECT * FROM job_orders LIMIT 1;    -- should work
