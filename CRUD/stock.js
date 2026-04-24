const express = require('express');
const router = express.Router();

// Agregar base de datos
const pool = require('../database/dbConfig');
/*-----------------CREACION DE SISTEMA DE STOCK----------------- */
// create
router.post("/", (req, res) => {
  pool.getConnection((err, db) => {
    if (err) return res.status(500).send(err);
    
    //nombre_repuestos_id, calidad_repuestos_id, repuesto, color_id, cantidad_limite, venta, almacenamiento_repuestos_id, array_modelos
    db.beginTransaction(err => {
      if (err) return res.status(500).send('Error al iniciar la transacción');

      try {
        const { repuesto_id, cantidad, precio_compra, proveedor_id, fecha_compra, cantidad_limite, branch_id } = req.body;
        // `modelo` es NOT NULL sin DEFAULT en el schema. En strict mode (Clever
        // Cloud MySQL 8), omitirlo hace fallar el INSERT con
        // ER_NO_DEFAULT_FOR_FIELD, el callback tira el error que se pierde,
        // y la Vercel function timeoutea (504). El frontend lo veía como
        // "Network Error al cargar la pantalla de stock" y generaba drift
        // contable porque movname+movements seguían insertándose con stockId
        // undefined. Pasamos '' explícito para satisfacer strict sin cambiar
        // el contenido semántico.
        const qCreateStock = "INSERT INTO stock (repuesto_id, cantidad, precio_compra, proveedor_id, fecha_compra, cantidad_limite, branch_id, modelo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";

        const values = [
          repuesto_id,
          cantidad,
          precio_compra,
          proveedor_id,
          fecha_compra,
          cantidad_limite,
          branch_id,
          '',
        ]
        
        const qDistributeStock = "INSERT INTO stockbranch (stock_id, branch_id, cantidad_branch, cantidad_restante) VALUES (?, ?, ?, ?)"
              
        db.query(qCreateStock, values, (err, data) => {
          if (err) throw err
          
          const stockId = data.insertId
          const valuesDistribute = [
            stockId,
            branch_id,
            cantidad,
            cantidad
          ]

          db.query(qDistributeStock, valuesDistribute, (err, data) => {
            if (err) throw err

            db.commit(err => {
              if (err) {
                return db.rollback(() => {
                  db.release()
                  return res.status(500).send('Error al realizar commit');
                });
              }

              db.release()
              return res.status(200).send({stockId: stockId});
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
  router.get("/:id", (req, res) => {
    const branchId = req.params.id;
    // Columnas explícitas — antes era SELECT * que traía ~40 columnas (muchas
    // pesadas y no usadas: descripcion TEXT, modelo, capacidad, porcentaje_bateria,
    // etc.) dando payloads de ~2.7 MB por branch. Ahora ~13 columnas, ~500kb,
    // evitando timeouts intermitentes de Vercel en cold starts y conexiones
    // flojas. Lista derivada de un audit exhaustivo del frontend (Fase 4 —
    // forense Network Error en Stock, 2026-04-24).
    const qgetStock = `SELECT
      stock.idstock, stock.cantidad, stock.precio_compra, stock.fecha_compra,
      stock.cantidad_limite, stock.proveedor_id,
      stock.branch_id AS original_branch,
      repuestos.idrepuestos, repuestos.repuesto,
      proveedores.nombre,
      stockbranch.stockbranchid, stockbranch.branch_id,
      stockbranch.cantidad_branch, stockbranch.cantidad_restante
    FROM stock
    JOIN repuestos ON stock.repuesto_id = repuestos.idrepuestos
    JOIN proveedores ON stock.proveedor_id = proveedores.idproveedores
    JOIN stockbranch ON stock.idstock = stockbranch.stock_id
    WHERE stockbranch.branch_id = ?
    ORDER BY repuesto`;
    
    pool.getConnection((err, db) => {
      if (err) return res.status(500).send(err);
      
      db.query(qgetStock, [branchId], (err, data) => {
        db.release()
        if (err) return res.status(500).send(err);
        return res.status(200).json(data)
      });
    })
  })

  router.get("/distribute/:id", (req, res) => {
    const branchId = req.params.id;
    // Misma lista explícita que el GET /:id — ver comentario arriba.
    const qgetStock = `SELECT
      stock.idstock, stock.cantidad, stock.precio_compra, stock.fecha_compra,
      stock.cantidad_limite, stock.proveedor_id,
      stock.branch_id AS original_branch,
      repuestos.idrepuestos, repuestos.repuesto,
      proveedores.nombre,
      stockbranch.stockbranchid, stockbranch.branch_id,
      stockbranch.cantidad_branch, stockbranch.cantidad_restante
    FROM stock
    JOIN repuestos ON stock.repuesto_id = repuestos.idrepuestos
    JOIN proveedores ON stock.proveedor_id = proveedores.idproveedores
    JOIN stockbranch ON stock.idstock = stockbranch.stock_id
    WHERE stockbranch.stock_id = ?`;
    
    pool.getConnection((err, db) => {
      if (err) return res.status(500).send(err);
      
      db.query(qgetStock, [branchId], (err, data) => {
        db.release()
        if (err) return res.status(500).send(err);
        return res.status(200).json(data)
      });
    })
  })
  // update
  router.put("/:id", (req, res) => {
    const stockId = req.params.id;
    const qupdateStock = "UPDATE stock SET `repuesto_id` = ?, `cantidad` = ?, `precio_compra` = ?, `proveedor_id` = ?, `fecha_compra` = ? WHERE idstock = ?";
    
    const { repuesto_id, cantidad, precio_compra, proveedor_id, fecha_compra, cantidad_limite } = req.body;
    const values = [
      repuesto_id, 
      cantidad, 
      precio_compra, 
      proveedor_id, 
      fecha_compra, 
    ]

    pool.getConnection((err, db) => {
      if (err) return res.status(500).send(err);
      
      db.query(qupdateStock, [...values,stockId], (err, data) => {
        db.release()
        if (err) return res.status(500).send(err);
        return res.status(200).json(data)
      });
    })
  })

  router.put("/distribute/:id", (req, res) => {
    const { arraySucursales } = req.body;

    const STOCKID = 0
    const BRANCHID = 1
    const CANTIDAD = 2

    const query = `
      INSERT INTO stockbranch (stock_id, branch_id, cantidad_branch, cantidad_restante)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE cantidad_branch = cantidad_branch + ?, cantidad_restante = cantidad_restante + ?
    `;

    pool.getConnection((err, db) => {
      if (err) return res.status(500).send(err);
      arraySucursales.forEach(element => {
        const values = [
          element[STOCKID],
          element[BRANCHID],
          element[CANTIDAD],
          element[CANTIDAD],
          element[CANTIDAD],
          element[CANTIDAD],
        ]
        
        db.query(query, values, (err, data) => {
          if (err) return res.status(400).send(err);
        });
      });

      db.release()
      return res.status(200).send('Actualizados')
    })
  })
  // delete
  router.delete("/:id", (req, res) => {
    const stockId = req.params.id;
    const qdeleteStock = " DELETE FROM stock WHERE idstock = ? ";
  
    pool.getConnection((err, db) => {
      if (err) return res.status(500).send(err);
      
      db.query(qdeleteStock, [stockId], (err, data) => {
        db.release()
        if (err) return res.status(500).send(err);
        return res.status(200).json(data)
      });
    })
  })

  module.exports = router