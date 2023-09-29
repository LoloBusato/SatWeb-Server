const express = require('express');
const router = express.Router();

// Agregar base de datos
const pool = require('../database/dbConfig');
/*-----------------CREACION DE CLIENTES--------------- */
// CRUD de clientes
  // read
  router.get("/order/:id", (req, res) => {
    const cobroId = req.params.id;
    const qgetCobro = `
    SELECT 
      c.*, 
      JSON_OBJECTAGG(movcategories.categories, movements.unidades) AS categoriasUnidades
    FROM cobros AS c
    JOIN movements ON c.movname_id = movements.movname_id 
    JOIN movcategories ON movements.movcategories_id = movcategories.idmovcategories 
    WHERE tipo LIKE '%Cuentas%' and order_id = ? 
    GROUP BY
    c.movname_id
    ORDER BY STR_TO_DATE(fecha, '%d/%m/%Y %H:%i:%s') DESC
    `;

    pool.getConnection((err, db) => {
      if (err) return res.status(500).send(err);
      
      db.query(qgetCobro, [cobroId], (err, data) => {
        db.release()
        if (err) return res.status(500).send(err);
        return res.status(200).json(data)
      });
    })
  })
  // read
  router.get("/movname/:id", (req, res) => {
    const cobroId = req.params.id;
    const qgetCobro = "SELECT * FROM cobros WHERE movname_id = ? ORDER BY STR_TO_DATE(fecha, '%d/%m/%Y %H:%i:%s') DESC";

    pool.getConnection((err, db) => {
      if (err) return res.status(500).send(err);
      
      db.query(qgetCobro, [cobroId], (err, data) => {
        db.release()
        if (err) return res.status(500).send(err);
        return res.status(200).json(data)
      });
    })
  })

  router.post('/devolverDinero', async (req, res) => {
    const { 
      ingreso,
      egreso,
      operacion, 
      monto,
      userId,
      branch_id,
      fecha,
      order_id,
      arrayMovements,
      movnameId,
    } = req.body;

    const valuesCreateMovename = [
      ingreso,
      egreso,
      operacion,
      monto,
      fecha,
      userId,
      branch_id,
      order_id,
    ]
    const qCreateMoveName= "INSERT INTO movname (ingreso, egreso, operacion, monto, fecha, userId, branch_id, order_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";

    const qCreateMovement = "INSERT INTO movements (movcategories_id, unidades, movname_id, branch_id) VALUES (?, ?, ?, ?)";

    const qUpdateCobros = "UPDATE cobros SET `fecha_devolucion` = ?, `devuelto` = ? WHERE movname_id = ?"

    async function executeTransaction() {

      const db = await pool.promise().getConnection();
      try {
        await db.beginTransaction();

        // Insertar el movname
        const [insertMovnameResult] = await db.execute(qCreateMoveName, valuesCreateMovename);
        const moveName_id = insertMovnameResult.insertId;
  
        // Insertar los movimientos
        await Promise.all(arrayMovements.map(async (element) => {
          await db.execute(qCreateMovement, [...element, moveName_id, branch_id]);
        }));
  
        // Insertar cobros
        await db.execute(qUpdateCobros, [fecha, 1, movnameId]);
  
        // Commit si todo fue exitoso
        await db.commit();
        return res.status(200).send('Repuesto agregado con éxito');

      } catch (err) {
        await db.rollback();
        console.error(err)
        return res.status(500).send(err);

      } finally {
        db.release();
      }
    }
    executeTransaction()
  });

  module.exports = router