const express = require('express');
const router = express.Router();

// Agregar base de datos
const db = require('../database/dbConfig');
/*-----------------CREACION DE SISTEMA DE REPUESTOS USADOS----------------- */
router.post("/", (req, res) => {
    const qInsertReduceStock = "INSERT INTO reducestock (orderid, userid, stockid, date) VALUES (?, ?, ?, ?)";
    const qupdateStock = "UPDATE stock SET `cantidad` = ? WHERE idstock = ?";
  
    const { orderId, userId, stockId, cantidad, fecha } = req.body;
    // Obtener la fecha y hora actual
  
    const values = [
      orderId,
      userId,
      stockId,
      fecha,
    ]
    db.query(qupdateStock, [cantidad,stockId], (err, data) => {
      if (err) return res.status(400).send(err);
      
      db.query(qInsertReduceStock, values, (err, data) => {
        if (err) return res.status(400).send(err);
        return res.status(200).send(data);
      });
    });
  
  })// read
  router.get("/", (req, res) => {
    const qgetStock = "SELECT idreducestock, orderid, idstock, cantidad, repuesto, precio_compra, nombre, username, reducestock.date  FROM reducestock JOIN users ON reducestock.userid = users.idusers JOIN stock ON reducestock.stockid = stock.idstock JOIN repuestos ON stock.repuesto_id = repuestos.idrepuestos JOIN proveedores ON stock.proveedor_id = proveedores.idproveedores ORDER BY STR_TO_DATE(reducestock.date, '%d/%m/%y') DESC";
    db.query(qgetStock, (err, data) => {
      if (err) {
        console.log(err);
        return res.status(400).json("error al obtener la lista de Stock");
      }
      return res.status(200).json(data);
    });
  })
  router.put("/:id", (req, res) => {
    const qupdateStock = "UPDATE stock SET `cantidad` = ? WHERE idstock = ?";
    const stockId = req.params.id;
    const { cantidad } = req.body;
    
    db.query(qupdateStock, [cantidad,stockId], (err, data) => {
      if (err) return res.status(400).send(err);
      return res.status(200).json(data);
    });
  })
  router.delete("/:id", (req, res) => {
    const stockReduceId = req.params.id;
    const qdeleteStock = " DELETE FROM reducestock WHERE idreducestock = ? ";
  
    db.query(qdeleteStock, [stockReduceId], (err, data) => {
      if (err) return res.status(400).send(err);
      return res.status(200).json(data);
    });
  })

  module.exports = router