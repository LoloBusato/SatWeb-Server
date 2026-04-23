const express = require('express');
const router = express.Router();

// Agregar base de datos
const pool = require('../database/dbConfig');
/*-----------------CREACION DE MENSAJES--------------- */
// CRUD de mensajes
// create
router.post('/', async (req, res) => {
    const { username, message, orderId } = req.body;

    // Paso 3 Fase 3.4: created_at ahora es DATETIME. created_at del body
    // ignorado — server NOW() en AR local.
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
    // ORDER BY usa created_at_dt (DATETIME nativo, Fase 3.4) en vez de
    // STR_TO_DATE sobre el VARCHAR. Semánticamente equivalente porque el
    // trigger mantiene ambas columnas en sincronía (0 mismatches en prod
    // al momento del cambio — ver spot-checks de migration 0015).
    const qgetNotes = "SELECT * FROM messages WHERE orderId = ? ORDER BY created_at_dt ASC";
    
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