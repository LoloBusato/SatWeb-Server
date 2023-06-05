const express = require('express');
const router = express.Router();

// Agregar base de datos
const db = require('../database/dbConfig');
/*-----------------CREACION DE MOVIMIENTOS--------------- */
// CRUD de movimientos
// create
router.post('/', async (req, res) => {
  const { arrayInsert } = req.body;

  // arrayInsert = [[movCategoriesId, unidades, movnameId], [movCategoriesId, unidades, movnameId], ...]

  const values = arrayInsert.map(element => [element[0], element[1], element[2]]);

  const qCreateMove = "INSERT INTO movements (movcategories_id, unidades, movname_id) VALUES ?";

  db.query(qCreateMove, [values], (err, data) => {
    if (err) {
      console.log("error: ", err);
      return res.status(400).send("No se pudieron agregar los movimientos.");
    }
    return res.status(200).send("Movimientos ingresados correctamente");
  });
});
  // read
  router.get("/", (req, res) => {
    const qgetMovements = "SELECT idmovements, movname_id, unidades, categories FROM satweb.movements JOIN movcategories ON movcategories_id = idmovcategories;";
    db.query(qgetMovements, (err, data) => {
      if (err) {
        console.log(err);
        return res.status(400).json(err);
      }
      return res.status(200).json(data);
    });
  })
  // update
  router.put("/:id", (req, res) => {
    const moveId = req.params.id;
    const { accountId, movCategoriesId, userId, movement, valueUsd, valuePesos, valueTrans, valueMp } = req.body;
  
    const values = [

    ]
    const qupdateMovement = "UPDATE movements SET `accountId` = ?, `movCategoriesId` = ?, `userId` = ?, `movement` = ?, `valueUsd` = ?, `valuePesos` = ?, `valueTrans` = ?, `valueMp` = ? WHERE idmovements = ?";
    db.query(qupdateMovement, [...values, moveId], (err, data) => {
        if (err) return res.status(400).send(err);
        return res.status(200).json(data);
    }); 
  })
  // delete
  router.delete("/:id", (req, res) => {
    const moveId = req.params.id;
    const qdeleteMovement = " DELETE FROM movements WHERE idmovements = ? ";
  
    db.query(qdeleteMovement, [moveId], (err, data) => {
      if (err) return res.status(400).send(err);
      return res.status(200).json(data);
    });
  })

  module.exports = router