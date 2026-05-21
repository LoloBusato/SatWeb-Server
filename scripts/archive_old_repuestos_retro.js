// Retroactivo: convierte filas de `reducestock` de órdenes ENTREGADO
// hace > 6 meses en mensajes "[Archivo] Repuestos usados: ..." y
// borra las filas. Mismo criterio que OrderRepository.archiveOldRepuestos
// (el cron diario), pero aplicado de una sola pasada al backlog histórico.
//
// SEGURIDAD:
//   - Dry-run por defecto. Hay que pasar --execute explícitamente.
//   - Cada orden se procesa en su propia transacción (commit/rollback
//     según --execute). Si una orden falla, sigue con la siguiente.
//
// OPTIMIZACIÓN:
//   - Una sola query trae TODOS los items de TODAS las órdenes elegibles,
//     agrupado por (orderid, idstock). Se agrupa en JS — evitamos
//     N round-trips contra Clever Cloud (latencia transatlántica).
//
// Uso:
//   node scripts/archive_old_repuestos_retro.js               (dry-run)
//   node scripts/archive_old_repuestos_retro.js --execute     (commit real)

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const mysql = require('mysql2/promise');

const EXECUTE = process.argv.includes('--execute');
const MONTHS = 6;

(async () => {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST, port: process.env.DB_PORT,
        user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD,
        database: process.env.DB_DBNAME,
    });
    console.log(`Conectado a ${process.env.DB_HOST}/${process.env.DB_DBNAME}`);
    console.log(`Modo: ${EXECUTE ? '🔴 EXECUTE (COMMIT real)' : '🟢 DRY-RUN (rollback por orden)'}`);
    console.log(`Umbral: ENTREGADO con returned_at < NOW() - ${MONTHS} meses\n`);

    try {
        // Paso 1: órdenes elegibles
        const [eligible] = await conn.query(`
            SELECT o.order_id AS id
            FROM orders o
            JOIN states s ON s.idstates = o.state_id
            WHERE s.state = 'ENTREGADO'
              AND o.returned_at IS NOT NULL
              AND o.returned_at < DATE_SUB(NOW(), INTERVAL ? MONTH)
              AND EXISTS (SELECT 1 FROM reducestock rs WHERE rs.orderid = o.order_id)
            ORDER BY o.order_id
        `, [MONTHS]);

        if (eligible.length === 0) {
            console.log('No hay órdenes elegibles.');
            return;
        }

        const orderIds = eligible.map(r => r.id);
        console.log(`Órdenes elegibles: ${orderIds.length}`);

        // Paso 2: batch fetch de TODOS los items, una sola roundtrip
        const [allItems] = await conn.query(`
            SELECT
                rs.orderid                              AS orderid,
                r.repuesto                              AS repuesto,
                s.idstock                               AS idstock,
                CAST(s.precio_compra AS DECIMAL(10,2))  AS precio_compra,
                p.nombre                                AS proveedor,
                COUNT(*)                                AS cantidad
            FROM reducestock rs
            LEFT JOIN stockbranch sb ON sb.stockbranchid = rs.stockbranch_id
            JOIN stock s             ON s.idstock = COALESCE(rs.stockid, sb.stock_id)
            JOIN repuestos r         ON r.idrepuestos = s.repuesto_id
            LEFT JOIN proveedores p  ON p.idproveedores = s.proveedor_id
            WHERE rs.orderid IN (?)
            GROUP BY rs.orderid, s.idstock, r.repuesto, s.precio_compra, p.nombre
            ORDER BY rs.orderid, r.repuesto
        `, [orderIds]);

        console.log(`Filas agrupadas (orden, idstock): ${allItems.length}`);

        // Paso 3: agrupar en JS por orderid
        const byOrder = new Map();
        for (const it of allItems) {
            if (!byOrder.has(it.orderid)) byOrder.set(it.orderid, []);
            byOrder.get(it.orderid).push(it);
        }

        // Paso 4: total de filas de reducestock que se van a borrar
        const [delCount] = await conn.query(`
            SELECT COUNT(*) AS n FROM reducestock WHERE orderid IN (?)
        `, [orderIds]);
        const totalReducestock = delCount[0].n;
        console.log(`Filas reducestock a borrar (total): ${totalReducestock}\n`);

        // Paso 5: mostrar 3 mensajes de muestra (primeras 3 órdenes)
        console.log('--- Muestras (primeras 3 órdenes) ---');
        let sampleCount = 0;
        for (const oid of orderIds) {
            if (sampleCount >= 3) break;
            const items = byOrder.get(oid) || [];
            const partes = items.map(it => {
                const precio = Number(it.precio_compra ?? 0).toFixed(0);
                const prov = it.proveedor ?? 'sin proveedor';
                return `${it.repuesto.trim()} x${it.cantidad} ($${precio} - ${prov})`;
            });
            const mensaje = partes.length > 0
                ? `[Archivo] Repuestos usados: ${partes.join(', ')}`
                : `[Archivo] Repuestos usados: (no se pudo resolver el detalle — reducestock huérfano)`;
            console.log(`  orden #${oid}: ${mensaje}`);
            sampleCount++;
        }
        console.log('--- fin muestras ---\n');

        // Paso 6: procesar cada orden (commit o rollback según EXECUTE)
        let processed = 0;
        let messagesInserted = 0;
        let reducestockDeleted = 0;
        let errors = 0;
        const startedAt = Date.now();

        for (const oid of orderIds) {
            const items = byOrder.get(oid) || [];
            const partes = items.map(it => {
                const precio = Number(it.precio_compra ?? 0).toFixed(0);
                const prov = it.proveedor ?? 'sin proveedor';
                return `${it.repuesto.trim()} x${it.cantidad} ($${precio} - ${prov})`;
            });
            const mensaje = partes.length > 0
                ? `[Archivo] Repuestos usados: ${partes.join(', ')}`
                : `[Archivo] Repuestos usados: (no se pudo resolver el detalle — reducestock huérfano)`;

            try {
                await conn.beginTransaction();
                await conn.query(`
                    INSERT INTO messages (message, username, created_at, orderId)
                    VALUES (?, 'Sistema', CONVERT_TZ(NOW(), '+00:00', '-03:00'), ?)
                `, [mensaje, oid]);
                const [del] = await conn.query(
                    `DELETE FROM reducestock WHERE orderid = ?`,
                    [oid]
                );
                if (EXECUTE) {
                    await conn.commit();
                } else {
                    await conn.rollback();
                }
                messagesInserted += 1;
                reducestockDeleted += del.affectedRows ?? 0;
            } catch (err) {
                try { await conn.rollback(); } catch (_) {}
                errors += 1;
                console.error(`  ❌ orden #${oid}: ${err.message}`);
            }

            processed += 1;
            if (processed % 250 === 0) {
                const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
                console.log(`  ... ${processed}/${orderIds.length} (${elapsed}s)`);
            }
        }

        const totalSec = ((Date.now() - startedAt) / 1000).toFixed(1);
        console.log(`\nResultado:`);
        console.log(`  Procesadas              : ${processed}`);
        console.log(`  Mensajes insertados     : ${messagesInserted}`);
        console.log(`  reducestock borrados    : ${reducestockDeleted}`);
        console.log(`  Errores                 : ${errors}`);
        console.log(`  Tiempo                  : ${totalSec}s`);
        console.log(EXECUTE
            ? `\n✅ COMMIT — cambios persistidos.`
            : `\n🟢 DRY-RUN — rollback por orden, nada cambió. Pasá --execute para commitear.`);
    } catch (err) {
        console.error('\n❌ Error global:', err.message);
        process.exitCode = 1;
    } finally {
        await conn.end();
    }
})();
