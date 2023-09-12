const express = require('express');
const router = express.Router();

// Agregar base de datos
const pool = require('../database/dbConfig');
/*-----------------CREACION DE CLIENTES--------------- */
// CRUD de clientes
// create
router.post('/', async (req, res) => {
    const { order_id, movname_id, fecha, pesos, dolares, banco, mercado_pago, encargado } = req.body;
    values = [
        order_id, 
        movname_id, 
        fecha, 
        pesos, 
        dolares, 
        banco, 
        mercado_pago, 
        encargado
    ]
  
    pool.getConnection((err, db) => {
        if (err) return res.status(500).send(err);

        const qCreateCobro = "INSERT INTO cobros (order_id, movname_id, fecha, pesos, dolares, banco, mercado_pago, encargado) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
        db.query(qCreateCobro, values, (err, data) => {
            db.release()
            if (err) return res.status(500).send("No se pudo agregar el cobro.");

            return res.status(200).send(data);
        });    
    })
  });
  // read
  router.get("/:id", (req, res) => {
    const cobroId = req.params.id;
    const qgetCobro = "SELECT * FROM cobros WHERE order_id = ? ORDER BY STR_TO_DATE(fecha, '%d/%m/%y') DESC";

    pool.getConnection((err, db) => {
      if (err) return res.status(500).send(err);
      
      db.query(qgetCobro, [cobroId], (err, data) => {
        db.release()
        if (err) return res.status(500).send(err);
        return res.status(200).json(data)
      });
    })
  })
  // update
  router.put("/:id", (req, res) => {
    const movnameId = req.params.id;
    const { pesos, dolares, banco, mercado_pago, encargado } = req.body;
    const values = [
        pesos, 
        dolares, 
        banco, 
        mercado_pago, 
        encargado
    ]
    const qupdateCobro = "UPDATE cobro SET `pesos` = ?, `dolares` = ?, `banco` = ?, `mercado_pago` = ?, `encargado` = ? WHERE movname_id = ?";
    
    pool.getConnection((err, db) => {
      if (err) return res.status(500).send(err);
      
      db.query(qupdateCobro, [...values, movnameId], (err, data) => {
        db.release()
        if (err) return res.status(500).send(err);
        return res.status(200).json(data)
      });
    })
  })

  module.exports = router