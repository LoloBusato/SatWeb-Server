const express = require('express');
const router = express.Router();

// Agregar base de datos
const db = require('../database/dbConfig');
/* ------------------------------------------------------------- */
// CRUD de equipos
// create
router.post('/', async (req, res) => {
    const { brand, type, model } = req.body;
  
    let brandId;
    const qbrand = 'SELECT brandid FROM brands WHERE brand = ?'
    db.query(qbrand, [brand], (err, data) => {
      if (err) {
        console.log("error: ", err);
        return res.status(400).send(err);
      }
      if (data.length < 1){
        return res.status(400).send("Marca ingresada no valida o no creada")
      }
      brandId = data[0].brandid
      
      let typeId;
      const qtype = 'SELECT typeid FROM types WHERE type = ?'
      db.query(qtype, [type], (err, data) => {
        if (err) {
          console.log("error: ", err);
          return res.status(400).send(err);
        }
        if (data.length < 1){
          return res.status(400).send("Tipo ingresado no valido o no creado")
        }
        typeId = data[0].typeid
      
        const values = [
          brandId,
          typeId,
          model,
        ];
      
        const qdevice = 'SELECT * FROM devices WHERE brand_id = ? and type_id = ? and model = ?'
        db.query(qdevice, values, (err, data) => {
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
                return res.status(400).send("No se pudo agregar el nuevo equipo.");
              }
              return res.status(200).send("El nuevo equipo se agregó correctamente.");
            });    
          }
        });
      });
    });
  
  })
  // read
  router.get("/", (req, res) => {
    const qgetDevices = "SELECT * FROM devices JOIN types ON devices.type_id = types.typeid JOIN brands ON devices.brand_id = brands.brandid";
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
    const { brand, type, model } = req.body;
  
    let brandId;
    const qbrand = 'SELECT brandid FROM brands WHERE brand = ?'
    db.query(qbrand, [brand], (err, data) => {
      if (err) {
        console.log("error: ", err);
        return res.send(err);
      }
      if (data.length < 1){
        return res.status(400).send("Marca ingresada no valida o no creada")
      }
      brandId = data[0].brandid
    
      let typeId;
      const qtype = 'SELECT typeid FROM types WHERE type = ?'
      db.query(qtype, [type], (err, data) => {
        if (err) {
          console.log("error: ", err);
          return res.send(err);
        }
        if (data.length < 1){
          return res.status(400).send("Tipo ingresado no valido o no creado")
        }
        typeId = data[0].typeid
  
        const values = [
          brandId,
          typeId,
          model,
        ];
        
        const deviceId = req.params.id;
        const qupdateDevice = "UPDATE devices SET `brand_id`= ?, `type_id`= ?, `model`= ?  WHERE iddevices = ?";
      
        db.query(qupdateDevice, [...values,deviceId], (err, data) => {
          if (err) return res.status(400).send(err);
          return res.status(200).json(data);
        });
      });
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