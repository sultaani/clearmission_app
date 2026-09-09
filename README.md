# Clearmission Bookkeeping, Accounting & Business Operations System
### Complete build: Phase 0 (schema) through Phase 8 (finalization)

This is everything built so far for Clearmission's internal Job Order /
bookkeeping platform, in one package: the validated Postgres schema, and the
Next.js/TypeScript API application built on top of it. **No UI exists yet**
— every phase here was validated at the API/service/database level, not
through a browser. That's flagged explicitly below, not glossed over.

```
clearmission-bookkeeping-system/
├── schema/            Phase 0 — Postgres schema, load in numeric order
├── schema-tests/       Phase 0 — raw SQL test suite (run after schema/)
└── app/                Phases 1-8 — the Next.js API application
    ├── src/lib/services/   business logic, one file per module
    ├── src/app/api/        thin HTTP route wrappers over the services
    ├── src/lib/offlineQueue.ts   browser-side IndexedDB queue (Phase 7)
    └── tests/               5 executable test suites, 58 assertions total
```

## Setup, start to finish
```bash
# 1. Schema
psql -d your_db -f schema/01_core.sql
psql -d your_db -f schema/02_inventory.sql
psql -d your_db -f schema/03_products_pricing.sql
psql -d your_db -f schema/04_transactions.sql
psql -d your_db -f schema/05_expenses_sessions_audit.sql
psql -d your_db -f schema/06_functions_triggers.sql
psql -d your_db -f schema/07_views.sql
psql -d your_db -f schema/08_seed.sql
psql -d your_db -f schema/09_offline_sync.sql
psql -d your_db -f schema/10_phase6_audit_quotations.sql

# 2. App
cd app
npm install
cp .env.local.example .env.local   # set DATABASE_URL to your_db above
npm run dev                        # or: npx next build && npx next start
```

| Suite | Phase | Assertions |
|---|---|---|
| `schema-tests/*.sql` | 0 | transaction loop, inventory engine, audit/debt/analytics (run via `psql -f`) |
| `app/tests/integration.test.ts` | 1-5 | 32 — auth, POS, inventory, payments, expenses, sessions, dashboard, reports, debts, audit |
| `app/tests/deletedRecords.test.ts` | 6 | 5 — cross-entity soft-delete/restore, audit capture |
| `app/tests/offlineQueue.test.ts` | 7 | 6 — client IndexedDB queue against `fake-indexeddb`, mocked sync |
| `app/tests/offlineSync.test.ts` | 7 | 6 — server idempotency (double-submit → 1 record) and conflict detection (Admin-deleted customer → sync rejected, logged) |
| `app/tests/documents.test.ts` | 8 | 9 — real PDF bytes, parsed back with `pdf-parse` and checked for the actual invoice number/customer/amount, not just byte-length |

Plus: `next build` compiles clean (0 TypeScript errors, all 30 routes), and
a live `curl` smoke test against `next start` confirmed 401/403 role
enforcement and a full customer→job-order→invoice round trip over real
HTTP.

To rerun everything:
```bash
cd app
DATABASE_URL=... SESSION_SECRET=... npx tsx tests/integration.test.ts
npx tsx tests/deletedRecords.test.ts   # (with DATABASE_URL/SESSION_SECRET)
npx tsx tests/offlineQueue.test.ts     # no DB needed — pure client-side
npx tsx tests/offlineSync.test.ts      # (with DATABASE_URL/SESSION_SECRET)
npx tsx tests/documents.test.ts        # (with DATABASE_URL/SESSION_SECRET)
```