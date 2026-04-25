const express = require('express');
const router = express.Router();

// Agregar base de datos
const pool = require('../database/dbConfig');
/*-----------------CREACION DE MOVIMIENTOS--------------- */
// CRUD de movimientos
// create
router.post('/', async (req, res) => {
  const { arrayInsert } = req.body;
  const movCatId = 0
  const unidades = 1
  const movNameId = 2
  const branch_id = 3
  const values = arrayInsert.map(element => [element[movCatId], element[unidades], element[movNameId], element[branch_id]]);
  const qCreateMove = "INSERT INTO movements (movcategories_id, unidades, movname_id, branch_id) VALUES ?";

  pool.getConnection((err, db) => {
    if (err) return res.status(500).send(err);
    
    db.query(qCreateMove, [values], (err, data) => {
      db.release()
      if (err) return res.status(500).send(err);
      return res.status(200).json(data)
    });
  })
});
  // read
  router.get("/:id", (req, res) => {
    const moveId = req.params.id;
    const qgetMovements = "SELECT * FROM movements JOIN movcategories ON movcategories_id = idmovcategories WHERE movements.branch_id = ? ORDER BY idmovements DESC";
    
    pool.getConnection((err, db) => {
      if (err) return res.status(500).send(err);
      
      db.query(qgetMovements, [moveId], (err, data) => {
        db.release()
        if (err) return res.status(500).send(err);
        return res.status(200).json(data)
      });
    })
  })
  // update
  // Reescribe la operación completa en una transacción atómica.
  // ANTES: solo se borraban e insertaban movements de tipo Cuentas (cajas);
  // los movements del lado P&L (Reparaciones/Venta/CMV/etc.) quedaban intactos
  // y la operación quedaba desbalanceada (1097 casos rotos en prod).
  // ADEMÁS: el commit no esperaba al INSERT por callbacks sin encadenar.
  // AHORA: usa mysql2.promise().query con await, borra TODOS los movements
  // del movname y reinserta los del frontend (cajas + lado P&L).
  router.put("/:id", async (req, res) => {
    const moveId = req.params.id;
    const { arrayInsert, montoTotal } = req.body;
    if (!Array.isArray(arrayInsert) || arrayInsert.length === 0) {
      return res.status(400).send('arrayInsert vacío');
    }

    const movCatId = 0, unidades = 1, movNameId = 2, branch_id = 3;
    const values = arrayInsert.map(e => [e[movCatId], e[unidades], e[movNameId], e[branch_id]]);

    pool.getConnection(async (err, dbCb) => {
      if (err) return res.status(500).send(err);
      const db = dbCb.promise();
      try {
        await db.beginTransaction();
        await db.query("DELETE FROM movements WHERE movname_id = ?", [moveId]);
        await db.query("INSERT INTO movements (movcategories_id, unidades, movname_id, branch_id) VALUES ?", [values]);
        if (montoTotal !== undefined) {
          await db.query("UPDATE movname SET `monto` = ? WHERE idmovname = ?", [montoTotal, moveId]);
        }
        await db.commit();
        dbCb.release();
        return res.status(200).json('Movimiento actualizado con exito');
      } catch (e) {
        try { await db.rollback(); } catch (_) {}
        dbCb.release();
        return res.status(500).send(e?.message || 'Error en la transacción');
      }
    });
  })

  module.exports = router