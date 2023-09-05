// LOGIN de usuarios
const express = require('express');
const router = express.Router();

// Agregar base de datos
const db = require('../database/dbConfig');

router.post("/", async (req, res) => {
    const { username, password } = req.body;
    const q = 'SELECT idusers, username, grupos_id, branch_id, permisos, grupo FROM users JOIN branches ON users.branch_id = branches.idbranches JOIN grupousuarios ON users.grupos_id = grupousuarios.idgrupousuarios WHERE username = ? and password = ?'
    const values = [username, password]
  
    pool.getConnection((err, db) => {
      if (err) return res.status(500).send(err);
      
      db.query(q, values, (err, data) => {
        db.release()
        if (err) return res.status(500).send(err);
        if(data.length > 0){
          return res.status(200).send(data);
        } else {
          return res.status(400).send("Creedenciales incorrectas");
        }
      });
    })
  });

module.exports = router