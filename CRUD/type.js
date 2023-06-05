const express = require('express');
const router = express.Router();

// Agregar base de datos
const db = require('../database/dbConfig');
/* ------------------------------------------------------------- */
// CRUD de tipos
// create
router.post('/', async (req, res) => {
    const { type } = req.body;
  
    const qType = 'SELECT * FROM types WHERE type = ?'
    db.query(qType, [type], (err, data) => {
      if (err) {
        console.log("error: ", err);
        return res.status(400).send(err);
      }
      if(data.length > 0){
        return res.status(400).send("Ese tipo ya existe");
      } else {
        const qCreateType = "INSERT INTO types (type) VALUES (?)";
        db.query(qCreateType, [type], (err, data) => {
          if (err) {
            console.log("error: ", err);
            return res.status(400).send("No se pudo agregar el nuevo tipo.");
          }
          return res.status(200).send("El nuevo tipo se agregó correctamente.");
        });    
      }
    });
  });
  // read
  router.get("/", (req, res) => {
    const qgetTypes = "SELECT * FROM types";
    db.query(qgetTypes, (err, data) => {
      if (err) {
        console.log(err);
        return res.status(400).json(err);
      }
      return res.status(200).json(data);
    });
  })
  // update
  router.put("/:id", (req, res) => {
    const typeId = req.params.id;
    const qupdateType = "UPDATE types SET `type`= ? WHERE typeid = ?";
  
    const type = req.body.type;
  
    db.query(qupdateType, [type,typeId], (err, data) => {
      if (err) return res.status(400).send(err);
      return res.status(200).json(data);
    });
  })
  // delete
  router.delete("/:id", (req, res) => {
    const typeId = req.params.id;
    const qdeleteType = " DELETE FROM types WHERE typeid = ? ";
  
    db.query(qdeleteType, [typeId], (err, data) => {
      if (err) return res.status(400).send(err);
      return res.status(200).json(data);
    });
  })
  /* ------------------------------------------------------------- */

  module.exports = router  