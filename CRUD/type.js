const express = require('express');
const router = express.Router();

// Agregar base de datos
const pool = require('../database/dbConfig');
/* ------------------------------------------------------------- */
// CRUD de tipos
// create
router.post('/', async (req, res) => {
    const { type } = req.body;
    const qCreateType = "INSERT INTO types (type) VALUES (?)";

    pool.getConnection((err, db) => {
      if (err) return res.status(500).send(err);
      
      db.query(qCreateType, [type], (err, data) => {
        db.release()
        if (err) return res.status(500).send(err);
        return res.status(200).json(data)
      });
    }) 
  });
  // read
  router.get("/", (req, res) => {
    const qgetTypes = "SELECT * FROM types ORDER BY type";

    pool.getConnection((err, db) => {
      if (err) return res.status(500).send(err);
      
      db.query(qgetTypes, (err, data) => {
        db.release()
        if (err) return res.status(500).send(err);
        return res.status(200).json(data)
      });
    }) 
  })
  // update
  router.put("/:id", (req, res) => {
    const typeId = req.params.id;
    const qupdateType = "UPDATE types SET `type`= ? WHERE typeid = ?";
    const type = req.body.type;
  
    pool.getConnection((err, db) => {
      if (err) return res.status(500).send(err);
      
      db.query(qupdateType, [type,typeId], (err, data) => {
        db.release()
        if (err) return res.status(500).send(err);
        return res.status(200).json(data)
      });
    }) 
  })
  // delete
  router.delete("/:id", (req, res) => {
    const typeId = req.params.id;
    const qdeleteType = " DELETE FROM types WHERE typeid = ? ";
  
    pool.getConnection((err, db) => {
      if (err) return res.status(500).send(err);
      
      db.query(qdeleteType, [typeId], (err, data) => {
        db.release()
        if (err) return res.status(500).send(err);
        return res.status(200).json(data)
      });
    })
  })
  /* ------------------------------------------------------------- */

  module.exports = router  