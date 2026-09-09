import { pool } from '../db';

export async function listProducts(category?: string) {
  const { rows } = await pool.query(
    category
      ? `SELECT * FROM products_services WHERE is_active = TRUE AND deleted_at IS NULL AND category = $1 ORDER BY name`
      : `SELECT * FROM products_services WHERE is_active = TRUE AND deleted_at IS NULL ORDER BY category, name`,
    category ? [category] : []
  );
  return rows;
}

export async function createProduct(input: {
  name: string; category: string; kind: 'product' | 'service';
  pricingModel: 'flat_per_unit' | 'area_based' | 'inventory_tracked';
  unit?: string; defaultPrice: number; requiresDimensions?: boolean; inventoryItemId?: string;
}) {
  const { rows } = await pool.query(
    `INSERT INTO products_services (name, category, kind, pricing_model, unit, default_price, requires_dimensions, inventory_item_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [input.name, input.category, input.kind, input.pricingModel, input.unit ?? null,
     input.defaultPrice, input.requiresDimensions ?? false, input.inventoryItemId ?? null]
  );
  return rows[0];
}

export async function updateProduct(id: string, input: { defaultPrice?: number; isActive?: boolean; name?: string }) {
  const { rows } = await pool.query(
    `UPDATE products_services SET
       default_price = COALESCE($2, default_price),
       is_active = COALESCE($3, is_active),
       name = COALESCE($4, name),
       updated_at = now()
     WHERE id = $1 RETURNING *`,
    [id, input.defaultPrice ?? null, input.isActive ?? null, input.name ?? null]
  );
  return rows[0] ?? null;
}

export async function getProduct(id: string) {
  const { rows } = await pool.query(`SELECT * FROM products_services WHERE id = $1`, [id]);
  return rows[0] ?? null;
}
