const express = require('express');
const router = express.Router();

// Agregar base de datos
const pool = require('../database/dbConfig');
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
    
    
    pool.getConnection((err, db) => {
      if (err) return res.status(500).send(err);
      
      db.query(qCreateSupplier, values, (err, data) => {
        db.release()
        if (err) return res.status(500).send(err);
        return res.status(200).json(data)
      });
    })
  })
  // read
  router.get("/", (req, res) => {
    const qgetSupplier = `SELECT * FROM proveedores ORDER BY nombre`;
    
    pool.getConnection((err, db) => {
      if (err) return res.status(500).send(err);
      
      db.query(qgetSupplier, (err, data) => {
        db.release()
        if (err) return res.status(500).send(err);
        return res.status(200).json(data)
      });
    })
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

    pool.getConnection((err, db) => {
      if (err) return res.status(500).send(err);
      
      db.query(qupdateSupplier, [...values,supplierId], (err, data) => {
        db.release()
        if (err) return res.status(500).send(err);
        return res.status(200).json(data)
      });
    })
  })
  // delete
  router.delete("/:id", (req, res) => {
    const supplierId = req.params.id;
    const qdeleteSupplier = " DELETE FROM proveedores WHERE idproveedores = ? ";
  
    pool.getConnection((err, db) => {
      if (err) return res.status(500).send(err);
      
      db.query(qdeleteSupplier, [supplierId], (err, data) => {
        db.release()
        if (err) return res.status(500).send(err);
        return res.status(200).json(data)
      });
    })
  })
  /* ------------------------------------------------------------- */

  module.exports = router