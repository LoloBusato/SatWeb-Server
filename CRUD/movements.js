const express = require('express');
const router = express.Router();

// Agregar base de datos
const db = require('../database/dbConfig');
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

  db.query(qCreateMove, [values], (err, data) => {
    if (err) {
      console.log("error: ", err);
      return res.status(400).send("No se pudieron agregar los movimientos.");
    }
    return res.status(200).send("Movimientos ingresados correctamente");
  });
});
  // read
  router.get("/:id", (req, res) => {
    const moveId = req.params.id;
    const qgetMovements = "SELECT idmovements, movname_id, unidades, categories FROM movements JOIN movcategories ON movcategories_id = idmovcategories WHERE branch_id = ? ORDER BY idmovements DESC";
    db.query(qgetMovements, [moveId], (err, data) => {
      if (err) {
        console.log(err);
        return res.status(400).json(err);
      }
      return res.status(200).json(data);
    });
  })
  // update
  router.put("/:id", (req, res) => {

    db.beginTransaction(err => {
      try {
        const moveId = req.params.id;

        const { arrayInsert } = req.body;
        const movCatId = 0
        const unidades = 1
        const movNameId = 2
        const branch_id = 3
        const values = arrayInsert.map(element => [element[movCatId], element[unidades], element[movNameId], element[branch_id]]);

        const qDeleteMove = "DELETE FROM movements WHERE movname_id = ? AND movcategories_id IN (SELECT idmovcategories FROM movcategories WHERE categories IN ('Pesos', 'Dolares', 'Banco', 'MercadoPago', 'Encargado'));";
        const qCreateMove = "INSERT INTO movements (movcategories_id, unidades, movname_id, branch_id) VALUES ?";
        db.query(qDeleteMove, [moveId], (err, data) => {
          if (err) {
            throw err
          }
          db.query(qCreateMove, [values], (err, data) => {
            if (err) {
              throw err
            }
          });
        });

        db.commit(err => {
          if (err) {
            return db.rollback(() => {
              console.error('Error al hacer commit:', err);
              return res.status(500).send('Error al realizar commit');
            });
          }
        });
      } catch (err) {
        db.rollback(() => {
          console.error('Error en la transacción:', err);
          return res.status(500).send('Error en la transacción');
        });
      }
    })
  })

  module.exports = router