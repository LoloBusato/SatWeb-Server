const express = require('express');
const router = express.Router();

// Agregar base de datos
const pool = require('../database/dbConfig');
/*-----------------CREACION DE SISTEMA DE REPUESTOS----------------- */
// create
router.post("/", (req, res) => {
  pool.getConnection((err, db) => {
    if (err) return res.status(500).send(err);
    
    //nombre_repuestos_id, calidad_repuestos_id, repuesto, color_id, cantidad_limite, venta, almacenamiento_repuestos_id, array_modelos
    db.beginTransaction(err => {
      if (err) return res.status(500).send('Error al iniciar la transacción');

      try {
        const { repuesto, nombre_repuestos_id, calidad_repuestos_id, color_id, cantidad_limite, venta, almacenamiento_repuestos_id, array_modelos } = req.body;
        const values = [
          repuesto,
          cantidad_limite,
          nombre_repuestos_id,
          calidad_repuestos_id,
          color_id,
          venta,
          almacenamiento_repuestos_id,
        ];
          
        const qCreateItem = "INSERT INTO repuestos (repuesto, cantidad_limite, nombre_repuestos_id, calidad_repuestos_id, color_id, venta, almacenamiento_repuestos_id) VALUES (?, ?, ?, ?, ?, ?, ?)";
        
        // Realiza la primera inserción
        db.query(qCreateItem, values, (err, data) => {
          if (err) throw err
          
          const repuestoId = data.insertId;
          const qCreateRepuestoModelo = "INSERT INTO repuestosdevices (repuestos_id, devices_id) VALUES ?";
          const insertarArrayModelos = array_modelos.map(modeloId => [repuestoId, modeloId]);
          
          // Realiza la segunda inserción
          db.query(qCreateRepuestoModelo, [insertarArrayModelos], (err, result) => {
            if (err) throw err
      
            // Si todo sale bien, realiza un commit
            db.commit(err => {
              if (err) {
                return db.rollback(() => {
                  db.release()
                  return res.status(500).send('Error al realizar commit');
                });
              }

              db.release()
              return res.status(200).send(result);
            });
          });
        });
      } catch (err) {
        db.rollback(() => {
          db.release()
          return res.status(500).send('Error en la transacción');
        });
      }
    }); 
  })
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
    pool.getConnection((err, db) => {
      if (err) return res.status(500).send(err);
      
      db.query(qgetItem, (err, data) => {
        db.release()
        if (err) return res.status(500).send(err);
        return res.status(200).json(data)
      });
    })
  })
  // update
  router.put("/:id", (req, res) => {
    pool.getConnection((err, db) => {
      if (err) return res.status(500).send(err);
      
      //almacenamiento_repuestos_id, array_modelos, calidad_repuestos_id, cambiar_modelos, cantidad_limite, color_id, modelos_asociados, nombre_repuestos_id, repuesto, venta
      db.beginTransaction(err => {
        if (err) return res.status(500).send('Error al iniciar la transacción');
        
        try {
          const repuestoId = req.params.id;
  
          const { repuesto, cambiar_modelos, almacenamiento_repuestos_id, venta, nombre_repuestos_id, calidad_repuestos_id, color_id, cantidad_limite, array_modelos } = req.body;
          const values = [
            repuesto,
            cantidad_limite,
            nombre_repuestos_id,
            calidad_repuestos_id,
            color_id,
            almacenamiento_repuestos_id,
            venta,
          ]
  
          if (cambiar_modelos) {
            const qdeleteAllRepuestoModelo = "DELETE FROM repuestosdevices WHERE repuestosdevices.repuestos_id = ?"
            const qCreateRepuestoModelo = "INSERT INTO repuestosdevices (repuestos_id, devices_id) VALUES ?"
            const insertarArrayModelos = array_modelos.map(modeloId => [repuestoId, modeloId]);
            db.query(qdeleteAllRepuestoModelo, [repuestoId], (err, result) => {
              if (err) throw err

              db.query(qCreateRepuestoModelo, [insertarArrayModelos], (err, result) => {
                if (err) throw err
              });
            });
          }

          const qupdateItem = "UPDATE repuestos SET `repuesto` = ?, `cantidad_limite` = ?, `nombre_repuestos_id` = ?, `calidad_repuestos_id` = ?, `color_id` = ?, `almacenamiento_repuestos_id` = ?, `venta` = ? WHERE idrepuestos = ?";
          db.query(qupdateItem, [...values,repuestoId], (err, data) => {
            if (err) throw err
          });
        
          // Si todo sale bien, realiza un commit
          db.commit(err => {
            if (err) {
              return db.rollback(() => {
                db.release()
                return res.status(500).send('Error al realizar commit');
              });
            }
  
            db.release()
            return res.status(200).send('Transaction completed successfully');
          });
  
        } catch (error) {
          db.rollback(() => {
            db.release()
            return res.status(500).send('Error en la transacción');
          });
        }
      }); 
    })
  })
  // delete
  router.delete("/:id", (req, res) => {
    const itemId = req.params.id;
    const qdeleteItem = " DELETE FROM repuestos WHERE idrepuestos = ? ";
  
    pool.getConnection((err, db) => {
      if (err) return res.status(500).send(err);
      
      db.query(qdeleteItem, [itemId], (err, data) => {
        db.release()
        if (err) return res.status(500).send(err);
        return res.status(200).json(data)
      });
    })
  })

  module.exports = router