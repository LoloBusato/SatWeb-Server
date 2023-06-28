const express = require('express');
const router = express.Router();

// Agregar base de datos
const db = require('../database/dbConfig');
/* ------------------------------------------------------------- */
// CRUD de equipos
// create
router.post('/', async (req, res) => {
    const { brandId, typeId, model } = req.body;
    const qdevice = 'SELECT * FROM devices WHERE model = ?'
    const values = [
      brandId,
      typeId,
      model
    ]
    db.query(qdevice, [model], (err, data) => {
      if (err) {
        console.log("error: ", err);
        return res.status(400).send(err);
      }
      if(data.length > 0){
        return res.status(400).send("Equipo con ese modelo ya creado");
      } else {
        const q = "INSERT INTO devices (brand_id, type_id, model) VALUES (?, ?, ?)";
        db.query(q, values, (err, data) => {
          if (err) {
            console.log("error: ", err);
            return res.status(400).send(err);
          }
          return res.status(200).send(data);
        });    
      }
    });
  })
  // read
  router.get("/", (req, res) => {
    const qgetDevices = "SELECT * FROM devices JOIN types ON devices.type_id = types.typeid JOIN brands ON devices.brand_id = brands.brandid ORDER BY model";
    db.query(qgetDevices, (err, data) => {
      if (err) {
        console.log(err);
        return res.status(400).json(err);
      }
      return res.status(200).json(data);
    });
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
    db.query(qupdateDevice, [...values,deviceId], (err, data) => {
      if (err) return res.status(400).send(err);
      return res.status(200).json(data);
    });
  })
  // delete
  router.delete("/:id", (req, res) => {
    const deviceId = req.params.id;
    const qdeleteDevice = " DELETE FROM devices WHERE iddevices = ? ";
  
    db.query(qdeleteDevice, [deviceId], (err, data) => {
      if (err) return res.status(400).send(err);
      return res.status(200).json(data);
    });
  })
  /* ------------------------------------------------------------- */
module.exports = router