const express = require('express');
const router = express.Router();

// Agregar base de datos
const pool = require('../database/dbConfig');
/*-----------------CREACION DE SISTEMA DE REPUESTOS USADOS----------------- */
router.post("/", (req, res) => {
  pool.getConnection((err, db) => {
    if (err) return res.status(500).send(err);

    db.beginTransaction(err => {
      if (err) return res.status(500).send('Error al iniciar la transacción');

      try {
        const qupdateStock = "UPDATE stockbranch SET `cantidad_restante` = ? WHERE stockbranchid = ?";
        // Paso 3 Fase 3.4: reducestock.date ahora es DATETIME. fecha del body
        // ignorada — server NOW() en AR local.
        const qInsertReduceStock = "INSERT INTO reducestock (orderid, userid, stockbranch_id, date) VALUES (?, ?, ?, CONVERT_TZ(NOW(), '+00:00', '-03:00'))";

        const { orderId, userId, stockbranchid, cantidad } = req.body;

        const values = [
        orderId,
        userId,
        stockbranchid,
        ]
        db.query(qupdateStock, [cantidad,stockbranchid], (err, data) => {
          if (err) throw err

          db.query(qInsertReduceStock, values, (err, data) => {
            if (err) throw err
          });
        });
  
        db.commit(err => {
          if (err) {
            return db.rollback(() => {
              db.release()
              return res.status(500).send('Error al realizar commit');
            });
          }
          db.release()
          return res.status(200).json('Repuesto agregado con exito');
        });
      } catch (err) {
        db.rollback(() => {
          db.release()
          return res.status(500).send('Error en la transacción');
        });
      }
    })
  })

})
// read
router.get("/", (req, res) => {
  // ORDER BY usa reducestock.date_dt (DATETIME nativo, Fase 3.4) en vez de
  // STR_TO_DATE sobre el VARCHAR. El trigger reducestock_date_before_insert
  // mantiene ambas columnas en sincronía (0 mismatches en prod — migration 0016).
  // Bonus: el formato viejo '%d/%m/%y' (2 dígitos de año) estaba mal vs el
  // dato real '%d/%m/%Y' — con la columna DATETIME eso queda automático.
  const qgetStock = "SELECT *, stock.branch_id AS original_branch FROM reducestock JOIN users ON reducestock.userid = users.idusers JOIN stockbranch ON reducestock.stockbranch_id = stockbranch.stockbranchid JOIN stock ON stockbranch.stock_id = stock.idstock JOIN repuestos ON stock.repuesto_id = repuestos.idrepuestos JOIN proveedores ON stock.proveedor_id = proveedores.idproveedores ORDER BY reducestock.date_dt DESC;";
  pool.getConnection((err, db) => {
    if (err) return res.status(500).send(err);
    
    db.query(qgetStock, (err, data) => {
      db.release()
      if (err) return res.status(500).send(err);
      return res.status(200).json(data)
    });
  })
})
// read
router.get("/:id", (req, res) => {
  const stockId = req.params.id;
  // Ver comentario en GET / sobre reducestock.date_dt.
  const qgetStock = "SELECT *, stock.branch_id AS original_branch FROM reducestock JOIN users ON reducestock.userid = users.idusers JOIN stockbranch ON reducestock.stockbranch_id = stockbranch.stockbranchid JOIN stock ON stockbranch.stock_id = stock.idstock JOIN repuestos ON stock.repuesto_id = repuestos.idrepuestos JOIN proveedores ON stock.proveedor_id = proveedores.idproveedores WHERE orderid = ? ORDER BY reducestock.date_dt DESC;";
  
  pool.getConnection((err, db) => {
    if (err) return res.status(500).send(err);
    
    db.query(qgetStock, [stockId], (err, data) => {
      db.release()
      if (err) return res.status(500).send(err);
      return res.status(200).json(data)
    });
  })
})
//
router.post("/delete", (req, res) => {
  pool.getConnection((err, db) => {
    if (err) return res.status(500).send(err);
    
    db.beginTransaction(err => {
      try {
        const { cantidad, stockbranchid, stockReduceId } = req.body;
        const qdeleteStock = "DELETE FROM reducestock WHERE idreducestock = ?";
        const qupdateStock = "UPDATE stockbranch SET `cantidad_restante` = ? WHERE stockbranchid = ?";
      
        db.query(qupdateStock, [cantidad,stockbranchid], (err, data) => {
          if (err) throw err

          db.query(qdeleteStock, [stockReduceId], (err, data) => {
            if (err) throw err
          });
        });      
  
        db.commit(err => {
          if (err) {
            return db.rollback(() => {
              db.release()
              return res.status(500).send('Error al realizar commit');
            });
          }
          db.release()
          return res.status(200).json('Repuesto eliminado con exito');
        });
      } catch (err) {
        db.rollback(() => {
          db.release()
          return res.status(500).send('Error en la transacción');
        });
      }
    })
  })
})

module.exports = router