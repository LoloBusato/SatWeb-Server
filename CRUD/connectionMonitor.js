// Endpoint interno para muestrear Threads_connected y acumular las últimas
// 100 lecturas en saved_texts['monitor-conexiones']. Pensado para Vercel
// Cron (5 min) + revisión manual antes de migrar a plan gratuito.
//
// Auth: Bearer ${CRON_SECRET}. Mismo patrón que v2 archive-overdue-tick.
// Vercel inyecta automáticamente el header Authorization cuando CRON_SECRET
// está seteado como env var en el proyecto.

const express = require('express');
const router = express.Router();
const pool = require('../database/dbConfig');

const SLUG = 'monitor-conexiones';
const MAX_ENTRIES = 100;

router.get('/tick', (req, res) => {
    const expected = process.env.CRON_SECRET;
    if (!expected) {
        return res.status(503).json({
            error: 'CRON_SECRET not set in environment',
        });
    }
    const header = req.headers.authorization;
    if (header !== `Bearer ${expected}`) {
        return res.status(401).json({ error: 'unauthorized' });
    }

    pool.getConnection((err, db) => {
        if (err) return res.status(500).json({ error: err.message });

        db.query("SHOW STATUS LIKE 'Threads_connected'", (e1, statusRows) => {
            if (e1) { db.release(); return res.status(500).json({ error: e1.message }); }

            const value = Number(statusRows?.[0]?.Value ?? 0);
            const ts = new Date().toISOString();

            db.query(
                "SELECT content FROM saved_texts WHERE slug = ? LIMIT 1",
                [SLUG],
                (e2, rows) => {
                    if (e2) { db.release(); return res.status(500).json({ error: e2.message }); }

                    // Parseamos las entries previas. Si el content no es un
                    // array JSON válido (primera corrida, content vacío,
                    // o corrupto), arrancamos de cero — no rompemos el cron.
                    let entries = [];
                    if (rows[0]?.content) {
                        try {
                            const parsed = JSON.parse(rows[0].content);
                            if (Array.isArray(parsed)) entries = parsed;
                        } catch (_) { /* ignoramos JSON inválido */ }
                    }

                    entries.push({ ts, value });
                    if (entries.length > MAX_ENTRIES) {
                        entries = entries.slice(-MAX_ENTRIES);
                    }
                    const newContent = JSON.stringify(entries);

                    db.query(
                        `INSERT INTO saved_texts (slug, content) VALUES (?, ?)
                         ON DUPLICATE KEY UPDATE content = VALUES(content)`,
                        [SLUG, newContent],
                        (e3) => {
                            db.release();
                            if (e3) return res.status(500).json({ error: e3.message });
                            return res.status(200).json({
                                ok: true,
                                ts,
                                value,
                                total: entries.length,
                            });
                        },
                    );
                },
            );
        });
    });
});

module.exports = router;
