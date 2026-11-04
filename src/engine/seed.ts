
export const SEED_SQL = `
INSERT INTO products (id, name, category) VALUES
('P001', 'Classic Backpack', 'Bags'),
('P002', 'Urban Sneakers', 'Footwear'),
('P003', 'Travel Bottle', 'Accessories'),
('P004', 'Everyday Hoodie', 'Apparel'),
('P005', 'Wireless Desk Lamp', 'Electronics'),
('P006', 'Canvas Tote', 'Bags');

INSERT INTO sales (id, order_date, status) VALUES
('S001', '2026-07-10', 'completed'),
('S002', '2026-07-25', 'completed'),
('S003', '2026-08-12', 'completed'),
('S004', '2026-08-28', 'completed'),
('S005', '2026-09-09', 'completed'),
('S006', '2026-09-22', 'completed'),
('S007', '2026-10-08', 'completed'),
('S008', '2026-10-19', 'completed'),
('S009', '2026-11-01', 'completed'),
('S010', '2026-11-02', 'completed');

INSERT INTO sale_items
(id, sale_id, product_id, quantity, unit_price, unit_cost, discount)
VALUES
-- Q3: July to September
('I001', 'S001', 'P001', 20, 100, 45, 0),
('I002', 'S001', 'P002', 15, 120, 55, 0),
('I003', 'S002', 'P003', 30, 40, 15, 0),
('I004', 'S002', 'P004', 12, 90, 40, 0),
('I005', 'S003', 'P005', 10, 150, 75, 0),
('I006', 'S003', 'P006', 25, 50, 20, 0),
('I007', 'S004', 'P001', 18, 100, 45, 0),
('I008', 'S004', 'P002', 12, 120, 55, 0),
('I009', 'S005', 'P003', 28, 40, 15, 0),
('I010', 'S005', 'P004', 15, 90, 40, 0),
('I011', 'S006', 'P005', 12, 150, 75, 0),
('I012', 'S006', 'P006', 20, 50, 20, 0),

-- Q4: October to December (sample through November 2)
('I013', 'S007', 'P001', 22, 100, 60, 5),
('I014', 'S007', 'P002', 16, 120, 80, 10),
('I015', 'S008', 'P003', 35, 40, 25, 5),
('I016', 'S008', 'P004', 14, 90, 48, 5),
('I017', 'S009', 'P005', 11, 150, 95, 10),
('I018', 'S009', 'P006', 28, 50, 28, 5),
('I019', 'S010', 'P001', 19, 100, 60, 5),
('I020', 'S010', 'P002', 14, 120, 80, 10);
`;
