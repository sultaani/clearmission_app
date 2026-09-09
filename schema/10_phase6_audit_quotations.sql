-- =========================================================
-- File 10: Phase 6 — Controls
-- Quotations were missing from the audit trigger set in 06_functions_triggers.sql
-- (an oversight found while building the deleted-records feature: PRD #75/76
-- says "every edit and deletion is logged" with no module carve-out).
-- =========================================================
CREATE TRIGGER trg_audit_quotations AFTER INSERT OR UPDATE ON quotations
    FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();
