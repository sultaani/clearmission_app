import { pool, withTransaction } from '../db';
import { withActor } from '../auth';

export async function recordProcurement(input: {
  inventoryItemId: string;
  quantity: number;
  totalCost: number;
  recordedBy: string;
  remark?: string;
}) {
  if (input.quantity <= 0) throw new Error('Procurement quantity must be positive');
  return withTransaction((client) =>
    withActor(client, input.recordedBy, () =>
      client.query(
        `INSERT INTO procurements (inventory_item_id, quantity, total_cost, recorded_by, remark)
         VALUES ($1,$2,$3,$4,$5) RETURNING id, procurement_no, unit_cost`,
        [input.inventoryItemId, input.quantity, input.totalCost, input.recordedBy, input.remark ?? null]
      )
    )
  ).then((r) => r.rows[0]);
}

export async function recordAdjustment(input: {
  inventoryItemId: string;
  quantityDelta: number; // positive or negative
  performedBy: string;
  movementType: 'adjustment' | 'damage' | 'carry_out';
  remark?: string;
}) {
  return withTransaction(async (client) => {
    return withActor(client, input.performedBy, async () => {
      const item = await client.query(
        `SELECT weighted_avg_cost, quantity_on_hand FROM inventory_items WHERE id = $1 FOR UPDATE`,
        [input.inventoryItemId]
      );
      if (!item.rows[0]) throw new Error('Unknown inventory item');
      const newQty = Number(item.rows[0].quantity_on_hand) + input.quantityDelta;
      if (newQty < 0) throw new Error('Adjustment would take stock negative');

      await client.query(
        `UPDATE inventory_items SET quantity_on_hand = $2, updated_at = now() WHERE id = $1`,
        [input.inventoryItemId, newQty]
      );
      await client.query(
        `INSERT INTO inventory_movements
           (inventory_item_id, movement_type, quantity_delta, unit_cost_at_time, calculation_method, performed_by, remark)
         VALUES ($1,$2,$3,$4,'direct_unit',$5,$6)`,
        [input.inventoryItemId, input.movementType, input.quantityDelta,
         item.rows[0].weighted_avg_cost, input.performedBy, input.remark ?? null]
      );
    });
  });
}

export async function listLowStock() {
  const { rows } = await pool.query(`SELECT * FROM v_low_stock ORDER BY name`);
  return rows;
}

export async function listInventoryValuation() {
  const { rows } = await pool.query(`SELECT * FROM v_inventory_valuation ORDER BY name`);
  return rows;
}

export async function listInventoryItems() {
  const { rows } = await pool.query(
    `SELECT * FROM inventory_items WHERE deleted_at IS NULL AND is_active = TRUE ORDER BY category, name`
  );
  return rows;
}

export async function getInventoryItemDetail(id: string) {
  const item = await pool.query(`SELECT * FROM inventory_items WHERE id = $1`, [id]);
  if (!item.rows[0]) return null;
  const movements = await pool.query(
    `SELECT im.*, u.username AS performed_by_username, jo.job_order_no
       FROM inventory_movements im
       JOIN users u ON u.id = im.performed_by
       LEFT JOIN job_orders jo ON jo.id = im.source_job_order_id
      WHERE im.inventory_item_id = $1
      ORDER BY im.created_at DESC LIMIT 100`,
    [id]
  );
  const procurements = await pool.query(
    `SELECT * FROM procurements WHERE inventory_item_id = $1 ORDER BY procured_at DESC LIMIT 50`,
    [id]
  );
  return { ...item.rows[0], movements: movements.rows, procurements: procurements.rows };
}

export async function listProcurements(limit = 100) {
  const { rows } = await pool.query(
    `SELECT p.*, i.name AS item_name, u.username AS recorded_by_username
       FROM procurements p JOIN inventory_items i ON i.id = p.inventory_item_id JOIN users u ON u.id = p.recorded_by
      ORDER BY p.procured_at DESC LIMIT $1`,
    [limit]
  );
  return rows;
}

/** Every physical material stocked under a group (e.g. all 7 Flex widths) — for
 *  the POS's "which roll was this cut from?" dropdown. Shows current stock so
 *  a cashier can see at a glance which widths are actually available. */
export async function listInventoryItemsByGroup(group: string) {
  const { rows } = await pool.query(
    `SELECT id, name, roll_width_ft, quantity_on_hand, unit, min_stock_threshold
       FROM inventory_items
      WHERE material_group = $1 AND deleted_at IS NULL AND is_active = TRUE
      ORDER BY roll_width_ft DESC NULLS LAST, name`,
    [group]
  );
  return rows;
}
