const express = require('express');
const router = express.Router();

// Agregar base de datos
const pool = require('../database/dbConfig');
// CRUD de usuarios
// create
router.post("/", (req, res) => {
  const { grupo, permisos } = req.body;

  const values = [grupo, permisos]
  const qcreate = 'INSERT INTO grupousuarios (grupo, permisos) VALUES (?, ?)'

  pool.getConnection((err, db) => {
    if (err) return res.status(500).send(err);
    
    db.query(qcreate, values, (err, data) => {
      db.release()
      if (err) return res.status(500).send(err);
      return res.status(200).json(data)
    });
  })
})
// read
router.get("/", (req, res) => {
  const qgetUsers = "SELECT * FROM grupousuarios ORDER BY grupo";

  pool.getConnection((err, db) => {
    if (err) return res.status(500).send(err);
    
    db.query(qgetUsers, (err, data) => {
      db.release()
      if (err) return res.status(500).send(err);
      return res.status(200).json(data)
    });
  })
})
// update
router.put("/:id", (req, res) => {
  const userId = req.params.id;
  const [grupo, permisos] = req.body
  const qupdateUser = "UPDATE grupousuarios SET `grupo`= ?, `permisos`= ? WHERE idgrupousuarios = ?";

  const values = [grupo,permisos];

  pool.getConnection((err, db) => {
    if (err) return res.status(500).send(err);
    
    db.query(qupdateUser, [...values,userId], (err, data) => {
      db.release()
      if (err) return res.status(500).send(err);
      return res.status(200).json(data)
    });
  })
})
// delete
router.delete("/:id", (req, res) => {
  const userId = req.params.id;
  const qdeleteUser = " DELETE FROM grupousuarios WHERE idgrupousuarios = ? ";

  pool.getConnection((err, db) => {
    if (err) return res.status(500).send(err);
    
    db.query(qdeleteUser, [userId], (err, data) => {
      db.release()
      if (err) return res.status(500).send(err);
      return res.status(200).json(data)
    });
  })
})
/* ------------------------------------------------------------- */
module.exports = router