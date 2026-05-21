// Read-only: estima qué se puede limpiar de la DB sin perder información
// importante. Sólo cuenta — no borra nada.
//
// Nota: movname.fecha es VARCHAR legacy "d/m/yyyy H:M:S". Para comparar
// con un cutoff temporal hay que parsearla con STR_TO_DATE.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const mysql = require('mysql2/promise');

(async () => {
    const c = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        user: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_DBNAME,
    });
    console.log(`Conectado a ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_DBNAME}\n`);

    const [msgEntregado] = await c.query(`
        SELECT COUNT(*) AS cantidad,
               ROUND(SUM(LENGTH(message)) / 1024 / 1024, 2) AS tamanio_mb
        FROM messages m
        JOIN orders o ON m.orderId = o.order_id
        JOIN states s ON o.state_id = s.idstates
        WHERE s.state = 'ENTREGADO'
          AND o.returned_at < DATE_SUB(NOW(), INTERVAL 2 YEAR)
    `);
    console.log("1) Mensajes de órdenes ENTREGADO > 2 años:");
    console.table(msgEntregado);

    const [msgIncucai] = await c.query(`
        SELECT COUNT(*) AS cantidad,
               ROUND(SUM(LENGTH(message)) / 1024 / 1024, 2) AS tamanio_mb
        FROM messages m
        JOIN orders o ON m.orderId = o.order_id
        JOIN states s ON o.state_id = s.idstates
        WHERE s.state = 'INCUCAI'
          AND o.state_changed_at < DATE_SUB(NOW(), INTERVAL 2 YEAR)
    `);
    console.log("\n2) Mensajes de órdenes INCUCAI > 2 años:");
    console.table(msgIncucai);

    const [reduceOld] = await c.query(`
        SELECT COUNT(*) AS cantidad
        FROM reducestock r
        JOIN orders o ON r.orderid = o.order_id
        JOIN states s ON o.state_id = s.idstates
        WHERE s.state = 'ENTREGADO'
          AND o.returned_at < DATE_SUB(NOW(), INTERVAL 2 YEAR)
    `);
    console.log("\n3) ReduceStock de órdenes ENTREGADO > 2 años:");
    console.table(reduceOld);

    // movname.fecha es VARCHAR "d/m/yyyy H:M:S" — comparación por
    // STR_TO_DATE, no string. Si STR_TO_DATE devuelve NULL (fecha
    // corrupta), la fila NO matchea, así que es safe.
    const [movnameOld] = await c.query(`
        SELECT COUNT(*) AS movname_cantidad
        FROM movname
        WHERE STR_TO_DATE(fecha, '%d/%m/%Y %H:%i:%s') < DATE_SUB(NOW(), INTERVAL 3 YEAR)
    `);
    const [movementsOld] = await c.query(`
        SELECT COUNT(*) AS movements_cantidad
        FROM movements mv
        JOIN movname mn ON mn.idmovname = mv.movname_id
        WHERE STR_TO_DATE(mn.fecha, '%d/%m/%Y %H:%i:%s') < DATE_SUB(NOW(), INTERVAL 3 YEAR)
    `);
    console.log("\n4) movname > 3 años + movements vinculados:");
    console.table([
        { table: 'movname', rows: movnameOld[0].movname_cantidad },
        { table: 'movements (FK)', rows: movementsOld[0].movements_cantidad },
    ]);

    const [ordersByYear] = await c.query(`
        SELECT YEAR(created_at) AS anio, COUNT(*) AS cantidad
        FROM orders
        GROUP BY YEAR(created_at)
        ORDER BY anio
    `);
    console.log("\n5) Órdenes por año:");
    console.table(ordersByYear);

    // Bonus: tamaño actual vs estimación post-cleanup
    const [totalSize] = await c.query(`
        SELECT
          ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS total_mb
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
    `);
    console.log("\n6) Tamaño actual total:");
    console.table(totalSize);

    await c.end();
})();
