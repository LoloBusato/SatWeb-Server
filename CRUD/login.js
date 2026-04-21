// LOGIN de usuarios (legacy). Acepta tanto passwords en texto plano
// (modo histórico) como hashes bcrypt, para convivir con el nuevo
// /api/v2/auth/login que migra passwords al primer login exitoso.
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');

const pool = require('../database/dbConfig');

router.post('/', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).send('Creedenciales incorrectas');
  }

  const q =
    'SELECT idusers, username, password, grupos_id, branch_id, permisos, grupo, user_color ' +
    'FROM users ' +
    'JOIN branches ON users.branch_id = branches.idbranches ' +
    'JOIN grupousuarios ON users.grupos_id = grupousuarios.idgrupousuarios ' +
    'WHERE username = ? AND users.deleted_at IS NULL';

  pool.getConnection((err, db) => {
    if (err) return res.status(500).send(err);

    db.query(q, [username], async (err, data) => {
      db.release();
      if (err) return res.status(500).send(err);
      if (!data || data.length === 0) {
        return res.status(400).send('Creedenciales incorrectas');
      }

      const row = data[0];
      const stored = row.password;
      const isBcrypt =
        typeof stored === 'string' && stored.length === 60 && stored.startsWith('$2');

      let ok = false;
      try {
        ok = isBcrypt ? await bcrypt.compare(password, stored) : stored === password;
      } catch (e) {
        return res.status(500).send(e);
      }

      if (!ok) {
        return res.status(400).send('Creedenciales incorrectas');
      }

      delete row.password;
      return res.status(200).send([row]);
    });
  });
});

module.exports = router;
