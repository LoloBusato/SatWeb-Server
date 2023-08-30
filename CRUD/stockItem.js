const express = require('express');
const router = express.Router();

// Agregar base de datos
const db = require('../database/dbConfig');
/*-----------------CREACION DE SISTEMA DE REPUESTOS----------------- */
// create
router.post("/", (req, res) => {
    //idrepuestos, repuesto, cantidad_limite, color_id, nombre_repuestos_id, calidad_repuestos_id
    db.beginTransaction(err => {
      if (err) {
        console.error('Error al comenzar la transacción:', err);
        return res.status(500).send('Error al iniciar la transacción');
      }
      try {
        
      const { repuesto, nombre_repuestos_id, calidad_repuestos_id, colores_id, cantidad_limite, array_modelos } = req.body;
      const values = [
        repuesto,
        cantidad_limite,
        nombre_repuestos_id,
        calidad_repuestos_id,
        colores_id,
      ];
        
      const qCreateItem = "INSERT INTO repuestos (repuesto, cantidad_limite, nombre_repuestos_id, calidad_repuestos_id, color_id) VALUES (?, ?, ?, ?, ?)";
      
      // Realiza la primera inserción
      db.query(qCreateItem, values, (err, data) => {
        if (err) {
          throw err
        }
        
        const repuestoId = data.insertId;
        const qCreateRepuestoModelo = "INSERT INTO repuestosdevices (repuestos_id, devices_id) VALUES ?";
        const insertarArrayModelos = array_modelos.map(modeloId => [repuestoId, modeloId]);
        
        // Realiza la segunda inserción
        db.query(qCreateRepuestoModelo, [insertarArrayModelos], (err, result) => {
          if (err) {
            throw err
          }
    
          // Si todo sale bien, realiza un commit
          db.commit(err => {
            if (err) {
              return db.rollback(() => {
                console.error('Error al hacer commit:', err);
                return res.status(500).send('Error al realizar commit');
              });
            }

            return res.status(200).send(result);
          });
        });
      });
      } catch (err) {
        db.rollback(() => {
          console.error('Error en la transacción:', err);
          return res.status(500).send('Error en la transacción');
        });
      }
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

    db.beginTransaction(err => {
      if (err) {
        console.error('Error al comenzar la transacción:', err);
        return res.status(500).send('Error al iniciar la transacción');
      }
      try {
        //idrepuestos, repuesto, cantidad_limite, color_id, nombre_repuestos_id, calidad_repuestos_id
        const repuestoId = req.params.id;

        const { repuesto, cambiar_modelos, nombre_repuestos_id, calidad_repuestos_id, color_id, cantidad_limite, array_modelos } = req.body;
        const values = [
          repuesto,
          cantidad_limite,
          nombre_repuestos_id,
          calidad_repuestos_id,
          color_id,
        ]

        if (cambiar_modelos) {
          const qdeleteAllRepuestoModelo = "DELETE FROM repuestosdevices WHERE repuestosdevices.repuestos_id = ?"
          const qCreateRepuestoModelo = "INSERT INTO repuestosdevices (repuestos_id, devices_id) VALUES ?"
          const insertarArrayModelos = array_modelos.map(modeloId => [repuestoId, modeloId]);
          db.query(qdeleteAllRepuestoModelo, [repuestoId], (err, result) => {
            if (err) {
              throw err
            } else {
              db.query(qCreateRepuestoModelo, [insertarArrayModelos], (err, result) => {
                if (err) {
                  throw err
                } 
              });
            }
          });
        }
        const qupdateItem = "UPDATE repuestos SET `repuesto` = ?, `cantidad_limite` = ?, `nombre_repuestos_id` = ?, `calidad_repuestos_id` = ?, `color_id` = ? WHERE idrepuestos = ?";
        db.query(qupdateItem, [...values,repuestoId], (err, data) => {
          if (err) {
            throw err
          }
        });
      
        // Si todo sale bien, realiza un commit
        db.commit(err => {
          if (err) {
            return db.rollback(() => {
              console.error('Error al hacer commit:', err);
              return res.status(500).send('Error al realizar commit');
            });
          }

          return res.status(200).send('Transaction completed successfully');
        });

      } catch (error) {
        db.rollback(() => {
          console.error('Error en la transacción:', err);
          return res.status(500).send('Error en la transacción');
        });
      }
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