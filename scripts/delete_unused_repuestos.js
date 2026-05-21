// Borra los 188 tipos de repuesto (venta=0) que nunca fueron asignados
// a una orden. Resuelto vía reducestock por ambos caminos (legacy
// stockid + actual stockbranch_id).
//
// SEGURIDAD:
//   - Dry-run por defecto. Hay que pasar --execute explícitamente.
//   - Dry-run abre transacción, hace todos los DELETE para contar
//     affectedRows, y al final hace ROLLBACK → no toca nada.
//   - En modo --execute, COMMIT al final. Si cualquier paso falla,
//     ROLLBACK automático en el catch.
//
// Orden de borrado (chequeado contra information_schema.KEY_COLUMN_USAGE):
//   1) repuestosdevices.repuestos_id  → FK_repuestos_repuestosdevices  (158 filas)
//   2) stockbranch.stock_id           → stock_id_fkey                  (284 filas)
//   3) stock.repuesto_id              → fk_stock_repuesto              (267 filas)
//   4) repuestos.idrepuestos          → la base                        (188 filas)
//
// Verificado libre de FKs:
//   - reducestock.stockid + stockbranch_id (0 ref — por definición de la query)
//   - garantia.stock_id (0)
//   - stock_images.stock_id (0)
//
// Uso:
//   node scripts/delete_unused_repuestos.js               (dry-run)
//   node scripts/delete_unused_repuestos.js --execute     (commit real)

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const mysql = require('mysql2/promise');

const EXECUTE = process.argv.includes('--execute');

(async () => {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST, port: process.env.DB_PORT,
        user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD,
        database: process.env.DB_DBNAME,
    });
    console.log(`Conectado a ${process.env.DB_HOST}/${process.env.DB_DBNAME}`);
    console.log(`Modo: ${EXECUTE ? '🔴 EXECUTE (COMMIT real)' : '🟢 DRY-RUN (rollback al final)'}\n`);

    try {
        // Recalcular el conjunto de targets dentro de la misma conexión
        // así no hay drift entre lo que vimos antes y lo que se borra.
        const [targetRows] = await conn.query(`
            SELECT DISTINCT r.idrepuestos
            FROM repuestos r
            JOIN stock s        ON s.repuesto_id = r.idrepuestos
            JOIN stockbranch sb ON sb.stock_id   = s.idstock
            WHERE r.venta = 0
              AND r.idrepuestos NOT IN (
                SELECT s2.repuesto_id FROM stock s2 JOIN reducestock rs ON rs.stockid = s2.idstock
                UNION
                SELECT s3.repuesto_id FROM stock s3
                  JOIN stockbranch sb3 ON sb3.stock_id      = s3.idstock
                  JOIN reducestock rs2 ON rs2.stockbranch_id = sb3.stockbranchid
              )
              AND sb.cantidad_restante > 0
        `);
        const targetIds = targetRows.map(r => r.idrepuestos);
        if (targetIds.length === 0) {
            console.log('Nada para borrar.');
            return;
        }
        console.log(`Targets: ${targetIds.length} repuestos`);

        // Defensa contra cambios en el universo de targets — si difiere
        // de 188 (lo que vimos al armar el script) avisamos pero no
        // abortamos. El --execute es manual y consciente.
        if (targetIds.length !== 188) {
            console.warn(`⚠️ count cambió: esperado 188, obtenido ${targetIds.length}. Revisar antes de --execute.`);
        }

        await conn.beginTransaction();

        const [r1] = await conn.query(
            'DELETE FROM repuestosdevices WHERE repuestos_id IN (?)',
            [targetIds]
        );
        console.log(`1) repuestosdevices borrados : ${r1.affectedRows}`);

        const [r2] = await conn.query(
            `DELETE sb FROM stockbranch sb
             JOIN stock s ON s.idstock = sb.stock_id
             WHERE s.repuesto_id IN (?)`,
            [targetIds]
        );
        console.log(`2) stockbranch borrados      : ${r2.affectedRows}`);

        const [r3] = await conn.query(
            'DELETE FROM stock WHERE repuesto_id IN (?)',
            [targetIds]
        );
        console.log(`3) stock borrados            : ${r3.affectedRows}`);

        const [r4] = await conn.query(
            'DELETE FROM repuestos WHERE idrepuestos IN (?)',
            [targetIds]
        );
        console.log(`4) repuestos borrados        : ${r4.affectedRows}`);

        if (EXECUTE) {
            await conn.commit();
            console.log('\n✅ COMMIT — cambios persistidos.');
        } else {
            await conn.rollback();
            console.log('\n🟢 ROLLBACK — dry-run, nada cambió. Pasá --execute para commitear.');
        }
    } catch (err) {
        try { await conn.rollback(); } catch (_) {}
        console.error('\n❌ Error — ROLLBACK automático:', err.message);
        process.exitCode = 1;
    } finally {
        await conn.end();
    }
})();
