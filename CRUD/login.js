// LOGIN de usuarios
const express = require('express');
const router = express.Router();

// Agregar base de datos
const db = require('../database/dbConfig');

router.post("/", async (req, res) => {
    const { username, password } = req.body;
  
    const q = 'SELECT idusers, username, grupos_id, branch_id, permisos FROM users JOIN branches ON users.branch_id = branches.idbranches JOIN grupousuarios ON users.grupos_id = grupousuarios.idgrupousuarios WHERE username = ? and password = ?'
    const values = [username, password]
  
    db.query(q, values, (err, data) => {
      if (err) {
        console.log("error: ", err);
        return res.send(err);
      }
      if(data.length > 0){
        return res.status(200).send(data);
      } else {
        return res.status(400).send("Creedenciales incorrectas");
      }
    });
  });

module.exports = router