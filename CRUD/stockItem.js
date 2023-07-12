const express = require('express');
const router = express.Router();

// Agregar base de datos
const db = require('../database/dbConfig');
/*-----------------CREACION DE SISTEMA DE REPUESTOS----------------- */
// create
router.post("/", (req, res) => {
    const { repuesto, cantidad_limite } = req.body;
    const values = [
      repuesto,
      cantidad_limite
    ]
    const qCreateItem = "INSERT INTO repuestos (repuesto, cantidad_limite) VALUES (?, ?)";
    db.query(qCreateItem, values, (err, data) => {
      if (err) {
        console.log("error: ", err);
        return res.status(400).send("No se pudo agregar el repuesto.");
      }
      return res.status(200).send(data);
    });    
  })
  // read
  router.get("/", (req, res) => {
    const qgetItem = "SELECT * FROM repuestos ORDER BY repuesto";
    db.query(qgetItem, (err, result) => {
      if (err) {
        console.error(err);
        return res.status(500).send('Error al obtener la lista de repuestos');
      } else {
        return res.status(200).send(result);
      }
    });
  })
  // update
  router.put("/:id", (req, res) => {
    const itemId = req.params.id;
    const qupdateItem = "UPDATE repuestos SET `repuesto` = ?, `cantidad_limite` = ? WHERE idrepuestos = ?";
    const { repuesto, cantidad_limite } = req.body;
    const values = [
      repuesto,
      cantidad_limite
    ]
    
    db.query(qupdateItem, [...values,itemId], (err, data) => {
      if (err) return res.status(400).send(err);
      return res.status(200).json(data);
    });
  })
  // delete
  router.delete("/:id", (req, res) => {
    const itemId = req.params.id;
    const qdeleteItem = " DELETE FROM repuestos WHERE idrepuestos = ? ";
  
    db.query(qdeleteItem, [itemId], (err, data) => {
      if (err) return res.status(400).send(err);
      return res.status(200).json(data);
    });
  })

  module.exports = router