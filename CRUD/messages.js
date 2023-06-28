const express = require('express');
const router = express.Router();

// Agregar base de datos
const db = require('../database/dbConfig');
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
    db.query(qCreateNote, values, (err, data) => {
      if (err) {
        console.log("error: ", err);
        return res.status(400).send("No se pudo agregar la nota.");
      }
      return res.status(200).send("Nota agregada correctamente.");
    });    
  });
  // read
  router.get("/:id", (req, res) => {
    const orderId = req.params.id;
    const qgetNotes = "SELECT * FROM messages WHERE orderId = ? ORDER BY STR_TO_DATE(created_at, '%d/%m/%y %H:%i:%S') DESC";
    db.query(qgetNotes, [orderId], (err, data) => {
      if (err) {
        console.log(err);
        return res.status(400).json(err);
      }
      return res.status(200).json(data);
    });
  })
  // update
  // delete
  router.delete("/:id", (req, res) => {
    const messageId = req.params.id;
    const qdeleteOrder = " DELETE FROM messages WHERE idmessages = ? ";
  
    db.query(qdeleteOrder, [messageId], (err, data) => {
      if (err) return res.status(400).send(err);
      return res.status(200).json(data);
    });
  })

  module.exports = router