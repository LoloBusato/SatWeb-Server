const express = require('express');
const router = express.Router();

// Agregar base de datos
const pool = require('../database/dbConfig');
// CRUD de usuarios
// create
router.post("/", (req, res) => {
  const { username, password, branchId, grupoId } = req.body;

  const values = [username, password, branchId, grupoId]
  const qcreate = 'INSERT INTO users (username, password, branch_id, grupos_id) VALUES (?, ?, ?, ?)'

  pool.getConnection((err, db) => {
    if (err) {
      return res.status(500).send(err);
    }
    db.query(qcreate, values, (err, data) => {
      db.release()
      if (err) {
        return res.send(err);
      }
      return res.status(200).send(data)
    });
  })
})
// read
router.get("/", (req, res) => {
  const qgetUsers = "SELECT * FROM users JOIN branches ON users.branch_id = branches.idbranches JOIN grupousuarios ON users.grupos_id = grupousuarios.idgrupousuarios ORDER BY username";
  pool.getConnection((err, db) => {
    if (err) {
      return res.status(500).send(err);
    }
    db.query(qgetUsers, (err, data) => {
      db.release()
      if (err) {
        return res.status(500).send(err);
      }
      return res.status(200).json(data)
    });
  })
})
// update
router.put("/:id", (req, res) => {
  const userId = req.params.id;
  const qupdateUser = "UPDATE users SET `username`= ?, `password`= ?, `grupos_id`= ?, `branch_id`= ? WHERE idusers = ?";

  const { username, password, branchId, grupoId } = req.body

  const values = [
    username,
    password,
    grupoId,
    branchId
  ];

  pool.getConnection((err, db) => {
    if (err) {
      return res.status(500).send(err);
    }
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
  const qdeleteUser = " DELETE FROM users WHERE idusers = ? ";

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