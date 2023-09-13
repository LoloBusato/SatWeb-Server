const express = require('express');
const router = express.Router();

// Agregar base de datos
const pool = require('../database/dbConfig');
/*-----------------CREACION DE MOVNAME--------------- */
// CRUD de movname
// create
router.post('/', async (req, res) => {
    const { ingreso, egreso, operacion, monto, userId, branch_id, fecha, order_id } = req.body;
    const values = [
        ingreso, 
        egreso, 
        operacion, 
        monto, 
        fecha,
        userId,
        branch_id,
        order_id
    ]
    const qCreateMove= "INSERT INTO movname (ingreso, egreso, operacion, monto, fecha, userId, branch_id, order_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
    
    pool.getConnection((err, db) => {
      if (err) return res.status(500).send(err);
      
      db.query(qCreateMove, values, (err, data) => {
        db.release()
        if (err) return res.status(500).send(err);
        return res.status(200).json(data)
      });
    }) 
  });
router.post('/movesSells', async (req, res) => {
    const { 
      ingreso,
      egreso,
      operacion, 
      monto,
      userId,
      branch_id,
      fecha,
      order_id,
      arrayMovements,
      updateStockArr,
      insertReduceArr,
     } = req.body;
    
    const valuesCreateMovename = [
      ingreso,
      egreso,
      operacion,
      monto,
      fecha,
      userId,
      branch_id,
      order_id,
    ]
    const qCreateMoveName= "INSERT INTO movname (ingreso, egreso, operacion, monto, fecha, userId, branch_id, order_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";

    const qCreateMovement = "INSERT INTO movements (movcategories_id, unidades, movname_id, branch_id) VALUES (?, ?, ?, ?)";

    const qupdateStock = "UPDATE stockbranch SET `cantidad_restante` = ? WHERE stockbranchid = ?";
    const qInsertReduceStockOne = "INSERT INTO reducestock (orderid, userid, stockbranch_id, date) VALUES (?, ?, ?, ?)"

    pool.getConnection((err, db) => {
      if (err) return res.status(500).send(err);
  
      db.beginTransaction(err => {
        if (err) return res.status(500).send('Error al iniciar la transacción');
  
        try {
          db.query(qCreateMoveName, valuesCreateMovename, (err, data) => {
            if (err) throw err
            const moveName_id = data.insertId    

            arrayMovements.forEach(element => {
              db.query(qCreateMovement, [...element, moveName_id, branch_id], (err, data) => {
                if (err) throw err
              });
            });
          });

          for (const [cantidad, stockbranchid] of updateStockArr) {
            db.query(qupdateStock, [cantidad, stockbranchid], (err, data) => {
              if (err) throw err;
            });
          }

          insertReduceArr.forEach(element => {
            db.query(qInsertReduceStockOne, element, (err, data) => {
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
  });
  // read
  router.get("/:id", (req, res) => {
    const moveId = req.params.id;
    const qgetMovements = "SELECT idmovname, ingreso, egreso, operacion, monto, fecha, username, movname.order_id FROM movname JOIN users ON userId = idusers WHERE movname.branch_id = ? ORDER BY STR_TO_DATE(fecha, '%d/%m/%Y %H:%i:%s') DESC";
    
    pool.getConnection((err, db) => {
      if (err) return res.status(500).send(err);
      
      db.query(qgetMovements, [moveId], (err, data) => {
        db.release()
        if (err) return res.status(500).send(err);
        return res.status(200).json(data)
      });
    })
  })
  // delete
  router.delete("/:id", (req, res) => {
    const moveId = req.params.id;
    const qdeleteMovement = " DELETE FROM movname WHERE idmovname = ? ";
  
    pool.getConnection((err, db) => {
      if (err) return res.status(500).send(err);
      
      db.query(qdeleteMovement, [moveId], (err, data) => {
        db.release()
        if (err) return res.status(500).send(err);
        return res.status(200).json(data)
      });
    })
  })

  module.exports = router