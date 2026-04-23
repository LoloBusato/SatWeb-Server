const express = require('express');
const router = express.Router();

// Agregar base de datos
const pool = require('../database/dbConfig');
/*-----------------CREACION DE MENSAJES--------------- */
// CRUD de mensajes
// create
router.post('/', async (req, res) => {
    const { username, message, orderId } = req.body;

    // created_at lo genera el server con AR-local wall-clock. El body podría
    // traer su propio created_at desde el cliente legacy, pero lo ignoramos
    // — la fecha autoritativa es el momento del insert en DB.
    const values = [
      message,
      username,
      orderId,
    ]
    const qCreateNote = "INSERT INTO messages (message, username, created_at, orderId) VALUES (?, ?, CONVERT_TZ(NOW(), '+00:00', '-03:00'), ?)";
    
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
    const qgetNotes = "SELECT * FROM messages WHERE orderId = ? ORDER BY created_at ASC";
    
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