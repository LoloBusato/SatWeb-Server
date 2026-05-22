// Normaliza la columna clients.phone al formato +54XXXXXXXXXX.
//
// Reglas (en orden):
//   1. Limpiar espacios, guiones, paréntesis y puntos.
//   2. Si empieza con "+54" → mantener (+54 + dígitos).
//   3. Si empieza con "54"  → prefijar "+".
//   4. 10 dígitos empezando con "11" → "+54" + número.
//   5. 10 dígitos empezando con "15" → "+549" + 8 dígitos restantes.
//   6. 10 dígitos cualquier otro     → "+54" + número.
//   7. < 8 dígitos o caracteres raros → INVÁLIDO, se deja como está.
//
// SEGURIDAD:
//   - Dry-run por defecto. Hay que pasar --execute explícitamente.
//   - --execute corre todos los UPDATE en una transacción única, commit
//     al final. Si algo falla → ROLLBACK completo.
//
// Uso:
//   node scripts/normalize_phones.js               (dry-run)
//   node scripts/normalize_phones.js --execute     (commit real)

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const mysql = require('mysql2/promise');

const EXECUTE = process.argv.includes('--execute');

function normalize(raw) {
    const trimmed = (raw ?? '').trim();
    if (!trimmed) return { result: trimmed, status: 'empty' };

    // Limpiamos separadores típicos pero preservamos el + inicial.
    const cleaned = trimmed.replace(/[\s\-().]/g, '');

    if (cleaned.startsWith('+54')) {
        const rest = cleaned.slice(3);
        if (!/^[0-9]+$/.test(rest)) return { result: trimmed, status: 'invalid' };
        return { result: '+54' + rest };
    }
    if (cleaned.startsWith('54')) {
        const rest = cleaned.slice(2);
        if (!/^[0-9]+$/.test(rest)) return { result: trimmed, status: 'invalid' };
        return { result: '+54' + rest };
    }
    if (!/^[0-9]+$/.test(cleaned)) {
        return { result: trimmed, status: 'invalid' };
    }
    if (cleaned.length === 10) {
        if (cleaned.startsWith('11')) return { result: '+54' + cleaned };
        if (cleaned.startsWith('15')) return { result: '+549' + cleaned.slice(2) };
        return { result: '+54' + cleaned };
    }
    return { result: trimmed, status: 'invalid' };
}

(async () => {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST, port: process.env.DB_PORT,
        user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD,
        database: process.env.DB_DBNAME,
    });
    console.log(`Conectado a ${process.env.DB_HOST}/${process.env.DB_DBNAME}`);
    console.log(`Modo: ${EXECUTE ? '🔴 EXECUTE (COMMIT)' : '🟢 DRY-RUN (rollback)'}\n`);

    try {
        const [rows] = await conn.query(`
            SELECT idclients, phone FROM clients
            WHERE phone IS NOT NULL AND phone != ''
        `);
        console.log(`Clientes con teléfono no vacío: ${rows.length}`);

        const toUpdate = [];        // [idclients, oldPhone, newPhone]
        const invalid  = [];        // [idclients, phone]
        let noop = 0;

        for (const r of rows) {
            const { result, status } = normalize(r.phone);
            if (status === 'invalid') {
                invalid.push([r.idclients, r.phone]);
            } else if (result === r.phone) {
                noop += 1;
            } else {
                toUpdate.push([r.idclients, r.phone, result]);
            }
        }
        console.log(`  Ya normalizados (no-op): ${noop}`);
        console.log(`  Para actualizar       : ${toUpdate.length}`);
        console.log(`  Inválidos (se dejan)  : ${invalid.length}`);

        // Muestras
        console.log('\n--- 8 muestras de cambios ---');
        for (const [id, oldP, newP] of toUpdate.slice(0, 8)) {
            console.log(`  #${String(id).padEnd(6)} ${JSON.stringify(oldP).padEnd(30)} → ${JSON.stringify(newP)}`);
        }
        console.log('\n--- 8 muestras de inválidos ---');
        for (const [id, oldP] of invalid.slice(0, 8)) {
            console.log(`  #${String(id).padEnd(6)} ${JSON.stringify(oldP)}`);
        }

        if (toUpdate.length === 0) {
            console.log('\nNada para actualizar.');
            return;
        }

        await conn.beginTransaction();
        try {
            for (const [id, , newP] of toUpdate) {
                await conn.execute(
                    'UPDATE clients SET phone = ? WHERE idclients = ?',
                    [newP, id]
                );
            }
            if (EXECUTE) {
                await conn.commit();
                console.log(`\n✅ COMMIT — ${toUpdate.length} clientes actualizados.`);
            } else {
                await conn.rollback();
                console.log(`\n🟢 ROLLBACK — dry-run, nada cambió. Pasá --execute para commitear.`);
            }
        } catch (err) {
            await conn.rollback();
            console.error('\n❌ Error — ROLLBACK automático:', err.message);
            process.exitCode = 1;
        }
    } finally {
        await conn.end();
    }
})();
