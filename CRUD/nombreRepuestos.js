const express = require('express');
const router = express.Router();

// Agregar base de datos
const db = require('../database/dbConfig');
/* ------------------------------------------------------------- */
// CRUD de nombres de repuestos
// create
router.post('/', async (req, res) => {
    const { nombreRepuestos } = req.body;
  
    const qInsertNombreRepuestos = "INSERT INTO nombres_repuestos (nombre_repuestos) VALUES (?)";
    db.query(qInsertNombreRepuestos, [nombreRepuestos], (err, data) => {
        if (err) {
            console.log("error: ", err);
            return res.status(400).send(err);
        }
        return res.status(200).send(data);
    });    
  });
  // read
  router.get("/", (req, res) => {
    const qGetNombreRepuestos = "SELECT * FROM nombres_repuestos ORDER BY nombre_repuestos";
    db.query(qGetNombreRepuestos, (err, data) => {
      if (err) {
        console.log(err);
        return res.status(400).json(err);
      }
      return res.status(200).json(data);
    });
  })
  // update
  router.put("/:id", (req, res) => {
    const NombresRepuestosId = req.params.id;
    const qupdateNombresRepuestos = "UPDATE nombres_repuestos SET `nombre_repuestos`= ? WHERE nombres_repuestos_id = ?";
  
    const { nombreRepuestos } = req.body;
  
    db.query(qupdateNombresRepuestos, [nombreRepuestos,NombresRepuestosId], (err, data) => {
        if (err) return res.status(400).send(err);
        return res.status(200).json(data);
    });
  })
  // delete
  router.delete("/:id", (req, res) => {
    const NombresRepuestosId = req.params.id;
    const qdeleteNombresRepuestos = " DELETE FROM nombres_repuestos WHERE nombres_repuestos_id = ? ";
  
    db.query(qdeleteNombresRepuestos, [NombresRepuestosId], (err, data) => {
        if (err) return res.status(400).send(err);
        return res.status(200).json(data);
    });
  })
  /* ------------------------------------------------------------- */

  module.exports = router  