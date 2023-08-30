const express = require('express');
const router = express.Router();

// Agregar base de datos
const db = require('../database/dbConfig');
/*-----------------CREACION DE SISTEMA DE REPUESTOS USADOS----------------- */
router.post("/", (req, res) => {
  db.beginTransaction(err => {
    if (err) {
      console.error('Error al comenzar la transacción:', err);
      return res.status(500).send('Error al iniciar la transacción');
    }
    try {
      
      const qupdateStock = "UPDATE stockbranch SET `cantidad_restante` = ? WHERE stockbranchid = ?";
      const qInsertReduceStock = "INSERT INTO reducestock (orderid, userid, stockbranch_id, date) VALUES (?, ?, ?, ?)";

      const { orderId, userId, stockbranchid, cantidad, fecha } = req.body;

      const values = [
      orderId,
      userId,
      stockbranchid,
      fecha,
      ]
      db.query(qupdateStock, [cantidad,stockbranchid], (err, data) => {
        if (err) {
          throw err
        } else {
          db.query(qInsertReduceStock, values, (err, data) => {
            if (err) {
              throw err
            }
          });
        }
      });

      db.commit(err => {
        if (err) {
          return db.rollback(() => {
            console.error('Error al hacer commit:', err);
            return res.status(500).send('Error al realizar commit');
          });
        }
      });
    } catch (err) {
      db.rollback(() => {
        console.error('Error en la transacción:', err);
        return res.status(500).send('Error en la transacción');
      });
    }
  })
})

// read
router.get("/", (req, res) => {
  const qgetStock = "SELECT * FROM reducestock JOIN users ON reducestock.userid = users.idusers JOIN stockbranch ON reducestock.stockbranch_id = stockbranch.stockbranchid JOIN stock ON stockbranch.stock_id = stock.idstock JOIN repuestos ON stock.repuesto_id = repuestos.idrepuestos JOIN proveedores ON stock.proveedor_id = proveedores.idproveedores ORDER BY STR_TO_DATE(reducestock.date, '%d/%m/%y') DESC;";
  db.query(qgetStock, (err, data) => {
    if (err) {
      return res.status(400).json(err);
    }
    return res.status(200).json(data);
  });
})
// read
router.get("/:id", (req, res) => {
  const stockId = req.params.id;
  const qgetStock = "SELECT * FROM reducestock JOIN users ON reducestock.userid = users.idusers JOIN stockbranch ON reducestock.stockbranch_id = stockbranch.stockbranchid JOIN stock ON stockbranch.stock_id = stock.idstock JOIN repuestos ON stock.repuesto_id = repuestos.idrepuestos JOIN proveedores ON stock.proveedor_id = proveedores.idproveedores WHERE orderid = ? ORDER BY STR_TO_DATE(reducestock.date, '%d/%m/%y') DESC;";
  db.query(qgetStock, [stockId], (err, data) => {
    if (err) {
      return res.status(400).json(err);
    }
    return res.status(200).json(data);
  });
})
//
router.post("/delete", (req, res) => {
  const qdeleteStock = "DELETE FROM reducestock WHERE idreducestock = ?";

  const qupdateStock = "UPDATE stockbranch SET `cantidad_restante` = ? WHERE stockbranchid = ?";
  const { cantidad, stockbranchid, stockReduceId } = req.body;

  db.query(qupdateStock, [cantidad,stockbranchid], (err, data) => {
    if (err) return res.status(400).send(err);

    db.query(qdeleteStock, [stockReduceId], (err, data) => {
      if (err) return res.status(400).send(err);
      return res.status(200).json(data);
    });
  });
})

module.exports = router