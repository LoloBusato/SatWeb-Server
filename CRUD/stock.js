const express = require('express');
const router = express.Router();

// Agregar base de datos
const db = require('../database/dbConfig');
/*-----------------CREACION DE SISTEMA DE STOCK----------------- */
/*
ID
Repuesto => creacion de sistema de repuestos por nombre
Cantidad
Precio de compra en USD
Proveedor => creacion de sistema de proveedores
        nombre
        numero de telefono
        direccion
Fecha de ingreso => default | new Date()
*/
// create
router.post("/", (req, res) => {
    const { repuesto_id, cantidad, precio_compra, proveedor_id, fecha_compra, cantidad_limite, branch_id } = req.body;
    const qCreateStock = "INSERT INTO stock (repuesto_id, cantidad, precio_compra, proveedor_id, fecha_compra, cantidad_limite) VALUES (?, ?, ?, ?, ?, ?)";
  
    const values = [
      repuesto_id, 
      cantidad, 
      precio_compra, 
      proveedor_id, 
      fecha_compra,
      cantidad_limite,
      branch_id
    ]
  
    db.query(qCreateStock, values, (err, data) => {
      if (err) {
        console.log("error: ", err);
        return res.status(400).send(err);
      }
      return res.status(200).send(data);
    });    
  })
  // read
  router.get("/:id", (req, res) => {
    const branchId = req.params.id;
    const qgetStock = "SELECT * FROM stock JOIN repuestos ON stock.repuesto_id = repuestos.idrepuestos JOIN proveedores ON stock.proveedor_id = proveedores.idproveedores WHERE branch_id = ?";
    db.query(qgetStock, [branchId], (err, data) => {
      if (err) {
        console.log(err);
        return res.status(400).json("error al obtener la lista de Stock");
      }
      return res.status(200).json(data);
    });
  })
  // update
  router.put("/:id", (req, res) => {
    const stockId = req.params.id;
    const qupdateStock = "UPDATE stock SET `repuesto_id` = ?, `cantidad` = ?, `precio_compra` = ?, `proveedor_id` = ?, `fecha_compra` = ? WHERE idstock = ?";
    const { repuesto_id, cantidad, precio_compra, proveedor_id, fecha_compra } = req.body;
  
    const values = [
      repuesto_id, 
      cantidad, 
      precio_compra, 
      proveedor_id, 
      fecha_compra, 
    ]
  
    db.query(qupdateStock, [...values,stockId], (err, data) => {
      if (err) return res.status(400).send(err);
      return res.status(200).json(data);
    });
  })
  // delete
  router.delete("/:id", (req, res) => {
    const stockId = req.params.id;
    const qdeleteStock = " DELETE FROM stock WHERE idstock = ? ";
  
    db.query(qdeleteStock, [stockId], (err, data) => {
      if (err) return res.status(400).send(err);
      return res.status(200).json(data);
    });
  })

  module.exports = router