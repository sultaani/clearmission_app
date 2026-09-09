-- =========================================================
-- File 08: Seed data — default pricing straight from the PRD
-- =========================================================

INSERT INTO users (username, password_hash, role) VALUES
    ('admin',   crypt('admin123', gen_salt('bf')), 'admin'),
    ('cashier', crypt('cashier123', gen_salt('bf')), 'cashier');

-- Inventory items backing the priced materials
INSERT INTO inventory_items (name, category, unit, roll_width_ft, min_stock_threshold) VALUES
    ('Art Card A4', 'di_material', 'sheet', NULL, 100),
    ('Art Card A3', 'di_material', 'sheet', NULL, 100),
    ('Art Paper A4', 'di_material', 'sheet', NULL, 100),
    ('Art Paper A3', 'di_material', 'sheet', NULL, 100),
    ('Plain Paper A4', 'di_material', 'sheet', NULL, 100),
    ('Plain Paper A3', 'di_material', 'sheet', NULL, 100),
    ('Special Paper A4', 'di_material', 'sheet', NULL, 50),
    ('Flex', 'large_format_material', 'metre', 4, 20),
    ('SAV', 'large_format_material', 'metre', 4, 20),
    ('Ink', 'ink', 'bottle', NULL, 5),
    ('DTF Film', 'dtf_consumable', 'metre', NULL, 10),
    ('DTF Powder', 'dtf_consumable', 'bottle', NULL, 5),
    ('Roll-up Banner Stand', 'branding_stock', 'piece', NULL, 5);

-- Products/services with PRD default rates
INSERT INTO products_services (name, category, kind, pricing_model, unit, default_price, requires_dimensions, inventory_item_id) VALUES
    ('Art Card A4', 'DI Printing', 'product', 'flat_per_unit', 'sheet', 100, FALSE, (SELECT id FROM inventory_items WHERE name='Art Card A4')),
    ('Art Card A3', 'DI Printing', 'product', 'flat_per_unit', 'sheet', 200, FALSE, (SELECT id FROM inventory_items WHERE name='Art Card A3')),
    ('Art Paper A4', 'DI Printing', 'product', 'flat_per_unit', 'sheet', 50,  FALSE, (SELECT id FROM inventory_items WHERE name='Art Paper A4')),
    ('Art Paper A3', 'DI Printing', 'product', 'flat_per_unit', 'sheet', 100, FALSE, (SELECT id FROM inventory_items WHERE name='Art Paper A3')),
    ('Plain Paper A4','DI Printing', 'product', 'flat_per_unit', 'sheet', 50,  FALSE, (SELECT id FROM inventory_items WHERE name='Plain Paper A4')),
    ('Plain Paper A3','DI Printing', 'product', 'flat_per_unit', 'sheet', 100, FALSE, (SELECT id FROM inventory_items WHERE name='Plain Paper A3')),
    ('Special Paper A4','DI Printing','product', 'flat_per_unit', 'sheet', 200, FALSE, (SELECT id FROM inventory_items WHERE name='Special Paper A4')),
    ('DTF A5', 'DTF Printing', 'product', 'flat_per_unit', 'piece', 500,  FALSE, NULL),
    ('DTF A4', 'DTF Printing', 'product', 'flat_per_unit', 'piece', 1000, FALSE, NULL),
    ('DTF A3', 'DTF Printing', 'product', 'flat_per_unit', 'piece', 2000, FALSE, NULL),
    ('Flex Printing', 'Large Format', 'product', 'area_based', 'metre', 200, TRUE, (SELECT id FROM inventory_items WHERE name='Flex')),
    ('SAV Printing', 'Large Format', 'product', 'area_based', 'metre', 250, TRUE, (SELECT id FROM inventory_items WHERE name='SAV')),
    ('Ink Sale', 'Ink Sales', 'product', 'flat_per_unit', 'bottle', 14500, FALSE, (SELECT id FROM inventory_items WHERE name='Ink')),
    ('Roll-up Banner Stand', 'Roll-up Banner Stands', 'product', 'inventory_tracked', 'piece', 15000, FALSE, (SELECT id FROM inventory_items WHERE name='Roll-up Banner Stand')),
    ('Material Cut-out', 'Material Cut-outs', 'product', 'flat_per_unit', 'yard', 0, FALSE, NULL),
    ('Branded Shirt', 'Branding', 'product', 'flat_per_unit', 'piece', 5000, FALSE, NULL);

INSERT INTO expense_categories (name) VALUES
    ('Fuel'),('Electricity'),('Machine Maintenance'),('Transportation'),('Salaries'),
    ('Office Expenses'),('Internet'),('Repairs'),('Marketing'),('Materials'),('Packaging'),('Other');

-- Walk-in customer placeholder (PRD #11 — avoid duplicate anonymous customers)
INSERT INTO customers (name, is_walk_in, status) VALUES ('WALK-IN CUSTOMER', TRUE, 'active');
