import { config } from 'dotenv';
config({ path: '.env.local' });
import { pool } from '../src/lib/db';
import { verifyLogin } from '../src/lib/auth';
import { createCustomer } from '../src/lib/services/customers';
import { listProducts } from '../src/lib/services/products';
import { recordProcurement } from '../src/lib/services/inventory';
import { createJobOrder } from '../src/lib/services/jobOrders';
import { syncBatch, listUnresolvedConflicts } from '../src/lib/services/offlineSync';
import { randomUUID } from 'crypto';

let passed = 0, failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) { passed++; console.log(`  OK: ${msg}`); }
  else { failed++; console.error(`  FAIL: ${msg}`); }
}

async function main() {
  console.log('=== Phase 7: server-side offline sync engine ===');

  const cashier = await verifyLogin('cashier', 'cashier123');
  const admin = await verifyLogin('admin', 'admin123');

  const products = await listProducts();
  const shirt = products.find((p: any) => p.name === 'Branded Shirt');
  const customer = await createCustomer({ name: 'Offline Sync Test Customer' });

  const clientRequestId = randomUUID();
  const op = {
    type: 'job_order' as const,
    clientRequestId,
    payload: {
      customerId: customer.id,
      items: [{ productServiceId: shirt.id, category: 'Branding', description: '5 shirts', quantity: 5, collectedAmount: 20000 }],
    },
  };

  // -----------------------------------------------------
  // Idempotency: submit the same offline-queued job order twice (simulating
  // a retry after a flaky connection) — must create exactly one job order.
  // -----------------------------------------------------
  const first = await syncBatch(cashier!.id, [op]);
  assert(first[0].status === 'applied', `first sync of a new offline job order applies it`);

  const second = await syncBatch(cashier!.id, [op]); // same clientRequestId, resubmitted
  assert(second[0].status === 'already_synced', `resubmitting the same clientRequestId is recognized as already synced`);

  const count = await pool.query(`SELECT COUNT(*) FROM job_orders WHERE client_request_id = $1`, [clientRequestId]);
  assert(Number(count.rows[0].count) === 1, `exactly one job order exists despite syncing twice (found ${count.rows[0].count})`);

  // -----------------------------------------------------
  // Conflict: cashier queues a job order offline for a customer; Admin deletes
  // that customer before the cashier reconnects. Sync must NOT silently apply
  // it — Admin's change wins, and it's logged for review (PRD #82).
  // -----------------------------------------------------
  const conflictCustomer = await createCustomer({ name: 'Will Be Deleted By Admin' });
  const conflictClientRequestId = randomUUID();
  const conflictOp = {
    type: 'job_order' as const,
    clientRequestId: conflictClientRequestId,
    payload: {
      customerId: conflictCustomer.id,
      items: [{ productServiceId: shirt.id, category: 'Branding', description: '2 shirts', quantity: 2, collectedAmount: 8000 }],
    },
  };

  // Admin deletes the customer WHILE the cashier is still offline (before sync happens)
  await pool.query(`UPDATE customers SET deleted_at = now() WHERE id = $1`, [conflictCustomer.id]);

  const conflictResult = await syncBatch(cashier!.id, [conflictOp]);
  assert(conflictResult[0].status === 'conflict', `job order for an Admin-deleted customer is flagged as a conflict, not silently applied`);

  const joCount = await pool.query(`SELECT COUNT(*) FROM job_orders WHERE client_request_id = $1`, [conflictClientRequestId]);
  assert(Number(joCount.rows[0].count) === 0, `the conflicting job order was NOT created`);

  const conflicts = await listUnresolvedConflicts();
  assert(conflicts.some((c: any) => c.client_request_id === conflictClientRequestId),
    'the conflict is visible to Admin in the unresolved conflicts list');

  console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => { console.error('FATAL:', err); process.exit(1); });
