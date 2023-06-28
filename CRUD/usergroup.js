const express = require('express');
const router = express.Router();

// Agregar base de datos
const db = require('../database/dbConfig');
// CRUD de usuarios
// create
router.post("/", (req, res) => {
    const { grupo, permisos } = req.body;

    const values = [grupo, permisos]
    const qcreate = 'INSERT INTO grupousuarios (grupo, permisos) VALUES (?, ?)'
    db.query(qcreate, values, (err, data) => {
    if (err) {
        console.log("error: ", err);
        return res.send(err);
    }
    return res.status(200).send("Usuario creado con exito")
    })
})
// read
router.get("/", (req, res) => {
  const qgetUsers = "SELECT * FROM grupousuarios ORDER BY grupo";
  db.query(qgetUsers, (err, data) => {
    if (err) {
      console.log(err);
      return res.status(400).json(err);
    }
    return res.status(200).json(data);
  });
})
// update
router.put("/:id", (req, res) => {
  const userId = req.params.id;
  const [grupo, permisos] = req.body
  const qupdateUser = "UPDATE grupousuarios SET `grupo`= ?, `permisos`= ? WHERE idgrupousuarios = ?";

  const values = [grupo,permisos];

  db.query(qupdateUser, [...values,userId], (err, data) => {
    if (err) return res.status(400).send(err);
    return res.status(200).json(data);
  });
})
// delete
router.delete("/:id", (req, res) => {
  const userId = req.params.id;
  const qdeleteUser = " DELETE FROM grupousuarios WHERE idgrupousuarios = ? ";

  db.query(qdeleteUser, [userId], (err, data) => {
    if (err) return res.status(400).send(err);
    return res.status(200).json(data);
  });
})
/* ------------------------------------------------------------- */
module.exports = router