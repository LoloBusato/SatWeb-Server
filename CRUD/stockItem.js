const express = require('express');
const router = express.Router();

// Agregar base de datos
const db = require('../database/dbConfig');
/*-----------------CREACION DE SISTEMA DE REPUESTOS----------------- */
// create
router.post("/", (req, res) => {
  //idrepuestos, repuesto, cantidad_limite, color_id, nombre_repuestos_id, calidad_repuestos_id
    const { repuesto, nombre_repuestos_id, calidad_repuestos_id, colores_id, cantidad_limite, array_modelos } = req.body;
    const values = [
      repuesto,
      cantidad_limite,
      nombre_repuestos_id,
      calidad_repuestos_id,
      colores_id,
    ]

    const qCreateItem = "INSERT INTO repuestos (repuesto, cantidad_limite, nombre_repuestos_id, calidad_repuestos_id, color_id) VALUES (?, ?, ?, ?, ?)";
    db.query(qCreateItem, values, (err, data) => {
      if (err) {
        console.log("error: ", err);
        return res.status(400).send("No se pudo agregar el repuesto.");
      }
      const repuestoId = data.insertId;
      const qCreateRepuestoModelo = "INSERT INTO repuestosdevices (repuestos_id, devices_id) VALUES ?"
      const insertarArrayModelos = array_modelos.map(modeloId => [repuestoId, modeloId]);
      db.query(qCreateRepuestoModelo, [insertarArrayModelos], (err, result) => {
        if (err) {
          console.error(err);
          return res.status(500).send('Error al insertar la conexion entre el repuesto y los modelos');
        } else {
          return res.status(200).send(result);
        }
      });
    });    
  })
  // read
  router.get("/", (req, res) => {
    const qgetItem = `
    SELECT
      repuestos.*,  
      GROUP_CONCAT(repuestosdevices.devices_id) AS modelos_asociados,
      GROUP_CONCAT(CONCAT(types.type, ' ', devices.model)) AS nombres_modelos
    FROM
      repuestos
    LEFT JOIN
      repuestosdevices ON repuestos.idrepuestos = repuestosdevices.repuestos_id
    LEFT JOIN
      devices ON repuestosdevices.devices_id = devices.iddevices
    LEFT JOIN
      types ON devices.type_id = types.typeid
    LEFT JOIN
      brands ON devices.brand_id = brands.brandid
    GROUP BY
      repuestos.idrepuestos
    ORDER BY
      repuestos.repuesto;`;
    db.query(qgetItem, (err, result) => {
      if (err) {
        console.error(err);
        return res.status(500).send('Error al obtener la lista de repuestos');
      } else {
        return res.status(200).send(result);
      }
    });
  })
  // update
  router.put("/:id", (req, res) => {
    const itemId = req.params.id;
    const qupdateItem = "UPDATE repuestos SET `repuesto` = ?, `cantidad_limite` = ? WHERE idrepuestos = ?";
    const { repuesto, cantidad_limite } = req.body;
    const values = [
      repuesto,
      cantidad_limite
    ]
    
    db.query(qupdateItem, [...values,itemId], (err, data) => {
      if (err) return res.status(400).send(err);
      return res.status(200).json(data);
    });
  })
  // delete
  router.delete("/:id", (req, res) => {
    const itemId = req.params.id;
    const qdeleteItem = " DELETE FROM repuestos WHERE idrepuestos = ? ";
  
    db.query(qdeleteItem, [itemId], (err, data) => {
      if (err) return res.status(400).send(err);
      return res.status(200).json(data);
    });
  })

  module.exports = router