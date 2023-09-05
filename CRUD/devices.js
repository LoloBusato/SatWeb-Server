const express = require('express');
const router = express.Router();

// Agregar base de datos
const db = require('../database/dbConfig');
/* ------------------------------------------------------------- */
// CRUD de equipos
// create
router.post('/', async (req, res) => {
    const { brandId, typeId, model } = req.body;
    const values = [
      brandId,
      typeId,
      model
    ]
    const q = "INSERT INTO devices (brand_id, type_id, model) VALUES (?, ?, ?)";
    
    pool.getConnection((err, db) => {
      if (err) return res.status(500).send(err);
      
      db.query(q, values, (err, data) => {
        db.release()
        if (err) return res.status(500).send(err);
        return res.status(200).json(data)
      });
    })
  })
  // read
  router.get("/", (req, res) => {
    const qgetDevices = "SELECT * FROM devices JOIN types ON devices.type_id = types.typeid JOIN brands ON devices.brand_id = brands.brandid ORDER BY model";
    
    pool.getConnection((err, db) => {
      if (err) return res.status(500).send(err);
      
      db.query(qgetDevices, (err, data) => {
        db.release()
        if (err) return res.status(500).send(err);
        return res.status(200).json(data)
      });
    })
  })
  // update
  router.put("/:id", (req, res) => {
    const { brandId, typeId, model } = req.body;
    const deviceId = req.params.id;
    const qupdateDevice = "UPDATE devices SET `brand_id`= ?, `type_id`= ?, `model`= ?  WHERE iddevices = ?";
    const values = [
      brandId,
      typeId,
      model
    ]

    pool.getConnection((err, db) => {
      if (err) return res.status(500).send(err);
      
      db.query(qupdateDevice, [...values,deviceId], (err, data) => {
        db.release()
        if (err) return res.status(500).send(err);
        return res.status(200).json(data)
      });
    })
  })
  // delete
  router.delete("/:id", (req, res) => {
    const deviceId = req.params.id;
    const qdeleteDevice = " DELETE FROM devices WHERE iddevices = ? ";
  
    pool.getConnection((err, db) => {
      if (err) return res.status(500).send(err);
      
      db.query(qdeleteDevice, [deviceId], (err, data) => {
        db.release()
        if (err) return res.status(500).send(err);
        return res.status(200).json(data)
      });
    })
  })
  /* ------------------------------------------------------------- */
module.exports = router