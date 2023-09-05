const express = require('express');
const router = express.Router();

// Agregar base de datos
const pool = require('../database/dbConfig');
// CRUD de estados
// create
router.post('/', async (req, res) => {
    const { state, color } = req.body;
  
    const qCreateState = "INSERT INTO states (state, color) VALUES (?, ?)";
    
    pool.getConnection((err, db) => {
      if (err) return res.status(500).send(err);
      
      db.query(qCreateState, [state, color], (err, data) => {
        db.release()
        if (err) return res.status(500).send(err);
        return res.status(200).json(data)
      });
    }) 
  });
  // read
  router.get("/", (req, res) => {
    const qgetStates = "SELECT * FROM states ORDER BY state";
    
    pool.getConnection((err, db) => {
      if (err) return res.status(500).send(err);
      
      db.query(qgetStates, (err, data) => {
        db.release()
        if (err) return res.status(500).send(err);
        return res.status(200).json(data)
      });
    }) 
  })
  // update
  router.put("/:id", (req, res) => {
    const stateId = req.params.id;
    const qupdateState = "UPDATE states SET `state`= ?, `color` = ? WHERE idstates = ?";
  
    const values = [
      req.body.state,
      req.body.color,
    ];
  
    pool.getConnection((err, db) => {
      if (err) return res.status(500).send(err);
      
      db.query(qupdateState, [...values,stateId], (err, data) => {
        db.release()
        if (err) return res.status(500).send(err);
        return res.status(200).json(data)
      });
    }) 
  })
  // delete
  router.delete("/:id", (req, res) => {
    const stateId = req.params.id;
    const qdeleteState = " DELETE FROM states WHERE idstates = ? ";
  
    pool.getConnection((err, db) => {
      if (err) return res.status(500).send(err);
      
      db.query(qdeleteState, [stateId], (err, data) => {
        db.release()
        if (err) return res.status(500).send(err);
        return res.status(200).json(data)
      });
    })
  })
  /* -------------------------------------- */

  module.exports = router