const express = require('express');
const router = express.Router();

// Agregar base de datos
const db = require('../database/dbConfig');
/*-----------------CREACION DE SISTEMA DE REPUESTOS----------------- */
// create
router.post("/", (req, res) => {
    const { repuesto } = req.body;
    const qCreateItem = "INSERT INTO repuestos (repuesto) VALUES (?)";
    db.query(qCreateItem, [repuesto], (err, data) => {
      if (err) {
        console.log("error: ", err);
        return res.status(400).send("No se pudo agregar el repuesto.");
      }
      return res.status(200).send("Repuesto agregado correctamente.");
    });    
  })
  // read
  router.get("/", (req, res) => {
    console.log("Repuestos pedidos")
    const qgetItem = "SELECT * FROM repuestos ORDER BY repuesto";
    db.query(qgetItem, (err, result) => {
      if (err) {
        console.error(err);
        return res.status(500).send('Error al obtener la lista de repuestos');
      } else {
        console.log("Repuestos encontrados", result)
        return res.status(200).send(result);
      }
    });
  })
  // update
  router.put("/:id", (req, res) => {
    const itemId = req.params.id;
    const qupdateItem = "UPDATE repuestos SET `repuesto` = ? WHERE idrepuestos = ?";
    const { repuesto } = req.body;
    
    db.query(qupdateItem, [repuesto,itemId], (err, data) => {
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