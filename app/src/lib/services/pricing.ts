import { PoolClient } from 'pg';

export type PricingInput = {
  productServiceId?: string;
  width?: number;
  height?: number;
  quantity: number;
};

export type PricedItem = {
  standardRate: number;
  calculatedAmount: number;
  pricingModel: string;
};

/**
 * Computes the system's "standard" price for a line item, following the
 * PRD's three pricing models (section 21 onward):
 *   - flat_per_unit : rate * quantity                         (DI sheets, DTF, ink, cut-outs, branding)
 *   - area_based     : width * height * rate * quantity         (large format — PRD #18)
 *   - inventory_tracked : rate * quantity                       (roll-up banners; stock also decrements)
 * The cashier's actually-collected amount is a separate, independently
 * entered figure (PRD #20 — no discount field) — this function only
 * produces the *standard* calculated amount for comparison/audit.
 */
export async function priceItem(
  client: PoolClient,
  input: PricingInput
): Promise<PricedItem> {
  if (!input.productServiceId) {
    throw new Error('productServiceId is required to price a line item');
  }
  const { rows } = await client.query(
    `SELECT pricing_model, default_price, requires_dimensions
       FROM products_services WHERE id = $1 AND is_active = TRUE AND deleted_at IS NULL`,
    [input.productServiceId]
  );
  const product = rows[0];
  if (!product) throw new Error('Unknown or inactive product/service');

  const rate = Number(product.default_price ?? 0);

  if (product.pricing_model === 'area_based') {
    if (!input.width || !input.height) {
      throw new Error('width and height are required for an area-based item');
    }
    const calculatedAmount = input.width * input.height * rate * input.quantity;
    return { standardRate: rate, calculatedAmount, pricingModel: product.pricing_model };
  }

  // flat_per_unit and inventory_tracked both scale linearly with quantity
  const calculatedAmount = rate * input.quantity;
  return { standardRate: rate, calculatedAmount, pricingModel: product.pricing_model };
}
