const express = require('express');
const router = express.Router();

// Agregar base de datos
const db = require('../database/dbConfig');
// CRUD de estados
// create
router.post('/', async (req, res) => {
    const { state, color } = req.body;
  
    const qState = 'SELECT * FROM states WHERE state = ?'
    db.query(qState, [state, color], (err, data) => {
      if (err) {
        console.log("error: ", err);
        return res.status(400).send(err);
      }
      if(data.length > 0){
        return res.status(400).send("Ese estado ya existe");
      } else {
        const qCreateState = "INSERT INTO states (state, color) VALUES (?, ?)";
        db.query(qCreateState, [state, color], (err, data) => {
          if (err) {
            console.log("error: ", err);
            return res.status(400).send("No se pudo agregar el estado.");
          }
          return res.status(200).send("Estado agregado correctamente.");
        });    
      }
    }); 
  });
  // read
  router.get("/", (req, res) => {
    const qgetStates = "SELECT * FROM states";
    db.query(qgetStates, (err, data) => {
      if (err) {
        console.log(err);
        return res.status(400).json(err);
      }
      return res.status(200).json(data);
    });
  })
  // update
  router.put("/:id", (req, res) => {
    const stateId = req.params.id;
    const qupdateState = "UPDATE states SET `state`= ?, `color` = ? WHERE idstates = ?";
  
    const values = [
      req.body.state,
      req.body.color,
    ];
  
    db.query(qupdateState, [...values,stateId], (err, data) => {
      if (err) return res.status(400).send(err);
      return res.status(200).json(data);
    });
  })
  // delete
  router.delete("/:id", (req, res) => {
    const stateId = req.params.id;
    const qdeleteState = " DELETE FROM states WHERE idstates = ? ";
  
    db.query(qdeleteState, [stateId], (err, data) => {
      if (err) return res.status(400).send(err);
      return res.status(200).json(data);
    });
  })
  /* -------------------------------------- */

  module.exports = router