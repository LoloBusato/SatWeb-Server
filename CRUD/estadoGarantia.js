const express = require('express');
const router = express.Router();

// Agregar base de datos
const pool = require('../database/dbConfig');
/*-----------------CREACION DE SUCURSALES--------------- */
// CRUD de sucursales
// create
router.post('/', async (req, res) => {
    const { nombre, color } = req.body;
    const values = [
      nombre,
      color,
    ]
    const qCreateEstadoGarantia = "INSERT INTO garantia_estados (estado_nombre, estado_color) VALUES (?, ?)";
    
    pool.getConnection((err, db) => {
      if (err) return res.status(500).send(err);
      
      db.query(qCreateEstadoGarantia, values, (err, data) => {
        db.release()
        if (err) return res.status(500).send(err);
        return res.status(200).json(data)
      });
    })  
  });
  // read
router.get("/", (req, res) => {
    const qgetEstadosGarantia = "SELECT * FROM garantia_estados ORDER BY idgarantia_estados";
    
    pool.getConnection((err, db) => {
      if (err) return res.status(500).send(err);
      
      db.query(qgetEstadosGarantia, (err, data) => {
        db.release()
        if (err) return res.status(500).send(err);
        return res.status(200).json(data)
      });
    })
  })
  // update
router.put("/:id", (req, res) => {
    const estadoId = req.params.id;
    const qupdateEstadoGarantia = "UPDATE garantia_estados SET `estado_nombre`= ?, `estado_color`= ? WHERE idgarantia_estados = ?";
    const { nombre, color } = req.body;
    const values = [
      nombre,
      color,
    ]
  
    pool.getConnection((err, db) => {
      if (err) return res.status(500).send(err);
      
      db.query(qupdateEstadoGarantia, [...values,estadoId], (err, data) => {
        db.release()
        if (err) return res.status(500).send(err);
        return res.status(200).json(data)
      });
    })
  })
// delete
router.delete("/:id", (req, res) => {
    const estadoId = req.params.id;
    const qdeleteEstadoGarantia = " DELETE FROM garantia_estados WHERE idgarantia_estados = ? ";
  
    pool.getConnection((err, db) => {
      if (err) return res.status(500).send(err);
      
      db.query(qdeleteEstadoGarantia, [estadoId], (err, data) => {
        db.release()
        if (err) return res.status(500).send(err);
        return res.status(200).json(data)
      });
    })
  })

module.exports = router