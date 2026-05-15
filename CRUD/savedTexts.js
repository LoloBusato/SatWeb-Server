// Tabla clave-valor `saved_texts (slug, content, updated_at)` para textos
// persistentes consumidos desde el asset estático /lista-precios.html.
// Sin auth: lo consume un HTML servido por Netlify (no hay token JWT en
// localStorage en ese contexto). Asumimos uso interno — si en el futuro
// se expone público hay que sumar Bearer y rate limit.
//
// Migration: scripts/apply_saved_texts.js + slug 'nuestros-usados' seedeado.

const express = require('express');
const router = express.Router();
const pool = require('../database/dbConfig');

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,98}[a-z0-9]$/;

// GET /:slug → { slug, content, updated_at } o 404 si no existe el slug.
router.get('/:slug', (req, res) => {
  const { slug } = req.params;
  if (!SLUG_RE.test(slug)) return res.status(400).json({ error: 'invalid_slug' });

  pool.getConnection((err, db) => {
    if (err) return res.status(500).send(err);
    db.query(
      'SELECT slug, content, updated_at FROM saved_texts WHERE slug = ? LIMIT 1',
      [slug],
      (err2, rows) => {
        db.release();
        if (err2) return res.status(500).send(err2);
        if (!rows[0]) return res.status(404).json({ error: 'not_found' });
        return res.status(200).json(rows[0]);
      },
    );
  });
});

// PUT /:slug body { content } → upsert. Devuelve el row final con el
// updated_at server-side (lo bumpea el ON UPDATE CURRENT_TIMESTAMP del
// schema). Si el slug no existe se crea — así el frontend no se rompe
// si alguien borró la fila o uso un slug nuevo.
router.put('/:slug', (req, res) => {
  const { slug } = req.params;
  if (!SLUG_RE.test(slug)) return res.status(400).json({ error: 'invalid_slug' });
  const content = typeof req.body?.content === 'string' ? req.body.content : '';

  pool.getConnection((err, db) => {
    if (err) return res.status(500).send(err);
    db.query(
      `INSERT INTO saved_texts (slug, content) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE content = VALUES(content)`,
      [slug, content],
      (err2) => {
        if (err2) { db.release(); return res.status(500).send(err2); }
        db.query(
          'SELECT slug, content, updated_at FROM saved_texts WHERE slug = ? LIMIT 1',
          [slug],
          (err3, rows) => {
            db.release();
            if (err3) return res.status(500).send(err3);
            return res.status(200).json(rows[0]);
          },
        );
      },
    );
  });
});

module.exports = router;
