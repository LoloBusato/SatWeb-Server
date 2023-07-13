const express = require('express');
const router = express.Router();

// Agregar base de datos
const db = require('../database/dbConfig');
/*-----------------CREACION DE SISTEMA DE REPUESTOS USADOS----------------- */
router.post("/", (req, res) => {
  const qupdateStock = "UPDATE stockbranch SET `cantidad_restante` = ? WHERE stockbranchid = ?";
  const qInsertReduceStock = "INSERT INTO reducestock (orderid, userid, stockid, date) VALUES (?, ?, ?, ?)";

  const { orderId, userId, stockbranchid, cantidad, fecha } = req.body;

  const values = [
  orderId,
  userId,
  stockbranchid,
  fecha,
  ]
  db.query(qupdateStock, [cantidad,stockbranchid], (err, data) => {
    if (err) return res.status(400).send(err);

    db.query(qInsertReduceStock, values, (err, data) => {
      if (err) return res.status(400).send(err);
      return res.status(200).send(data);
    });
  });
})
// read
router.get("/:id", (req, res) => {
  const stockId = req.params.id;
  const qgetStock = "SELECT idreducestock, orderid, reducestock.date, username, stockbranchid, cantidad_restante, idstock, repuesto, nombre FROM reducestock JOIN users ON reducestock.userid = users.idusers JOIN stockbranch ON reducestock.stockid = stockbranch.stockbranchid JOIN stock ON stockbranch.stock_id = stock.idstock JOIN repuestos ON stock.repuesto_id = repuestos.idrepuestos JOIN proveedores ON stock.proveedor_id = proveedores.idproveedores WHERE orderid = ? ORDER BY STR_TO_DATE(reducestock.date, '%d/%m/%y') DESC";
  db.query(qgetStock, [stockId], (err, data) => {
    if (err) {
      return res.status(400).json(err);
    }
    return res.status(200).json(data);
  });
})
router.delete("/:id", (req, res) => {
  const stockReduceId = req.params.id;
  const qdeleteStock = "DELETE FROM reducestock WHERE idreducestock = ?";

  const qupdateStock = "UPDATE stockbranch SET `cantidad_restante` = ? WHERE stockbranchid = ?";
  const { cantidad, stockbranchid } = req.body;

  db.query(qupdateStock, [cantidad,stockbranchid], (err, data) => {
    if (err) return res.status(400).send(err);

    db.query(qdeleteStock, [stockReduceId], (err, data) => {
      if (err) return res.status(400).send(err);
      return res.status(200).json(data);
    });
  });
})

module.exports = router