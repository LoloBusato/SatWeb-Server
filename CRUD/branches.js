const express = require('express');
const router = express.Router();

// Agregar base de datos
const db = require('../database/dbConfig');
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
    db.query(qCreateBranch, values, (err, data) => {
      if (err) {
        console.log("error: ", err);
        return res.status(400).send("No se pudo agregar la nueva sucursal.");
      }
      return res.status(200).send("La nueva sucursal se agregó correctamente.");
    });    
  });
  // read
router.get("/", (req, res) => {
    const qgetBranches = "SELECT * FROM branches ORDER BY idbranches";
    db.query(qgetBranches, (err, data) => {
      if (err) {
        console.log(err);
        return res.status(400).json(err);
      }
      return res.status(200).json(data);
    });
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
  
    db.query(qupdateBranch, [...values,branchId], (err, data) => {
      if (err) return res.status(400).send(err);
      return res.status(200).json(data);
    });
  })
// delete
router.delete("/:id", (req, res) => {
    const branchId = req.params.id;
    const qdeleteBranch = " DELETE FROM branches WHERE idbranches = ? ";
  
    db.query(qdeleteBranch, [branchId], (err, data) => {
      if (err) return res.status(400).send(err);
      return res.status(200).json(data);
    });
  })

module.exports = router