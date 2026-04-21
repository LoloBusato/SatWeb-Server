-- Diagnóstico de filas huérfanas en FKs que hoy existen solo por convención
-- (el schema no las declara como FOREIGN KEY, así que la integridad no está garantizada).
-- Usar antes de Fase 3 para dimensionar la limpieza necesaria al agregar los constraints.
-- Rows con NULL en la columna FK no se cuentan como huérfanas.

SELECT 'devices.brand_id -> brands.brandid' AS fk_check, COUNT(*) AS orphans
FROM devices d
LEFT JOIN brands b ON d.brand_id = b.brandid
WHERE d.brand_id IS NOT NULL AND b.brandid IS NULL

UNION ALL SELECT 'orders.users_id -> users.idusers', COUNT(*)
FROM orders o
LEFT JOIN users u ON o.users_id = u.idusers
WHERE o.users_id IS NOT NULL AND u.idusers IS NULL

UNION ALL SELECT 'orders.order_primary_id -> orders.order_id (self)', COUNT(*)
FROM orders o1
LEFT JOIN orders o2 ON o1.order_primary_id = o2.order_id
WHERE o1.order_primary_id IS NOT NULL AND o2.order_id IS NULL

UNION ALL SELECT 'stock.repuesto_id -> repuestos.idrepuestos', COUNT(*)
FROM stock s
LEFT JOIN repuestos r ON s.repuesto_id = r.idrepuestos
WHERE s.repuesto_id IS NOT NULL AND r.idrepuestos IS NULL

UNION ALL SELECT 'stock.proveedor_id -> proveedores.idproveedores', COUNT(*)
FROM stock s
LEFT JOIN proveedores p ON s.proveedor_id = p.idproveedores
WHERE s.proveedor_id IS NOT NULL AND p.idproveedores IS NULL

UNION ALL SELECT 'stock.branch_id -> branches.idbranches', COUNT(*)
FROM stock s
LEFT JOIN branches b ON s.branch_id = b.idbranches
WHERE s.branch_id IS NOT NULL AND b.idbranches IS NULL

UNION ALL SELECT 'messages.orderId -> orders.order_id', COUNT(*)
FROM messages m
LEFT JOIN orders o ON m.orderId = o.order_id
WHERE m.orderId IS NOT NULL AND o.order_id IS NULL

UNION ALL SELECT 'reducestock.stockid -> stock.idstock', COUNT(*)
FROM reducestock rs
LEFT JOIN stock s ON rs.stockid = s.idstock
WHERE rs.stockid IS NOT NULL AND s.idstock IS NULL

UNION ALL SELECT 'reducestock.stockbranch_id -> stockbranch.stockbranchid', COUNT(*)
FROM reducestock rs
LEFT JOIN stockbranch sb ON rs.stockbranch_id = sb.stockbranchid
WHERE rs.stockbranch_id IS NOT NULL AND sb.stockbranchid IS NULL

-- cobros.encargado: no está documentado, asumimos que es users.idusers por el nombre
UNION ALL SELECT 'cobros.encargado -> users.idusers (asumido)', COUNT(*)
FROM cobros c
LEFT JOIN users u ON c.encargado = u.idusers
WHERE c.encargado IS NOT NULL AND u.idusers IS NULL;
