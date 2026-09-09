import { config } from 'dotenv';
config({ path: '.env.local' });
import { pool } from '../src/lib/db';
import { verifyLogin } from '../src/lib/auth';
import { createCustomer, listCustomers } from '../src/lib/services/customers';
import { softDelete, restore, listDeletedRecords } from '../src/lib/services/deletedRecords';

let passed = 0, failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) { passed++; console.log(`  OK: ${msg}`); }
  else { failed++; console.error(`  FAIL: ${msg}`); }
}

async function main() {
  console.log('=== Phase 6: deleted records / restore (cross-entity) ===');
  const admin = await verifyLogin('admin', 'admin123');

  const customer = await createCustomer({ name: 'Deleted Records Test Co' });

  await softDelete('customers', customer.id, admin!.id);

  const activeList = await listCustomers();
  assert(!activeList.some((c: any) => c.customer_id === customer.id),
    'soft-deleted customer no longer appears in the normal customer list');

  const deleted = await listDeletedRecords('customers');
  assert(deleted.some((d: any) => d.id === customer.id),
    'soft-deleted customer appears in the deleted-records view');

  const auditRow = await pool.query(
    `SELECT action FROM audit_logs WHERE module='customers' AND record_id=$1 ORDER BY created_at DESC LIMIT 1`,
    [customer.id]
  );
  assert(auditRow.rows[0]?.action === 'soft_delete', 'soft delete on a customer was captured by the generic audit trigger');

  await restore('customers', customer.id, admin!.id);
  const restoredList = await listCustomers();
  assert(restoredList.some((c: any) => c.customer_id === customer.id), 'restored customer reappears in the normal list');

  const deletedAfterRestore = await listDeletedRecords('customers');
  assert(!deletedAfterRestore.some((d: any) => d.id === customer.id), 'restored customer no longer appears in deleted-records');

  console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => { console.error('FATAL:', err); process.exit(1); });
