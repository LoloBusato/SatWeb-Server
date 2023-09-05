const express = require('express');
const router = express.Router();

// Agregar base de datos
const pool = require('../database/dbConfig');
/*-----------------CREACION DE MENSAJES--------------- */
// CRUD de mensajes
// create
router.post('/', async (req, res) => {
    const { username, message, orderId, created_at } = req.body;
      
    const values = [
      message,
      username,
      created_at,
      orderId,
    ]
    const qCreateNote = "INSERT INTO messages (message, username, created_at, orderId) VALUES (?, ?, ?, ?)";
    
    pool.getConnection((err, db) => {
      if (err) return res.status(500).send(err);
      
      db.query(qCreateNote, values, (err, data) => {
        db.release()
        if (err) return res.status(500).send(err);
        return res.status(200).json(data)
      });
    })  
  });
  // read
  router.get("/:id", (req, res) => {
    const orderId = req.params.id;
    const qgetNotes = "SELECT * FROM messages WHERE orderId = ? ORDER BY STR_TO_DATE(created_at, '%d/%m/%Y %H:%i:%s') ASC";
    
    pool.getConnection((err, db) => {
      if (err) return res.status(500).send(err);
      
      db.query(qgetNotes, [orderId], (err, data) => {
        db.release()
        if (err) return res.status(500).send(err);
        return res.status(200).json(data)
      });
    })  
  })
  // delete
  router.delete("/:id", (req, res) => {
    const messageId = req.params.id;
    const qdeleteOrder = " DELETE FROM messages WHERE idmessages = ? ";
  
    pool.getConnection((err, db) => {
      if (err) return res.status(500).send(err);
      
      db.query(qdeleteOrder, [messageId], (err, data) => {
        db.release()
        if (err) return res.status(500).send(err);
        return res.status(200).json(data)
      });
    })
  })

  module.exports = router