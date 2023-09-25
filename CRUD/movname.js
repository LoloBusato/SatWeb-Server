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
    insertClient,
    clientCheck,
    valuesCreateMovename,
    insertOrder,
    arrayMovements,
    updateStockArr,
    insertReduceArr,
    cobrosValuesArr
  } = req.body;

  // Insertar cliente
  const qClient = 'SELECT * FROM clients WHERE (name = ? and surname = ?) and (email = ? or instagram = ? or phone = ?)';
  const qCreateClient = "INSERT INTO clients (name, surname, email, instagram, phone, postal) VALUES (?, ?, ?, ?, ?, ?)";

  // Insertar orden
  const qCreateOrder = "INSERT INTO orders (client_id, device_id, branches_id, created_at, returned_at, state_id, problem, password, accesorios, serial, users_id, device_color) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";

  // Insertar repuestos
  const qupdateStock = "UPDATE stockbranch SET `cantidad_restante` = ? WHERE stockbranchid = ?";
  const qInsertReduceStock = "INSERT INTO reducestock (orderid, userid, stockbranch_id, date) VALUES (?, ?, ?, ?)"

  // Insertar movname
  const qCreateMoveName= "INSERT INTO movname (ingreso, egreso, operacion, monto, fecha, userId, branch_id, order_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";

  // Insert movements
  const qCreateMovement = "INSERT INTO movements (movcategories_id, unidades, branch_id, movname_id) VALUES (?, ?, ?, ?)";

  // Insert cobro
  const qCreateCobros = "INSERT INTO cobros (order_id, movname_id, fecha , pesos, dolares, banco, mercado_pago, encargado) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"

  async function executeTransaction() {

    const db = await pool.promise().getConnection();
    try {
      await db.beginTransaction();

      // Insertar cliente
      const [clientRows] = await db.execute(qClient, clientCheck);
      let clientId;
      if(clientRows.length > 0){
        clientId = clientRows[0].idclients
      } else {
        const [insertClientResult] = await db.execute(qCreateClient, insertClient);
        clientId = insertClientResult.insertId
      }

      // Insertar Orden
      const [insertOrderResult] = await db.execute(qCreateOrder, [clientId, ...insertOrder]);
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
        await db.execute(qCreateMovement, [...element, moveName_id]);
      }));

      // Insertar cobros
      await db.execute(qCreateCobros, [order_id, moveName_id, ...cobrosValuesArr]);

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
      cobrosValues,
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

    const qCreateCobros = "INSERT INTO cobros (order_id, fecha, movname_id, pesos, dolares, banco, mercado_pago, encargado) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"

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
          moveName_id,
          cobrosValues.pesos || 0,
          cobrosValues.dolares || 0,
          cobrosValues.banco || 0,
          cobrosValues.mercado_pago || 0,
          cobrosValues.encargado || 0,
        ];
        await db.execute(qCreateCobros, cobrosValuesArr);
  
        // Reasignar la orden como entregada
        if (entregarOrden) {
          const qupdateOrder = "UPDATE orders SET `returned_at` = ?, `state_id` = 6, `users_id` = 18 WHERE order_id = ?";
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