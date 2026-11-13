import { pool, withTransaction } from '../db';
import { withActor } from '../auth';

/** Tables whose rows point at a customer. Everything here moves on a merge and moves back on undo. */
const CUSTOMER_TABLES = ['job_orders', 'invoices', 'payments', 'receipts', 'quotations'] as const;
type CustomerTable = (typeof CUSTOMER_TABLES)[number];
type MovedIds = Record<CustomerTable, string[]>;

const MAX_SOURCES = 50;

export type MergeInput = {
  survivorId: string;
  sourceIds: string[];
  /** Optional: rename the surviving customer as part of the merge. */
  newName?: string;
};

export async function mergeCustomers(input: MergeInput, actorId: string) {
  const survivorId = input.survivorId;
  const sourceIds = Array.from(new Set(input.sourceIds ?? []));
  const newName = input.newName?.trim();

  if (!survivorId) throw new Error('Choose which customer record to keep');
  if (sourceIds.length === 0) throw new Error('Select at least one other customer to merge in');
  if (sourceIds.includes(survivorId)) throw new Error('The customer to keep cannot also be merged into itself');
  if (sourceIds.length > MAX_SOURCES) throw new Error(`Merge at most ${MAX_SOURCES} customers at a time`);
  if (newName !== undefined && (newName.length === 0 || newName.length > 120)) {
    throw new Error('Customer name must be between 1 and 120 characters');
  }

  return withTransaction((client) =>
    withActor(client, actorId, async () => {
      const allIds = [survivorId, ...sourceIds];

      // Lock in a stable order so two simultaneous merges can't deadlock each other.
      const { rows: found } = await client.query(
        `SELECT id, name, phone, address, is_walk_in
           FROM customers
          WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL
          ORDER BY id
            FOR UPDATE`,
        [allIds]
      );
      if (found.length !== allIds.length) {
        throw new Error('One or more selected customers no longer exist or were already merged');
      }
      const byId = new Map(found.map((r) => [r.id as string, r]));
      const survivor = byId.get(survivorId)!;
      if (found.some((r) => r.is_walk_in)) {
        throw new Error('The shared WALK-IN CUSTOMER record cannot be merged');
      }

      const finalName = newName ?? survivor.name;
      let phone: string | null = survivor.phone;
      let address: string | null = survivor.address;
      const summary: Array<{ sourceId: string; sourceName: string; moved: Record<CustomerTable, number> }> = [];

      for (const sourceId of sourceIds) {
        const source = byId.get(sourceId)!;
        const moved = {} as MovedIds;
        const counts = {} as Record<CustomerTable, number>;

        for (const table of CUSTOMER_TABLES) {
          // Every row moves, including soft-deleted ones, so a later "restore" can't
          // resurrect a record that still points at the archived duplicate.
          const { rows } = await client.query(
            `UPDATE ${table} SET customer_id = $1 WHERE customer_id = $2 RETURNING id`,
            [survivorId, sourceId]
          );
          moved[table] = rows.map((r) => r.id);
          counts[table] = rows.length;
        }

        if (!phone && source.phone) phone = source.phone;
        if (!address && source.address) address = source.address;

        await client.query(
          `UPDATE customers SET deleted_at = now(), deleted_by = $2, updated_at = now() WHERE id = $1`,
          [sourceId, actorId]
        );
        await client.query(
          `INSERT INTO customer_merges
             (survivor_id, source_id, source_name, survivor_name_before, survivor_name_after, moved, merged_by)
           VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)`,
          [survivorId, sourceId, source.name, survivor.name, finalName, JSON.stringify(moved), actorId]
        );
        summary.push({ sourceId, sourceName: source.name, moved: counts });
      }

      const { rows: updated } = await client.query(
        `UPDATE customers
            SET name = $2, phone = $3, address = $4, updated_at = now()
          WHERE id = $1
      RETURNING id, customer_code, name, phone, address`,
        [survivorId, finalName, phone, address]
      );

      return { survivor: updated[0], merged: summary };
    })
  );
}

/** Reverses one merge: moves its records back and brings the archived customer back. */
export async function undoMerge(mergeId: string, actorId: string) {
  return withTransaction((client) =>
    withActor(client, actorId, async () => {
      const { rows } = await client.query(
        `SELECT * FROM customer_merges WHERE id = $1 FOR UPDATE`,
        [mergeId]
      );
      const merge = rows[0];
      if (!merge) throw new Error('Merge not found');
      if (merge.undone_at) throw new Error('This merge was already undone');

      const moved = merge.moved as MovedIds;
      let restored = 0;
      for (const table of CUSTOMER_TABLES) {
        const ids: string[] = moved[table] ?? [];
        if (ids.length === 0) continue;
        // Only pull back rows that are still with the survivor; anything edited since stays put.
        const res = await client.query(
          `UPDATE ${table} SET customer_id = $1 WHERE id = ANY($2::uuid[]) AND customer_id = $3`,
          [merge.source_id, ids, merge.survivor_id]
        );
        restored += res.rowCount ?? 0;
      }

      await client.query(
        `UPDATE customers SET deleted_at = NULL, deleted_by = NULL, updated_at = now() WHERE id = $1`,
        [merge.source_id]
      );
      await client.query(
        `UPDATE customer_merges SET undone_at = now(), undone_by = $2 WHERE id = $1`,
        [mergeId, actorId]
      );
      // Merges done together (same transaction time) share one rename. Put the old name back
      // only when the last of them is undone, and only if nobody has renamed the customer since.
      const { rows: stillMerged } = await client.query(
        // Compared inside the database: a JS Date would drop the timestamp's microseconds.
        `SELECT 1 FROM customer_merges
          WHERE survivor_id = $1 AND undone_at IS NULL
            AND merged_at = (SELECT merged_at FROM customer_merges WHERE id = $2)
          LIMIT 1`,
        [merge.survivor_id, mergeId]
      );
      if (stillMerged.length === 0) {
        await client.query(
          `UPDATE customers SET name = $2, updated_at = now() WHERE id = $1 AND name = $3`,
          [merge.survivor_id, merge.survivor_name_before, merge.survivor_name_after]
        );
      }
      return { mergeId, sourceId: merge.source_id, recordsRestored: restored };
    })
  );
}

export async function listMerges(limit = 50) {
  const { rows } = await pool.query(
    `SELECT m.id, m.survivor_id, m.source_id, m.source_name, m.survivor_name_after AS survivor_name,
            m.merged_at, m.undone_at, u.username AS merged_by_username,
            (SELECT COALESCE(SUM(jsonb_array_length(v)), 0)
               FROM jsonb_each(m.moved) AS e(k, v)) AS records_moved
       FROM customer_merges m
       LEFT JOIN users u ON u.id = m.merged_by
      ORDER BY m.merged_at DESC
      LIMIT $1`,
    [Math.min(Math.max(limit, 1), 200)]
  );
  return rows.map((r) => ({ ...r, records_moved: Number(r.records_moved) }));
}

type SuggestionMember = {
  customer_id: string;
  customer_code: string;
  name: string;
  total_job_orders: number;
  total_revenue: number;
};

/**
 * Groups customers whose names look like the same person (e.g. "Adedayo" / "Adedayo A.").
 * These are SUGGESTIONS for a human to review, never merged automatically.
 * Names like "Walk-In Customer Samson" are compared on the part after the label.
 */
export async function suggestDuplicateGroups(threshold = 0.55, maxGroups = 60) {
  const { rows: pairs } = await pool.query(
    `WITH norm AS (
       SELECT id,
              btrim(regexp_replace(
                regexp_replace(lower(name), '^walk[- ]?in customer\\s*', ''),
                '[^a-z0-9 ]', '', 'g')) AS n
         FROM customers
        WHERE deleted_at IS NULL AND NOT is_walk_in
     ),
     usable AS (SELECT id, n FROM norm WHERE length(n) >= 4)
     SELECT a.id AS a_id, b.id AS b_id
       FROM usable a
       JOIN usable b ON a.id < b.id AND a.n % b.n
      WHERE similarity(a.n, b.n) >= $1`,
    [threshold]
  );
  if (pairs.length === 0) return [];

  // Connected components: if A~B and B~C they belong in one group for review.
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    if (!parent.has(x)) parent.set(x, x);
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  for (const p of pairs) parent.set(find(p.a_id), find(p.b_id));

  const groups = new Map<string, string[]>();
  for (const id of parent.keys()) {
    const root = find(id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(id);
  }
  const groupIds = Array.from(groups.values()).filter((g) => g.length >= 2 && g.length <= 8);
  const allIds = groupIds.flat();
  if (allIds.length === 0) return [];

  const { rows: stats } = await pool.query(
    `SELECT customer_id, customer_code, name, total_job_orders, total_revenue
       FROM v_customer_stats WHERE customer_id = ANY($1::uuid[])`,
    [allIds]
  );
  const statById = new Map<string, SuggestionMember>(
    stats.map((s) => [
      s.customer_id,
      { ...s, total_job_orders: Number(s.total_job_orders), total_revenue: Number(s.total_revenue) },
    ])
  );

  return groupIds
    .map((ids) => ids.map((id) => statById.get(id)).filter((m): m is SuggestionMember => !!m))
    .filter((members) => members.length >= 2)
    .map((members) => ({
      members: members.sort((x, y) => y.total_job_orders - x.total_job_orders || x.name.localeCompare(y.name)),
      combined_orders: members.reduce((s, m) => s + m.total_job_orders, 0),
    }))
    .sort((x, y) => y.combined_orders - x.combined_orders)
    .slice(0, maxGroups);
}
