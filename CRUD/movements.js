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
    const qgetMovements = "SELECT idmovements, movname_id, unidades, categories FROM movements JOIN movcategories ON movcategories_id = idmovcategories WHERE branch_id = ? ORDER BY idmovements DESC";
    
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
  router.put("/:id", (req, res) => {

    pool.getConnection((err, db) => {
      if (err) return res.status(500).send(err);
    
      db.beginTransaction(err => {
        try {
          const moveId = req.params.id;
          const { arrayInsert, total, cobrosValues } = req.body;
          const movCatId = 0
          const unidades = 1
          const movNameId = 2
          const branch_id = 3
          const values = arrayInsert.map(element => [element[movCatId], element[unidades], element[movNameId], element[branch_id]]);
          const qDeleteMove = "DELETE FROM movements WHERE movname_id = ? AND movcategories_id IN (SELECT idmovcategories FROM movcategories WHERE categories IN ('Pesos', 'Dolares', 'Banco', 'MercadoPago', 'Encargado'));";
          const qCreateMove = "INSERT INTO movements (movcategories_id, unidades, movname_id, branch_id) VALUES ?";
          
          db.query(qDeleteMove, [moveId], (err, data) => {
            if (err) throw err

            db.query(qCreateMove, [values], (err, data) => {
              if (err) throw err
            });
          });

          const qUpdateMonto = "UPDATE movname SET `monto` = ? WHERE idmovname = ?"
          db.query(qUpdateMonto, [total, moveId], (err, data) => {
            if (err) throw err
          })

          const qUpdateCobro = "UPDATE cobros SET `pesos` = ?, `dolares` = ?, `banco` = ?, `mercado_pago` = ?, `encargado` = ?"
          db.query(qUpdateCobro, cobrosValues, (err, data) => {
            if (err) throw err
          })

          db.commit(err => {
            if (err) {
              return db.rollback(() => {
                db.release()
                return res.status(500).send('Error al realizar commit');
              });
            }
            db.release()
            return res.status(200).json('Movimineto actualizado con exito');
          });
        } catch (err) {
          db.rollback(() => {
            db.release()
            return res.status(500).send('Error en la transacción');
          });
        }
      })
    })
  })

  module.exports = router