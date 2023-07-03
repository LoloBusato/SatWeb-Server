const express = require('express');
const router = express.Router();

// Agregar base de datos
const db = require('../database/dbConfig');
/*-----------------CREACION DE SISTEMA DE STOCK----------------- */
// create
router.post("/", (req, res) => {
    const { repuesto_id, cantidad, precio_compra, proveedor_id, fecha_compra, cantidad_limite, branch_id } = req.body;
    const qCreateStock = "INSERT INTO stock (repuesto_id, cantidad, precio_compra, proveedor_id, fecha_compra, cantidad_limite, branch_id) VALUES (?, ?, ?, ?, ?, ?, ?)";
  
    const values = [
      repuesto_id, 
      cantidad, 
      precio_compra, 
      proveedor_id, 
      fecha_compra,
      cantidad_limite,
      branch_id
    ]
    
    const qDistributeStock = "INSERT INTO stockbranch (stock_id, branch_id, cantidad_branch, cantidad_restante) VALUES (?, ?, ?, ?)"
  
    db.query(qCreateStock, values, (err, data) => {
      if (err) {
        console.log("error: ", err);
        return res.status(400).send(err);
      }
      const stockId = data.insertId
      const valuesDistribute = [
        stockId,
        branch_id,
        cantidad,
        cantidad
      ]
      db.query(qDistributeStock, valuesDistribute, (err, data) => {
        if (err) {
          console.log("error: ", err);
          return res.status(400).send(err);
        }
        return res.status(200).send(stockId);
      }); 
    });    
  })
  // read
  router.get("/:id", (req, res) => {
    const branchId = req.params.id;
    const qgetStock = "SELECT * FROM stock JOIN repuestos ON stock.repuesto_id = repuestos.idrepuestos JOIN proveedores ON stock.proveedor_id = proveedores.idproveedores JOIN stockbranch ON stock.idstock = stockbranch.stock_id WHERE stockbranch.branch_id = ? ORDER BY repuesto";
    db.query(qgetStock, [branchId], (err, data) => {
      if (err) {
        console.log(err);
        return res.status(400).json(err);
      }
      return res.status(200).json(data);
    });
  })
  // update
  router.put("/:id", (req, res) => {
    const stockId = req.params.id;
    const qupdateStock = "UPDATE stock SET `repuesto_id` = ?, `cantidad` = ?, `precio_compra` = ?, `proveedor_id` = ?, `fecha_compra` = ?, `cantidad_limite` = ? WHERE idstock = ?";
    
    const { repuesto_id, cantidad, precio_compra, proveedor_id, fecha_compra, cantidad_limite } = req.body;
    const values = [
      repuesto_id, 
      cantidad, 
      precio_compra, 
      proveedor_id, 
      fecha_compra, 
      cantidad_limite
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