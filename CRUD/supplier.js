const express = require('express');
const router = express.Router();

// Agregar base de datos
const db = require('../database/dbConfig');
/*-----------------CREACION DE SISTEMA DE PROVEEDORES----------------- */
// create
router.post("/", (req, res) => {
    const { nombre, telefono, direccion } = req.body;
    const values = [
      nombre,
      telefono, 
      direccion
    ]
  
    const qCreateSupplier = "INSERT INTO proveedores (nombre, telefono, direccion) VALUES (?, ?, ?)";
    db.query(qCreateSupplier, values, (err, data) => {
      if (err) {
        console.log("error: ", err);
        return res.status(400).send("No se pudo agregar el proveedor.");
      }
      return res.status(200).send("Proveedor agregado correctamente.");
    });    
  })
  // read
  router.get("/", (req, res) => {
    const qgetSupplier = `SELECT * FROM proveedores ORDER BY nombre`;
    db.query(qgetSupplier, (err, result) => {
      if (err) {
        console.error(err);
        return res.status(500).send('Error al obtener la lista de proveedores');
      } else {
        return res.status(200).json(result);
      }
    });
  })
  // update
  router.put("/:id", (req, res) => {
    const supplierId = req.params.id;
    const qupdateSupplier = "UPDATE proveedores SET `nombre` = ?, `telefono` = ?, `direccion` = ? WHERE idproveedores = ?";
    const { nombre, telefono, direccion } = req.body;
    
    const values = [
      nombre,
      telefono, 
      direccion
    ]
    db.query(qupdateSupplier, [...values,supplierId], (err, data) => {
      if (err) return res.status(400).send(err);
      return res.status(200).json(data);
    });
  })
  // delete
  router.delete("/:id", (req, res) => {
    const supplierId = req.params.id;
    const qdeleteSupplier = " DELETE FROM proveedores WHERE idproveedores = ? ";
  
    db.query(qdeleteSupplier, [supplierId], (err, data) => {
      if (err) return res.status(400).send(err);
      return res.status(200).json(data);
    });
  })
  /* ------------------------------------------------------------- */

  module.exports = router