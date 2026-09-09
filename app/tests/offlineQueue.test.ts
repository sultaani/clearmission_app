import 'fake-indexeddb/auto';
import { enqueue, listPending, syncPending } from '../src/lib/offlineQueue';

let passed = 0, failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) { passed++; console.log(`  OK: ${msg}`); }
  else { failed++; console.error(`  FAIL: ${msg}`); }
}

async function main() {
  console.log('=== Phase 7: offline queue (IndexedDB) ===');

  await enqueue({ clientRequestId: 'req-1', type: 'job_order', payload: { items: [] } });
  await enqueue({ clientRequestId: 'req-2', type: 'payment', payload: { amount: 5000 } });

  const pending = await listPending();
  assert(pending.length === 2, `two operations queued while offline (found ${pending.length})`);

  // Mock the server: req-1 applies, req-2 conflicts (as if an Admin edited it meanwhile)
  const mockFetch = (async (url: string, opts: any) => {
    const body = JSON.parse(opts.body);
    assert(body.operations.length === 2, 'sync request includes all pending operations');
    return {
      ok: true,
      json: async () => ({
        results: [
          { clientRequestId: 'req-1', status: 'applied' },
          { clientRequestId: 'req-2', status: 'conflict', reason: 'Admin already resolved this offline' },
        ],
      }),
    };
  }) as unknown as typeof fetch;

  const { synced, conflicts } = await syncPending(mockFetch);
  assert(synced === 1, `one operation counted as synced (${synced})`);
  assert(conflicts === 1, `one operation counted as a conflict (${conflicts})`);

  const stillPending = await listPending();
  assert(stillPending.length === 0, 'both operations cleared from the pending queue after sync (applied AND conflicted both leave "pending" status)');

  // Idempotency at the client bookkeeping layer: calling syncPending again with nothing new queued is a no-op
  const secondSync = await syncPending(mockFetch);
  assert(secondSync.synced === 0 && secondSync.conflicts === 0, 'calling sync again with an empty queue does nothing (no re-POST)');

  console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => { console.error('FATAL:', err); process.exit(1); });
