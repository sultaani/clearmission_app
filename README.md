# Customer merge + Top customers

## Apply
1. Copy the files in this zip into your project, keeping the folder paths.
2. Run `schema/15_customer_merge_rankings.sql` once in the Neon SQL editor (safe to re-run). Do it AFTER the data import so "Clearmission" is flagged internal.
3. Redeploy. No new packages needed.

## Heads-up
- `app/src/app/customers/page.tsx` is the only EXISTING file replaced. If you changed that page since you sent the zip, merge by hand.
- Everything here is Admin-only. Cashiers see the Customers page exactly as before.

## What you get
- Customers > Select to merge: tick duplicates (selection survives searching) > Merge: pick the name to keep, or type a new one. All orders, invoices, payments, receipts and quotations move over; the old records are archived.
- Find duplicates: suggests likely same-person names for you to review. Nothing merges automatically.
- Merge history: undo any merge.
- Customers > Top customers: customer of the year and top customer per month. Rank by job orders or revenue; ties shown. Walk-in and Clearmission's own jobs are left out unless you tick the box.
- The dashboard "Customer of the Month" tile follows the same rules.

## To exclude a junk customer (e.g. "A...") from rankings
UPDATE customers SET is_internal = TRUE WHERE name = 'A...';

## Tests
DATABASE_URL=... SESSION_SECRET=... npx tsx tests/customerFeatures.test.ts
