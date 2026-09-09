-- =========================================================
-- File 13: Multi-width materials
--
-- Real business gap: Flex isn't one physical stock — it's stocked in
-- (at least) seven different roll widths (10/8/6/5/4/3/2 ft), each a
-- separate physical roll with its own remaining length. The original
-- schema modeled "Flex" as a single inventory_items row with one fixed
-- roll_width_ft, which is wrong for a shop that actually carries multiple
-- widths side by side.
--
-- This migration:
--   1. Adds material_group to inventory_items and products_services, so
--      "any of these rows are interchangeable stock for this product" is
--      an explicit, queryable relationship instead of a name-matching hack.
--   2. Renames the existing single "Flex" row to "Flex 4ft" (preserving its
--      id, stock level, weighted-average cost, and full movement/procurement
--      history — nothing about its actual inventory is lost or reset).
--   3. Adds six more Flex width variants at zero stock, ready to be
--      procured into as real stock arrives.
--   4. Tags SAV as its own material_group too (currently still a single
--      width — this just makes it consistent and ready if that ever needs
--      to split the same way, without another migration).
--
-- Safe to re-run: every step below is idempotent (guarded by IF NOT
-- EXISTS / WHERE NOT EXISTS checks), so running this twice does nothing
-- the second time rather than erroring or duplicating rows.
-- =========================================================

ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS material_group TEXT;
ALTER TABLE products_services ADD COLUMN IF NOT EXISTS material_group TEXT;

-- Rename the existing Flex row in place — same id, same stock, same history.
UPDATE inventory_items
   SET name = 'Flex 4ft', material_group = 'flex'
 WHERE name = 'Flex' AND category = 'large_format_material';

UPDATE inventory_items SET material_group = 'sav' WHERE name = 'SAV' AND category = 'large_format_material';

-- Add the other six Flex widths, only if they don't already exist (re-run safety).
INSERT INTO inventory_items (name, category, unit, roll_width_ft, min_stock_threshold, material_group)
SELECT v.name, 'large_format_material', 'metre', v.width, 20, 'flex'
FROM (VALUES
    ('Flex 10ft', 10),
    ('Flex 8ft', 8),
    ('Flex 6ft', 6),
    ('Flex 5ft', 5),
    ('Flex 3ft', 3),
    ('Flex 2ft', 2)
) AS v(name, width)
WHERE NOT EXISTS (SELECT 1 FROM inventory_items WHERE inventory_items.name = v.name);

-- Tag the Flex Printing / SAV Printing products with their material group so
-- the POS can look up "every width this product could be cut from".
UPDATE products_services SET material_group = 'flex' WHERE name = 'Flex Printing';
UPDATE products_services SET material_group = 'sav' WHERE name = 'SAV Printing';
