const express = require('express');
const router = express.Router();

// Agregar base de datos
const pool = require('../database/dbConfig');
/*-----------------CREACION DE CLIENTES--------------- */
// CRUD de clientes
  // read
  router.get("/:id", (req, res) => {
    const cobroId = req.params.id;
    const qgetCobro = "SELECT * FROM cobros WHERE order_id = ? ORDER BY STR_TO_DATE(fecha, '%d/%m/%Y %H:%i:%s') DESC";

    pool.getConnection((err, db) => {
      if (err) return res.status(500).send(err);
      
      db.query(qgetCobro, [cobroId], (err, data) => {
        db.release()
        if (err) return res.status(500).send(err);
        return res.status(200).json(data)
      });
    })
  })

  module.exports = router