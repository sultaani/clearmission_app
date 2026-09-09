// Runs in the browser (or under a fake-indexeddb polyfill in tests — see
// tests/offlineQueue.test.ts). Not imported by any server-side code path.

const DB_NAME = 'clearmission-offline';
const DB_VERSION = 1;
const STORE = 'pending_operations';

export type QueuedOperation = {
  clientRequestId: string; // crypto.randomUUID() — the idempotency key the server checks
  type: 'job_order' | 'payment' | 'expense';
  payload: unknown;
  queuedAt: string;
  syncStatus: 'pending' | 'applied' | 'already_synced' | 'conflict';
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'clientRequestId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Called by the POS UI every time a job order / payment / expense is submitted. */
export async function enqueue(op: Omit<QueuedOperation, 'queuedAt' | 'syncStatus'>): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ ...op, queuedAt: new Date().toISOString(), syncStatus: 'pending' });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listPending(): Promise<QueuedOperation[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result as QueuedOperation[]).filter((o) => o.syncStatus === 'pending'));
    req.onerror = () => reject(req.error);
  });
}

async function markSynced(clientRequestId: string, status: QueuedOperation['syncStatus']): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const getReq = store.get(clientRequestId);
    getReq.onsuccess = () => {
      const record = getReq.result;
      if (record) store.put({ ...record, syncStatus: status });
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * POSTs every pending operation to /api/sync and marks each one according to
 * the server's per-operation result. Safe to call repeatedly / on every
 * reconnect — already-applied operations come back 'already_synced' and are
 * just marked done, never re-applied (server-side idempotency on
 * clientRequestId is the actual guarantee; this is the client bookkeeping).
 */
export async function syncPending(fetchImpl: typeof fetch = fetch): Promise<{
  synced: number;
  conflicts: number;
}> {
  const pending = await listPending();
  if (pending.length === 0) return { synced: 0, conflicts: 0 };

  const res = await fetchImpl('/api/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      operations: pending.map((p) => ({ type: p.type, clientRequestId: p.clientRequestId, payload: p.payload })),
    }),
  });
  if (!res.ok) throw new Error(`Sync request failed: ${res.status}`);
  const { results } = (await res.json()) as {
    results: Array<{ clientRequestId: string; status: QueuedOperation['syncStatus'] }>;
  };

  let synced = 0;
  let conflicts = 0;
  for (const r of results) {
    await markSynced(r.clientRequestId, r.status);
    if (r.status === 'conflict') conflicts++;
    else synced++;
  }
  return { synced, conflicts };
}
