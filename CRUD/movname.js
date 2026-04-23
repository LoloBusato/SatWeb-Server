const express = require('express');
const router = express.Router();

// Agregar base de datos
const pool = require('../database/dbConfig');
/*-----------------CREACION DE MOVNAME--------------- */
// CRUD de movname
// create
router.post('/', async (req, res) => {
    const { ingreso, egreso, operacion, monto, userId, branch_id, fecha, order_id } = req.body;
    const values = [
        ingreso, 
        egreso, 
        operacion, 
        monto, 
        fecha,
        userId,
        branch_id,
        order_id
    ]
    const qCreateMove= "INSERT INTO movname (ingreso, egreso, operacion, monto, fecha, userId, branch_id, order_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
    
    pool.getConnection((err, db) => {
      if (err) return res.status(500).send(err);
      
      db.query(qCreateMove, values, (err, data) => {
        db.release()
        if (err) return res.status(500).send(err);
        return res.status(200).json(data)
      });
    }) 
  });
router.post('/movesSells', async (req, res) => {
  const { 
    valuesCreateMovename,
    insertOrder,
    arrayMovements,
    updateStockArr,
    insertReduceArr,
    branch_id,
    fecha
  } = req.body;

  // Insertar orden — current_branch_id se duplica desde branches_id (pos 2 del
  // array insertOrder) para cumplir con el NOT NULL agregado en la migración
  // 0007 (Fase 2.3). Ver CRUD/orders.js para el patrón análogo en el POST
  // directo de /api/orders.
  //
  // Paso 3 Fase 3.4: created_at y returned_at ahora son DATETIME. movesSells
  // sí puede llevar fechas HISTÓRICAS (usuario elige desde el form del
  // cliente legacy), así que parseamos el VARCHAR dd/m/yyyy via STR_TO_DATE
  // en vez de pisar con NOW(). NULLIF(?, '') convierte returned_at vacío
  // a NULL para preservar la nullability de la columna.
  const qCreateOrder = "INSERT INTO orders (client_id, device_id, branches_id, current_branch_id, created_at, returned_at, state_id, problem, password, accesorios, serial, users_id, device_color) VALUES (?, ?, ?, ?, STR_TO_DATE(?, '%d/%m/%Y'), STR_TO_DATE(NULLIF(?, ''), '%d/%m/%Y'), ?, ?, ?, ?, ?, ?, ?)";

  // Insertar repuestos. reducestock.date ahora DATETIME — parse del VARCHAR
  // dd/m/yyyy HH:mm:ss que manda el cliente.
  const qupdateStock = "UPDATE stockbranch SET `cantidad_restante` = ? WHERE stockbranchid = ?";
  const qInsertReduceStock = "INSERT INTO reducestock (orderid, userid, stockbranch_id, date) VALUES (?, ?, ?, STR_TO_DATE(?, '%d/%m/%Y %H:%i:%s'))"

  // Insertar movname
  const qCreateMoveName= "INSERT INTO movname (ingreso, egreso, operacion, monto, fecha, userId, branch_id, order_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";

  // Insert movements
  const qCreateMovement = "INSERT INTO movements (movcategories_id, unidades, branch_id, movname_id) VALUES (?, ?, ?, ?)";

  // Insert cobro
  const qCreateCobros = "INSERT INTO cobros (order_id, movname_id, fecha) VALUES (?, ?, ?)"

  async function executeTransaction() {

    const db = await pool.promise().getConnection();
    try {
      await db.beginTransaction();

      // Insertar Orden
      const insertOrderValues = [
        ...insertOrder.slice(0, 3),
        insertOrder[2], // current_branch_id = branches_id
        ...insertOrder.slice(3),
      ];
      const [insertOrderResult] = await db.execute(qCreateOrder, insertOrderValues);
      const order_id = insertOrderResult.insertId;

      // Insertar Repuestos
      for (const [cantidad, stockbranchid] of updateStockArr) {
        await db.execute(qupdateStock, [cantidad, stockbranchid]);
      }

      await Promise.all(insertReduceArr.map(async (element) => {
        await db.execute(qInsertReduceStock, [order_id, ...element]);
      }));

      // Insertar movname
      const [insertMovnameResult] = await db.execute(qCreateMoveName, [...valuesCreateMovename, order_id]);
      const moveName_id = insertMovnameResult.insertId;

      // Insertar movimientos
      await Promise.all(arrayMovements.map(async (element) => {
        await db.execute(qCreateMovement, [...element, branch_id, moveName_id]);
      }));

      // Insertar cobros
      await db.execute(qCreateCobros, [order_id, moveName_id, fecha]);

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
router.post('/movesRepairs', async (req, res) => {
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
      entregarOrden,
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

    const qCreateCobros = "INSERT INTO cobros (order_id, fecha, movname_id) VALUES (?, ?, ?)"

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
        const cobrosValuesArr = [
          order_id,
          fecha,
          moveName_id
        ];
        await db.execute(qCreateCobros, cobrosValuesArr);
  
        // Reasignar la orden como entregada. Paso 3 Fase 3.4: returned_at
        // ahora es DATETIME. fecha viene como "dd/m/yyyy HH:mm:ss" del
        // cliente; tomamos sólo la parte fecha y la parseamos con STR_TO_DATE
        // (movesRepairs sí puede llevar fecha histórica).
        if (entregarOrden) {
          const qupdateOrder = "UPDATE orders SET `returned_at` = STR_TO_DATE(?, '%d/%m/%Y'), `state_id` = 6, `users_id` = 18 WHERE order_id = ?";
          await db.execute(qupdateOrder, [fecha.split(' ')[0], order_id]);
        }
  
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
  // read
  router.get("/:id", (req, res) => {
    const moveId = req.params.id;
    const qgetMovements = "SELECT idmovname, ingreso, egreso, operacion, monto, fecha, username, movname.order_id FROM movname JOIN users ON userId = idusers WHERE movname.branch_id = ? ORDER BY STR_TO_DATE(fecha, '%d/%m/%Y %H:%i:%s') DESC";
    
    pool.getConnection((err, db) => {
      if (err) return res.status(500).send(err);
      
      db.query(qgetMovements, [moveId], (err, data) => {
        db.release()
        if (err) return res.status(500).send(err);
        return res.status(200).json(data)
      });
    })
  })
  // delete
  router.delete("/:id", (req, res) => {
    const moveId = req.params.id;
    const qdeleteMovement = " DELETE FROM movname WHERE idmovname = ? ";
  
    pool.getConnection((err, db) => {
      if (err) return res.status(500).send(err);
      
      db.query(qdeleteMovement, [moveId], (err, data) => {
        db.release()
        if (err) return res.status(500).send(err);
        return res.status(200).json(data)
      });
    })
  })

  module.exports = router