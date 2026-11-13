import { config } from 'dotenv';
config({ path: '.env.local' });
import { pool } from '../src/lib/db';
import { verifyLogin } from '../src/lib/auth';
import { createCustomer, listCustomers } from '../src/lib/services/customers';
import { mergeCustomers, undoMerge, listMerges, suggestDuplicateGroups } from '../src/lib/services/customerMerge';
import { getCustomerRankings } from '../src/lib/services/customerRankings';

let passed = 0, failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) { passed++; console.log(`  OK: ${msg}`); }
  else { failed++; console.error(`  FAIL: ${msg}`); }
}
async function rejects(fn: () => Promise<unknown>): Promise<string | null> {
  try { await fn(); return null; } catch (e) { return e instanceof Error ? e.message : String(e); }
}

const TEST_YEAR = 2031; // far from real data, so ranking assertions only see rows made here
const TEST_NAME_LIKE = ['CF Test %', 'Quillfeather%', 'Walk-In Customer Quillfeather%', 'Zyxwvut%'];

/** Removes anything a previous run of this file left behind, so it can be re-run safely. */
async function cleanup() {
  const ids = (await pool.query(
    `SELECT id FROM customers WHERE name LIKE ANY($1::text[])`, [TEST_NAME_LIKE]
  )).rows.map((r) => r.id);
  await pool.query(`DELETE FROM customer_merges WHERE survivor_id = ANY($1) OR source_id = ANY($1)`, [ids]);
  await pool.query(`DELETE FROM receipts WHERE customer_id = ANY($1)`, [ids]);
  await pool.query(`DELETE FROM payments WHERE customer_id = ANY($1)`, [ids]);
  await pool.query(`DELETE FROM invoices WHERE customer_id = ANY($1)`, [ids]);
  await pool.query(`DELETE FROM quotations WHERE customer_id = ANY($1)`, [ids]);
  await pool.query(
    `DELETE FROM job_orders WHERE customer_id = ANY($1) OR extract(year FROM created_at) = $2`,
    [ids, TEST_YEAR]
  );
  await pool.query(`DELETE FROM customers WHERE id = ANY($1)`, [ids]);
}

async function addOrder(customerId: string, cashierId: string, amount: number, at: string, deleted = false) {
  const { rows } = await pool.query(
    `INSERT INTO job_orders (customer_id, cashier_id, subtotal, amount_paid, payment_status, created_at, deleted_at)
     VALUES ($1,$2,$3,$3,'paid',$4::timestamptz, ${deleted ? 'now()' : 'NULL'}) RETURNING id`,
    [customerId, cashierId, amount, at]
  );
  return rows[0].id as string;
}

async function main() {
  const admin = (await verifyLogin('admin', 'admin123'))!;
  await cleanup();

  console.log('=== Customer merge ===');
  const A = await createCustomer({ name: 'CF Test Ade' });
  const B = await createCustomer({ name: 'CF Test Adedayo', phone: '08011112222' });
  const C = await createCustomer({ name: 'CF Test A. Ade', address: '12 Market Road' });

  const joB1 = await addOrder(B.id, admin.id, 1000, '2031-05-01 12:00:00+01');
  await addOrder(B.id, admin.id, 5000, '2031-05-02 12:00:00+01', true); // already deleted
  await addOrder(C.id, admin.id, 2000, '2031-05-03 12:00:00+01');
  await addOrder(A.id, admin.id, 700, '2031-05-04 12:00:00+01');
  const inv = (await pool.query(
    `INSERT INTO invoices (job_order_id, customer_id, subtotal) VALUES ($1,$2,1000) RETURNING id`, [joB1, B.id])).rows[0];
  const pay = (await pool.query(
    `INSERT INTO payments (customer_id, amount, method, recorded_by) VALUES ($1,400,'cash',$2) RETURNING id`, [B.id, admin.id])).rows[0];
  await pool.query(`INSERT INTO receipts (payment_id, customer_id) VALUES ($1,$2)`, [pay.id, B.id]);
  await pool.query(
    `INSERT INTO quotations (customer_id, items, total, created_by) VALUES ($1,'[]'::jsonb,900,$2)`, [C.id, admin.id]);

  const before = (await pool.query(`SELECT count(*) FROM v_customer_stats WHERE customer_id = ANY($1)`, [[A.id, B.id, C.id]])).rows[0].count;
  assert(Number(before) === 3, 'three separate customers exist before the merge');

  const result = await mergeCustomers(
    { survivorId: A.id, sourceIds: [B.id, C.id], newName: 'CF Test Adedayo Ade' }, admin.id);
  assert(result.survivor.name === 'CF Test Adedayo Ade', 'survivor takes the new name');
  assert(result.survivor.phone === '08011112222', 'missing phone is filled in from a merged record');
  assert(result.survivor.address === '12 Market Road', 'missing address is filled in from a merged record');
  assert(result.merged.length === 2, 'both duplicates reported as merged');

  const owners = async (table: string) =>
    (await pool.query(`SELECT DISTINCT customer_id FROM ${table} WHERE customer_id = ANY($1)`, [[A.id, B.id, C.id]])).rows.map((r) => r.customer_id);
  for (const t of ['job_orders', 'invoices', 'payments', 'receipts', 'quotations']) {
    const o = await owners(t);
    assert(o.length === 1 && o[0] === A.id, `all ${t} now belong to the kept customer`);
  }
  const jobCount = (await pool.query(`SELECT count(*) FROM job_orders WHERE customer_id = $1`, [A.id])).rows[0].count;
  assert(Number(jobCount) === 4, 'soft-deleted job orders moved too (4 total including the deleted one)');

  const stats = (await pool.query(`SELECT total_job_orders, total_revenue FROM v_customer_stats WHERE customer_id = $1`, [A.id])).rows[0];
  assert(Number(stats.total_job_orders) === 3 && Number(stats.total_revenue) === 3700,
    'kept customer stats combine active orders only (3 orders, N3,700)');

  const active = await listCustomers('CF Test');
  assert(active.length === 1 && active[0].customer_id === A.id, 'duplicates no longer appear in the customer list');
  const archived = (await pool.query(`SELECT count(*) FROM customers WHERE id = ANY($1) AND deleted_at IS NOT NULL`, [[B.id, C.id]])).rows[0].count;
  assert(Number(archived) === 2, 'duplicates are archived (soft-deleted), not destroyed');
  const audit = (await pool.query(
    `SELECT action FROM audit_logs WHERE module='customers' AND record_id = $1 ORDER BY created_at DESC LIMIT 1`, [B.id])).rows[0];
  assert(audit?.action === 'soft_delete', 'archiving a duplicate is captured in the audit log');
  const jobAudit = (await pool.query(
    `SELECT count(*) FROM audit_logs WHERE module='job_orders' AND record_id = $1 AND action='update'`, [joB1])).rows[0].count;
  assert(Number(jobAudit) >= 1, 'moving a job order to the kept customer is audit-logged');

  console.log('=== Merge validation ===');
  const walkIn = (await pool.query(`SELECT id FROM customers WHERE is_walk_in LIMIT 1`)).rows[0];
  const D = await createCustomer({ name: 'CF Test Dee' });
  assert(!!(await rejects(() => mergeCustomers({ survivorId: A.id, sourceIds: [walkIn.id] }, admin.id))),
    'WALK-IN CUSTOMER cannot be merged away');
  assert(!!(await rejects(() => mergeCustomers({ survivorId: walkIn.id, sourceIds: [D.id] }, admin.id))),
    'nothing can be merged into WALK-IN CUSTOMER');
  assert(!!(await rejects(() => mergeCustomers({ survivorId: A.id, sourceIds: [] }, admin.id))), 'needs at least one other customer');
  assert(!!(await rejects(() => mergeCustomers({ survivorId: A.id, sourceIds: [A.id] }, admin.id))), 'cannot merge a customer into itself');
  assert(!!(await rejects(() => mergeCustomers({ survivorId: A.id, sourceIds: [B.id] }, admin.id))), 'an already-merged (archived) customer is rejected');
  assert(!!(await rejects(() => mergeCustomers({ survivorId: A.id, sourceIds: [D.id], newName: '   ' }, admin.id))), 'blank new name is rejected');
  const ghost = '00000000-0000-4000-8000-000000000000';
  const dJob = await addOrder(D.id, admin.id, 300, '2031-05-05 12:00:00+01');
  const msg = await rejects(() => mergeCustomers({ survivorId: A.id, sourceIds: [D.id, ghost] }, admin.id));
  assert(!!msg, 'a merge that includes an unknown customer fails');
  const dStill = (await pool.query(`SELECT customer_id, (SELECT deleted_at FROM customers WHERE id=$2) AS del FROM job_orders WHERE id=$1`, [dJob, D.id])).rows[0];
  assert(dStill.customer_id === D.id && dStill.del === null, 'a failed merge changes nothing (all-or-nothing)');

  console.log('=== Undo merge ===');
  const merges = await listMerges();
  const mB = merges.find((m) => m.source_id === B.id)!;
  const mC = merges.find((m) => m.source_id === C.id)!;
  assert(!!mB && !!mC && Number(mB.records_moved) === 5, 'merge history lists each merge with its moved-record count (B moved 5)');

  const undoB = await undoMerge(mB.id, admin.id);
  assert(undoB.recordsRestored === 5, 'undo moves exactly the merged records back');
  const bBack = (await pool.query(`SELECT count(*) FROM job_orders WHERE customer_id = $1`, [B.id])).rows[0].count;
  assert(Number(bBack) === 2, "B's two job orders (incl. the deleted one) are back with B");
  const bActive = (await pool.query(`SELECT deleted_at FROM customers WHERE id = $1`, [B.id])).rows[0];
  assert(bActive.deleted_at === null, 'archived customer is active again after undo');
  const nameMid = (await pool.query(`SELECT name FROM customers WHERE id = $1`, [A.id])).rows[0].name;
  assert(nameMid === 'CF Test Adedayo Ade', 'kept customer keeps its new name while another merge in the batch is still active');
  assert(!!(await rejects(() => undoMerge(mB.id, admin.id))), 'a merge cannot be undone twice');

  await undoMerge(mC.id, admin.id);
  const nameEnd = (await pool.query(`SELECT name FROM customers WHERE id = $1`, [A.id])).rows[0].name;
  assert(nameEnd === 'CF Test Ade', 'old name returns once the last merge in the batch is undone');
  const aJobs = (await pool.query(`SELECT count(*) FROM job_orders WHERE customer_id = $1`, [A.id])).rows[0].count;
  assert(Number(aJobs) === 1, 'kept customer is back to only its own order');

  console.log('=== Duplicate suggestions ===');
  const Q1 = await createCustomer({ name: 'Quillfeather Mbanefo' });
  const Q2 = await createCustomer({ name: 'Quillfeather Mbanefo Jr' });
  const Q3 = await createCustomer({ name: 'Walk-In Customer Quillfeather Mbanefo' });
  const Z = await createCustomer({ name: 'Zyxwvut Plomp' });
  const groups = await suggestDuplicateGroups(0.55, 1000);
  const g = groups.find((x) => x.members.some((m) => m.customer_id === Q1.id));
  assert(!!g && [Q1.id, Q2.id, Q3.id].every((id) => g!.members.some((m) => m.customer_id === id)),
    'similar names (including a "Walk-In Customer <name>" label) are grouped for review');
  assert(!groups.some((x) => x.members.some((m) => m.customer_id === Z.id)), 'an unrelated name is not suggested');
  assert(!groups.some((x) => x.members.some((m) => m.customer_id === walkIn.id)), 'the WALK-IN CUSTOMER record is never suggested');

  console.log('=== Rankings ===');
  const X = await createCustomer({ name: 'CF Test Rank X' });
  const Y = await createCustomer({ name: 'CF Test Rank Y' });
  const Zr = await createCustomer({ name: 'CF Test Rank Z' });
  const Internal = await createCustomer({ name: 'CF Test Internal Co' });
  await pool.query(`UPDATE customers SET is_internal = TRUE WHERE id = $1`, [Internal.id]);
  // clear the merge-test orders (all dated 2031) so only the data below counts
  await pool.query(`DELETE FROM receipts WHERE customer_id = ANY($1)`, [[A.id, B.id, C.id, D.id]]);
  await pool.query(`DELETE FROM payments WHERE customer_id = ANY($1)`, [[A.id, B.id, C.id, D.id]]);
  await pool.query(`DELETE FROM invoices WHERE customer_id = ANY($1)`, [[A.id, B.id, C.id, D.id]]);
  await pool.query(`DELETE FROM job_orders WHERE extract(year FROM created_at) = $1`, [TEST_YEAR]);

  for (const d of ['10', '15', '20']) await addOrder(X.id, admin.id, 1000, `2031-01-${d} 12:00:00+01`);
  await addOrder(Y.id, admin.id, 4500, '2031-01-12 12:00:00+01');
  await addOrder(Y.id, admin.id, 4500, '2031-01-18 12:00:00+01');
  await addOrder(Y.id, admin.id, 50000, '2031-01-05 12:00:00+01', true); // deleted: must not count
  await addOrder(X.id, admin.id, 500, '2031-02-10 12:00:00+01');
  await addOrder(Y.id, admin.id, 500, '2031-02-11 12:00:00+01');
  await addOrder(Zr.id, admin.id, 100, '2031-01-31 23:30:00+00'); // = 1 Feb 00:30 in Lagos
  for (let i = 0; i < 5; i++) await addOrder(walkIn.id, admin.id, 100, `2031-03-0${i + 1} 12:00:00+01`);
  for (let i = 0; i < 4; i++) await addOrder(Internal.id, admin.id, 200, `2031-03-1${i} 12:00:00+01`);

  const byOrders = await getCustomerRankings({ year: TEST_YEAR, metric: 'orders', includeExcluded: false });
  const jan = byOrders.months[0], feb = byOrders.months[1], mar = byOrders.months[2], apr = byOrders.months[3];
  assert(byOrders.months.length === 12 && byOrders.months[0].month === '2031-01', 'always returns all 12 months in order');
  assert(jan.top[0].name === 'CF Test Rank X' && jan.top[0].job_orders === 3, 'January winner by orders: X (3 orders)');
  assert(jan.top[1].name === 'CF Test Rank Y' && jan.top[1].revenue === 9000, "deleted job order is excluded from Y's January total");
  assert(!jan.top.some((t) => t.name === 'CF Test Rank Z'), 'order at 00:30 on 1 Feb (Lagos) is not counted in January');
  assert(feb.tied && feb.top.filter((t) => t.rank === 1).length === 2, 'February is an exact tie and is flagged as tied');
  assert(feb.top.some((t) => t.name === 'CF Test Rank Z'), 'order at 00:30 on 1 Feb (Lagos) counts in February');
  assert(mar.top.length === 0, 'March has only walk-in/internal sales, so no winner by default');
  assert(apr.top.length === 0 && !apr.tied, 'a month with no sales has an empty ranking');

  const byRevenue = await getCustomerRankings({ year: TEST_YEAR, metric: 'revenue', includeExcluded: false });
  assert(byRevenue.months[0].top[0].name === 'CF Test Rank Y', 'January winner by revenue: Y (N9,000 beats X N3,000)');
  assert(byOrders.customerOfTheYear.length === 1 && byOrders.customerOfTheYear[0].name === 'CF Test Rank X',
    'customer of the year by orders: X (4 orders)');
  assert(byRevenue.customerOfTheYear[0].name === 'CF Test Rank Y' && byRevenue.customerOfTheYear[0].revenue === 9500,
    'customer of the year by revenue: Y (N9,500)');
  assert(byOrders.totals.orders === 8 && byOrders.totals.revenue === 13100, 'year totals exclude walk-in, internal and deleted orders');

  const withAll = await getCustomerRankings({ year: TEST_YEAR, metric: 'orders', includeExcluded: true });
  assert(withAll.months[2].top[0].name !== undefined && withAll.months[2].top[0].job_orders === 5,
    'with exclusions switched off, walk-in shows up as March leader (5 orders)');
  assert(byOrders.availableYears.includes(TEST_YEAR), 'lists the years that have data');

  const cotm = (await pool.query(`SELECT name FROM v_customer_of_month WHERE month = '2031-01-01'`)).rows;
  assert(cotm.length === 1 && cotm[0].name === 'CF Test Rank X', 'dashboard Customer of the Month view uses the same rules');
  const cotmMar = (await pool.query(`SELECT name FROM v_customer_of_month WHERE month = '2031-03-01'`)).rows;
  assert(cotmMar.length === 0, 'dashboard view ignores walk-in and internal customers');

  await cleanup();
  console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
  await pool.end();
  process.exit(failed ? 1 : 0);
}
main().catch(async (e) => { console.error(e); await pool.end(); process.exit(1); });
