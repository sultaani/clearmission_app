import { pool, withTransaction } from '../db';
import { withActor } from '../auth';

type DeletableEntity = 'job_orders' | 'customers' | 'payments' | 'expenses' | 'products_services' | 'quotations';

const ENTITY_LABEL: Record<DeletableEntity, string> = {
  job_orders: 'job_order_no',
  customers: 'name',
  payments: 'id',
  expenses: 'description',
  products_services: 'name',
  quotations: 'quotation_no',
};

const RESTORABLE: DeletableEntity[] = ['job_orders', 'customers', 'payments', 'expenses', 'products_services', 'quotations'];

function assertValidEntity(entity: string): asserts entity is DeletableEntity {
  if (!RESTORABLE.includes(entity as DeletableEntity)) {
    throw new Error(`Unknown or non-deletable entity: ${entity}`);
  }
}

/** Lists every soft-deleted row across all deletable entities (or one, if filtered). PRD #77. */
export async function listDeletedRecords(entity?: string) {
  if (entity) assertValidEntity(entity); // never trust a request-supplied string into a FROM clause

  const entities: DeletableEntity[] = entity ? [entity as DeletableEntity] : [...RESTORABLE];

  const results = await Promise.all(
    entities.map(async (e) => {
      const labelCol = ENTITY_LABEL[e];
      const { rows } = await pool.query(
        `SELECT id, ${labelCol} AS label, deleted_at
           FROM ${e}
          WHERE deleted_at IS NOT NULL
          ORDER BY deleted_at DESC`
      );
      return rows.map((r) => ({ entity: e, ...r }));
    })
  );
  return results.flat();
}

/** Soft-deletes a row on any of the supported entities, tracked by the generic audit trigger. */
export async function softDelete(entity: string, id: string, actorId: string) {
  assertValidEntity(entity);
  // customers/products_services/quotations don't carry a deleted_by column (Phase 0 didn't need
  // it on those for the read paths that existed then) — set it only where the column exists.
  const hasDeletedBy = entity === 'job_orders' || entity === 'payments' || entity === 'expenses';
  const sql = hasDeletedBy
    ? `UPDATE ${entity} SET deleted_at = now(), deleted_by = $2 WHERE id = $1 AND deleted_at IS NULL`
    : `UPDATE ${entity} SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL`;
  const params = hasDeletedBy ? [id, actorId] : [id];

  return withTransaction((client) =>
    withActor(client, actorId, () => client.query(sql, params))
  );
}

/** Restores a soft-deleted row, reinstating its financial/inventory effects for job orders. */
export async function restore(entity: string, id: string, actorId: string) {
  assertValidEntity(entity);
  const hasDeletedBy = entity === 'job_orders' || entity === 'payments' || entity === 'expenses';
  const sql = hasDeletedBy
    ? `UPDATE ${entity} SET deleted_at = NULL, deleted_by = NULL WHERE id = $1 AND deleted_at IS NOT NULL`
    : `UPDATE ${entity} SET deleted_at = NULL WHERE id = $1 AND deleted_at IS NOT NULL`;

  return withTransaction((client) =>
    withActor(client, actorId, () => client.query(sql, [id]))
  );
}
