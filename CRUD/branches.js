const express = require('express');
const router = express.Router();

// Agregar base de datos
const pool = require('../database/dbConfig');
/*-----------------CREACION DE SUCURSALES--------------- */
// CRUD de sucursales
// create
router.post('/', async (req, res) => {
    const { branch, contact, info } = req.body;
    const values = [
      branch,
      contact,
      info,
    ]
    const qCreateBranch = "INSERT INTO branches (branch, contact, info) VALUES (?, ?, ?)";
    
    pool.getConnection((err, db) => {
      if (err) return res.status(500).send(err);
      
      db.query(qCreateBranch, values, (err, data) => {
        db.release()
        if (err) return res.status(500).send(err);
        return res.status(200).json(data)
      });
    })  
  });
  // read
router.get("/", (req, res) => {
    const qgetBranches = "SELECT * FROM branches ORDER BY idbranches";
    
    pool.getConnection((err, db) => {
      if (err) return res.status(500).send(err);
      
      db.query(qgetBranches, (err, data) => {
        db.release()
        if (err) return res.status(500).send(err);
        return res.status(200).json(data)
      });
    })
  })
  // update
router.put("/:id", (req, res) => {
    const branchId = req.params.id;
    const qupdateBranch = "UPDATE branches SET `branch`= ?, `contact`= ?, `info`= ? WHERE idbranches = ?";
    const { branch, contact, info} = req.body
    const values = [
      branch,
      contact,
      info,
    ];
  
    pool.getConnection((err, db) => {
      if (err) return res.status(500).send(err);
      
      db.query(qupdateBranch, [...values,branchId], (err, data) => {
        db.release()
        if (err) return res.status(500).send(err);
        return res.status(200).json(data)
      });
    })
  })
// delete
router.delete("/:id", (req, res) => {
    const branchId = req.params.id;
    const qdeleteBranch = " DELETE FROM branches WHERE idbranches = ? ";
  
    pool.getConnection((err, db) => {
      if (err) return res.status(500).send(err);
      
      db.query(qdeleteBranch, [branchId], (err, data) => {
        db.release()
        if (err) return res.status(500).send(err);
        return res.status(200).json(data)
      });
    })
  })

module.exports = router