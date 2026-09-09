import { pool } from '../db';
import { createJobOrder, findJobOrderByClientRequestId, CreateJobOrderInput } from './jobOrders';
import { recordPayment, findPaymentByClientRequestId, RecordPaymentInput } from './payments';
import { recordExpense, findExpenseByClientRequestId } from './expenses';

export type SyncOperation =
  | { type: 'job_order'; clientRequestId: string; payload: Omit<CreateJobOrderInput, 'cashierId' | 'clientRequestId'> }
  | { type: 'payment'; clientRequestId: string; payload: Omit<RecordPaymentInput, 'recordedBy' | 'clientRequestId'> }
  | { type: 'expense'; clientRequestId: string; payload: Omit<Parameters<typeof recordExpense>[0], 'recordedBy' | 'clientRequestId'> };

export type SyncResult =
  | { clientRequestId: string; status: 'applied'; result: unknown }
  | { clientRequestId: string; status: 'already_synced'; result: unknown }
  | { clientRequestId: string; status: 'conflict'; reason: string };

/**
 * Applies a batch of offline-queued operations in order. Each is idempotent on
 * clientRequestId (PRD #80-81: a transaction created offline and retried on
 * reconnect must not double-apply). Where an operation would conflict with a
 * change an Admin made while the cashier was offline — e.g. a payment for a
 * customer whose job order was soft-deleted in the meantime — the Admin's
 * change wins: the operation is NOT applied, and is logged to sync_conflicts
 * for Admin review instead (PRD #82).
 */
export async function syncBatch(cashierId: string, operations: SyncOperation[]): Promise<SyncResult[]> {
  const results: SyncResult[] = [];
  for (const op of operations) {
    results.push(await syncOne(cashierId, op));
  }
  return results;
}

async function syncOne(cashierId: string, op: SyncOperation): Promise<SyncResult> {
  if (op.type === 'job_order') {
    const existing = await findJobOrderByClientRequestId(op.clientRequestId);
    if (existing) return { clientRequestId: op.clientRequestId, status: 'already_synced', result: existing };

    // Conflict check: if a specific customerId was given and that customer was
    // soft-deleted by an Admin while this cashier was offline, don't silently
    // attach a new job order to a deleted customer.
    if (op.payload.customerId) {
      const { rows } = await pool.query(
        `SELECT deleted_at FROM customers WHERE id = $1`,
        [op.payload.customerId]
      );
      if (!rows[0] || rows[0].deleted_at) {
        return logConflict(cashierId, op, 'job_order',
          'Customer was deleted (by Admin) after this job order was created offline');
      }
    }

    const result = await createJobOrder({ ...op.payload, cashierId, clientRequestId: op.clientRequestId });
    return { clientRequestId: op.clientRequestId, status: 'applied', result };
  }

  if (op.type === 'payment') {
    const existing = await findPaymentByClientRequestId(op.clientRequestId);
    if (existing) return { clientRequestId: op.clientRequestId, status: 'already_synced', result: existing };

    // Conflict check: every explicitly targeted invoice must still be open and
    // able to absorb this amount. If an Admin already fully paid/soft-deleted
    // that invoice while the cashier was offline, don't silently over-allocate.
    if (op.payload.allocations) {
      for (const alloc of op.payload.allocations) {
        const { rows } = await pool.query(
          `SELECT outstanding, deleted_at FROM invoices WHERE id = $1`,
          [alloc.invoiceId]
        );
        const inv = rows[0];
        if (!inv || inv.deleted_at || Number(inv.outstanding) < alloc.amount - 0.01) {
          return logConflict(cashierId, op, 'payment',
            `Invoice ${alloc.invoiceId} no longer has enough outstanding balance to absorb this offline payment ` +
            `(Admin likely recorded another payment or deleted it while offline)`);
        }
      }
    }

    const result = await recordPayment({ ...op.payload, recordedBy: cashierId, clientRequestId: op.clientRequestId });
    return { clientRequestId: op.clientRequestId, status: 'applied', result };
  }

  // expense — low conflict risk, no shared mutable state to race against
  const existing = await findExpenseByClientRequestId(op.clientRequestId);
  if (existing) return { clientRequestId: op.clientRequestId, status: 'already_synced', result: existing };
  const result = await recordExpense({ ...op.payload, recordedBy: cashierId, clientRequestId: op.clientRequestId });
  return { clientRequestId: op.clientRequestId, status: 'applied', result };
}

async function logConflict(
  cashierId: string,
  op: SyncOperation,
  entityType: string,
  reason: string
): Promise<SyncResult> {
  await pool.query(
    `INSERT INTO sync_conflicts (client_request_id, entity_type, reason, payload, cashier_id)
     VALUES ($1,$2,$3,$4,$5)`,
    [op.clientRequestId, entityType, reason, JSON.stringify(op.payload), cashierId]
  );
  return { clientRequestId: op.clientRequestId, status: 'conflict', reason };
}

export async function listUnresolvedConflicts() {
  const { rows } = await pool.query(
    `SELECT sc.*, u.username AS cashier_username
       FROM sync_conflicts sc JOIN users u ON u.id = sc.cashier_id
      WHERE resolved = FALSE ORDER BY created_at`
  );
  return rows;
}

export async function resolveConflict(conflictId: string, adminId: string) {
  const { rows } = await pool.query(
    `UPDATE sync_conflicts SET resolved = TRUE, resolved_by = $2, resolved_at = now()
      WHERE id = $1 RETURNING *`,
    [conflictId, adminId]
  );
  return rows[0] ?? null;
}
