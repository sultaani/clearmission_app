import { PoolClient } from 'pg';
import { pool, withTransaction } from '../db';
import { withActor } from '../auth';
import { priceItem } from './pricing';

export type JobOrderItemInput = {
  productServiceId: string;
  category: string;
  description?: string;
  width?: number;
  height?: number;
  quantity: number;
  unit?: string;
  collectedAmount?: number; // if omitted, defaults to the system's calculated amount
  combineGroup?: string;    // items sharing a combineGroup + material get laid out on one physical sheet
  /** Overrides the product's default material — e.g. a cashier picking which
   *  specific roll width (Flex 8ft vs Flex 4ft) was actually used, when a
   *  product like "Flex Printing" can be cut from more than one physical
   *  roll. Falls back to the product's own default inventory_item_id when
   *  not given, so single-material products (DI sheets etc.) are unaffected. */
  inventoryItemId?: string;
};

export type CombinedLayoutOverride = {
  combineGroup: string;
  specifiedLength: number;
  specifiedWidthFt?: number;
  quantityConsumed: number;
  remark?: string;
};

export type CreateJobOrderInput = {
  cashierId: string;
  customerId?: string;
  walkIn?: { name: string; phone?: string };
  remark?: string;
  items: JobOrderItemInput[];
  combinedLayouts?: CombinedLayoutOverride[];
  /** Set when this job order originated offline — used for idempotent sync (Phase 7). */
  clientRequestId?: string;
};

async function resolveCustomer(
  client: PoolClient,
  input: CreateJobOrderInput
): Promise<string> {
  if (input.customerId) return input.customerId;

  if (input.walkIn?.name) {
    // Reuse an existing customer with the same name+phone if one exists (PRD #11:
    // avoid creating duplicate customers for the same repeat walk-in details).
    if (input.walkIn.phone) {
      const existing = await client.query(
        `SELECT id FROM customers WHERE phone = $1 AND deleted_at IS NULL LIMIT 1`,
        [input.walkIn.phone]
      );
      if (existing.rows[0]) return existing.rows[0].id;
    }
    const created = await client.query(
      `INSERT INTO customers (name, phone) VALUES ($1, $2) RETURNING id`,
      [input.walkIn.name, input.walkIn.phone ?? null]
    );
    return created.rows[0].id;
  }

  const walkInGeneric = await client.query(
    `SELECT id FROM customers WHERE is_walk_in = TRUE AND name = 'WALK-IN CUSTOMER' LIMIT 1`
  );
  if (!walkInGeneric.rows[0]) {
    throw new Error('No customer specified and no generic WALK-IN CUSTOMER record found');
  }
  return walkInGeneric.rows[0].id;
}

export async function createJobOrder(input: CreateJobOrderInput) {
  if (!input.items?.length) throw new Error('A job order needs at least one item');

  return withTransaction(async (client) => {
    return withActor(client, input.cashierId, async () => {
      const customerId = await resolveCustomer(client, input);

      const jo = await client.query(
        `INSERT INTO job_orders (customer_id, cashier_id, remark, client_request_id)
         VALUES ($1, $2, $3, $4) RETURNING id, job_order_no`,
        [customerId, input.cashierId, input.remark ?? null, input.clientRequestId ?? null]
      );
      const jobOrderId = jo.rows[0].id;

      // group key -> item ids, so we know which large-format items share a physical sheet
      const groupToItemIds = new Map<string, string[]>();
      const largeFormatItemIds: string[] = [];

      for (const item of input.items) {
        const product = await client.query(
          `SELECT category, pricing_model, inventory_item_id, unit
             FROM products_services WHERE id = $1`,
          [item.productServiceId]
        );
        if (!product.rows[0]) throw new Error(`Unknown product/service ${item.productServiceId}`);
        const { inventory_item_id: defaultInventoryItemId, pricing_model, unit: productUnit } = product.rows[0];
        // The cashier's explicit material choice wins over the product's default —
        // this is what makes a multi-width material (e.g. seven Flex roll widths)
        // work: the product just prices per sqft, the actual roll consumed is an
        // inventory decision made at the point of sale, not baked into the product.
        const inventory_item_id = item.inventoryItemId ?? defaultInventoryItemId;

        const priced = await priceItem(client, {
          productServiceId: item.productServiceId,
          width: item.width,
          height: item.height,
          quantity: item.quantity,
        });

        const collectedAmount = item.collectedAmount ?? priced.calculatedAmount;

        const inserted = await client.query(
          `INSERT INTO job_order_items
             (job_order_id, product_service_id, inventory_item_id, category, description,
              width, height, quantity, unit, standard_rate, calculated_amount, collected_amount)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           RETURNING id`,
          [
            jobOrderId, item.productServiceId, inventory_item_id, item.category,
            item.description ?? null, item.width ?? null, item.height ?? null,
            item.quantity, item.unit ?? productUnit, priced.standardRate,
            priced.calculatedAmount, collectedAmount,
          ]
        );
        const itemId = inserted.rows[0].id;

        if (pricing_model === 'area_based' && inventory_item_id) {
          largeFormatItemIds.push(itemId);
          const key = item.combineGroup ?? `__solo__${itemId}`;
          if (!groupToItemIds.has(key)) groupToItemIds.set(key, []);
          groupToItemIds.get(key)!.push(itemId);
        }
      }

      // Register material_layouts for every large-format group — this is the ONLY
      // deduction path for large_format_material (see schema note in 06_functions_triggers.sql).
      for (const [key, itemIds] of groupToItemIds.entries()) {
        const override = input.combinedLayouts?.find((c) => c.combineGroup === key);
        const itemsData = await client.query(
          `SELECT id, inventory_item_id, area_sqft FROM job_order_items WHERE id = ANY($1)`,
          [itemIds]
        );
        const inventoryItemId = itemsData.rows[0].inventory_item_id;
        const rollWidth = await client.query(
          `SELECT roll_width_ft FROM inventory_items WHERE id = $1`,
          [inventoryItemId]
        );
        const rollWidthFt = Number(rollWidth.rows[0].roll_width_ft);

        if (override) {
          await client.query(
            `INSERT INTO material_layouts
               (job_order_id, inventory_item_id, specified_length, specified_width_ft,
                quantity_consumed, layout_method, remark, created_by)
             VALUES ($1,$2,$3,$4,$5,'manual_layout',$6,$7)`,
            [jobOrderId, inventoryItemId, override.specifiedLength, override.specifiedWidthFt ?? null,
             override.quantityConsumed, override.remark ?? null, input.cashierId]
          );
        } else {
          // default: one layout row per solo item, area/roll-width
          for (const row of itemsData.rows) {
            const qtyConsumed = Number(row.area_sqft) / rollWidthFt;
            await client.query(
              `INSERT INTO material_layouts
                 (job_order_id, job_order_item_id, inventory_item_id, specified_length,
                  specified_width_ft, quantity_consumed, layout_method, created_by)
               VALUES ($1,$2,$3,$4,$5,$6,'default_orientation',$7)`,
              [jobOrderId, row.id, inventoryItemId, qtyConsumed, rollWidthFt, qtyConsumed, input.cashierId]
            );
          }
        }
      }

      const joFinal = await client.query(
        `SELECT id, job_order_no, subtotal FROM job_orders WHERE id = $1`,
        [jobOrderId]
      );
      const subtotal = Number(joFinal.rows[0].subtotal);

      const invoice = await client.query(
        `INSERT INTO invoices (job_order_id, customer_id, subtotal)
         VALUES ($1,$2,$3) RETURNING id, invoice_no`,
        [jobOrderId, customerId, subtotal]
      );

      return {
        jobOrderId,
        jobOrderNo: joFinal.rows[0].job_order_no,
        subtotal,
        invoiceId: invoice.rows[0].id,
        invoiceNo: invoice.rows[0].invoice_no,
        customerId,
      };
    });
  });
}

export async function listJobOrders(limit = 100) {
  const { rows } = await pool.query(
    `SELECT jo.id, jo.job_order_no, jo.created_at, jo.subtotal, jo.amount_paid,
            jo.outstanding_balance, jo.payment_status, c.name AS customer_name
       FROM job_orders jo JOIN customers c ON c.id = jo.customer_id
      WHERE jo.deleted_at IS NULL
      ORDER BY jo.created_at DESC
      LIMIT $1`,
    [limit]
  );
  return rows;
}

export async function findJobOrderByClientRequestId(clientRequestId: string) {
  const { rows } = await pool.query(
    `SELECT id, job_order_no, subtotal FROM job_orders WHERE client_request_id = $1`,
    [clientRequestId]
  );
  return rows[0] ?? null;
}

export async function getJobOrder(id: string) {
  const jo = await pool.query(
    `SELECT jo.*, c.name AS customer_name, u.username AS cashier_username, i.id AS invoice_id
       FROM job_orders jo
       JOIN customers c ON c.id = jo.customer_id
       JOIN users u ON u.id = jo.cashier_id
       LEFT JOIN invoices i ON i.job_order_id = jo.id
      WHERE jo.id = $1 AND jo.deleted_at IS NULL`,
    [id]
  );
  if (!jo.rows[0]) return null;
  const items = await pool.query(
    `SELECT * FROM job_order_items WHERE job_order_id = $1 ORDER BY created_at`,
    [id]
  );
  return { ...jo.rows[0], items: items.rows };
}

/** Soft delete / restore — admin only, enforced at the API-route layer. */
export async function softDeleteJobOrder(id: string, actorId: string) {
  return withTransaction((client) =>
    withActor(client, actorId, () =>
      client.query(
        `UPDATE job_orders SET deleted_at = now(), deleted_by = $2 WHERE id = $1`,
        [id, actorId]
      )
    )
  );
}

export async function restoreJobOrder(id: string, actorId: string) {
  return withTransaction((client) =>
    withActor(client, actorId, () =>
      client.query(
        `UPDATE job_orders SET deleted_at = NULL, deleted_by = NULL WHERE id = $1`,
        [id]
      )
    )
  );
}

/** Converts a saved quotation into a real Job Order — one item per quotation line,
 *  each priced as a flat/direct amount (the quotation already fixed the rate,
 *  no need to re-run it through the standard-price pricing engine). */
export async function convertQuotationToJobOrder(quotationId: string, cashierId: string) {
  const { rows } = await pool.query(`SELECT * FROM quotations WHERE id = $1 AND deleted_at IS NULL`, [quotationId]);
  const quotation = rows[0];
  if (!quotation) throw new Error('Quotation not found');

  const lineItems = quotation.items as Array<{ description: string; quantity: number; rate: number; total: number }>;

  return withTransaction(async (client) => {
    return withActor(client, cashierId, async () => {
      const jo = await client.query(
        `INSERT INTO job_orders (customer_id, cashier_id, remark) VALUES ($1,$2,$3) RETURNING id, job_order_no`,
        [quotation.customer_id, cashierId, `Converted from quotation ${quotation.quotation_no}`]
      );
      const jobOrderId = jo.rows[0].id;

      for (const line of lineItems) {
        await client.query(
          `INSERT INTO job_order_items
             (job_order_id, category, description, quantity, unit, standard_rate, calculated_amount, collected_amount)
           VALUES ($1,'Quotation',$2,$3,'piece',$4,$5,$5)`,
          [jobOrderId, line.description, line.quantity, line.rate, line.total]
        );
      }

      const joFinal = await client.query(`SELECT subtotal FROM job_orders WHERE id = $1`, [jobOrderId]);
      const invoice = await client.query(
        `INSERT INTO invoices (job_order_id, customer_id, subtotal) VALUES ($1,$2,$3) RETURNING id, invoice_no`,
        [jobOrderId, quotation.customer_id, joFinal.rows[0].subtotal]
      );

      return {
        jobOrderId, jobOrderNo: jo.rows[0].job_order_no,
        invoiceId: invoice.rows[0].id, invoiceNo: invoice.rows[0].invoice_no,
      };
    });
  });
}
