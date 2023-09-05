const express = require('express');
const router = express.Router();

// Agregar base de datos
const pool = require('../database/dbConfig');
// update
router.put("/:id", (req, res) => {
    const orderId = req.params.id;
    const { state_id, users_id } = req.body;
    const values = [
      state_id, 
      users_id
    ]
    const qupdateOrder = "UPDATE orders SET `state_id` = ?, `users_id` = ? WHERE order_id = ?";
  
    pool.getConnection((err, db) => {
      if (err) return res.status(500).send(err);
      
      db.query(qupdateOrder, [...values,orderId], (err, data) => {
        db.release()
        if (err) return res.status(500).send(err);
        return res.status(200).json(data)
      });
    })
  })

  module.exports = router