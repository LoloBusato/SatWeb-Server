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

  // current_branch_id se duplica desde branches_id (pos 2 del array) — ambos
  // son NOT NULL y una orden nace en su sucursal de origen.
  //
  // movesSells sí puede llevar fechas HISTÓRICAS (el usuario elige la fecha
  // de la venta en el form), así que parseamos el VARCHAR dd/m/yyyy que
  // manda el cliente via STR_TO_DATE en vez de pisar con NOW(). NULLIF(?, '')
  // convierte returned_at vacío a NULL (columna nullable).
  const qCreateOrder = "INSERT INTO orders (client_id, device_id, branches_id, current_branch_id, created_at, returned_at, state_id, problem, password, accesorios, serial, users_id, device_color) VALUES (?, ?, ?, ?, STR_TO_DATE(?, '%d/%m/%Y'), STR_TO_DATE(NULLIF(?, ''), '%d/%m/%Y'), ?, ?, ?, ?, ?, ?, ?)";

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
  
        // Reasigna la orden como entregada usando la fecha que manda el
        // cliente (movesRepairs permite fechas históricas). `fecha` llega
        // como "dd/m/yyyy HH:mm:ss"; tomamos sólo la parte de fecha.
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

  // ===== Pre-Venta flow (mayo 2026) =====
  // Tres endpoints atómicos. Categoría 'Seña' (tipo='Señas') queda con saldo
  // pendiente entre depósito y retiro; se libera al cobro o se reclasifica
  // a Venta cuando el cliente se arrepiente y nos quedamos con el dinero.

  // 1. Depósito inicial: movname + movements. Sin cobros (la orden todavía
  //    no se entregó). El frontend de /preventa crea la orden con
  //    POST /orders (es_preventa=1) primero y después llama acá con el
  //    order_id resultante.
  router.post('/movesPreVentaSenya', async (req, res) => {
    const { valuesCreateMovname, arrayMovements, branch_id } = req.body;
    const qCreateMoveName = "INSERT INTO movname (ingreso, egreso, operacion, monto, fecha, userId, branch_id, order_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
    const qCreateMovement = "INSERT INTO movements (movcategories_id, unidades, movname_id, branch_id) VALUES (?, ?, ?, ?)";

    const db = await pool.promise().getConnection();
    try {
      await db.beginTransaction();
      const [r] = await db.execute(qCreateMoveName, valuesCreateMovname);
      const moveName_id = r.insertId;
      await Promise.all(arrayMovements.map(el =>
        db.execute(qCreateMovement, [...el, moveName_id, branch_id])
      ));
      await db.commit();
      return res.status(200).json({ moveName_id });
    } catch (err) {
      await db.rollback();
      console.error(err);
      return res.status(500).send(err);
    } finally {
      db.release();
    }
  });

  // 2. Cobro al retiro. Mismo shape que /movesSells pero la orden ya
  //    existe — UPDATE en vez de INSERT. Repuestos opcionales (el equipo
  //    principal viene desde el stock o no, depende del workflow).
  router.post('/movesPreVentaCobro', async (req, res) => {
    const {
      valuesCreateMovname,
      arrayMovements,
      updateStockArr = [],
      insertReduceArr = [],
      branch_id,
      fecha,
      order_id,
    } = req.body;

    const qCreateMoveName = "INSERT INTO movname (ingreso, egreso, operacion, monto, fecha, userId, branch_id, order_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
    const qCreateMovement = "INSERT INTO movements (movcategories_id, unidades, branch_id, movname_id) VALUES (?, ?, ?, ?)";
    const qupdateStock = "UPDATE stockbranch SET `cantidad_restante` = ? WHERE stockbranchid = ?";
    // reducestock.movname_id (migration 0025) — etiquetamos cada fila
    // creada acá con el movname del cobro, así el revert puede borrar
    // sólo las filas del cobro y conservar las pre-existentes (creadas
    // desde Mensajes con movname_id = NULL).
    const qInsertReduceStock = "INSERT INTO reducestock (orderid, userid, stockbranch_id, date, movname_id) VALUES (?, ?, ?, STR_TO_DATE(?, '%d/%m/%Y %H:%i:%s'), ?)";
    const qCreateCobros = "INSERT INTO cobros (order_id, movname_id, fecha) VALUES (?, ?, ?)";
    // Al retiro la orden pasa a ENTREGADO (state_id desde branch_settings,
    // users_id NULL — los entregadas no tienen dueño, ver migration 0024).
    const qFinalizeOrder = `
      UPDATE orders
      SET returned_at = CONVERT_TZ(NOW(), '+00:00', '-03:00'),
          state_changed_at = CONVERT_TZ(NOW(), '+00:00', '-03:00'),
          state_id = (SELECT delivered_state_id FROM branch_settings LIMIT 1),
          users_id = NULL
      WHERE order_id = ?
    `;

    const db = await pool.promise().getConnection();
    try {
      await db.beginTransaction();

      // Movname primero — necesitamos moveName_id para etiquetar
      // reducestock antes de los demás inserts.
      const [r] = await db.execute(qCreateMoveName, valuesCreateMovname);
      const moveName_id = r.insertId;

      for (const [cantidad, stockbranchid] of updateStockArr) {
        await db.execute(qupdateStock, [cantidad, stockbranchid]);
      }
      await Promise.all(insertReduceArr.map(el =>
        db.execute(qInsertReduceStock, [order_id, ...el, moveName_id])
      ));

      await Promise.all(arrayMovements.map(el =>
        db.execute(qCreateMovement, [...el, branch_id, moveName_id])
      ));
      await db.execute(qCreateCobros, [order_id, moveName_id, fecha]);
      await db.execute(qFinalizeOrder, [order_id]);

      await db.commit();
      return res.status(200).json({ moveName_id });
    } catch (err) {
      await db.rollback();
      console.error(err);
      return res.status(500).send(err);
    } finally {
      db.release();
    }
  });

  // 2b. Pago parcial al retiro. El cliente paga menos del saldo y la orden
  //     queda en DEUDOR (asignada a Atención al Cliente). NO se libera la
  //     seña, NO se descuenta stock, NO se postea Venta — el pago se
  //     acumula como una seña más. El último pago (cuando saldo=0) va por
  //     /movesPreVentaCobro y libera todo.
  router.post('/movesPreVentaPagoParcial', async (req, res) => {
    const { valuesCreateMovname, arrayMovements, branch_id, order_id } = req.body;
    const qCreateMoveName = "INSERT INTO movname (ingreso, egreso, operacion, monto, fecha, userId, branch_id, order_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
    const qCreateMovement = "INSERT INTO movements (movcategories_id, unidades, movname_id, branch_id) VALUES (?, ?, ?, ?)";
    // Estado DEUDOR resuelto por nombre — el frontend no hardcodea ids.
    const qUpdateOrder = `
      UPDATE orders
      SET state_id = (SELECT idstates FROM states WHERE state = 'DEUDOR' LIMIT 1),
          state_changed_at = CONVERT_TZ(NOW(), '+00:00', '-03:00'),
          users_id = (SELECT idgrupousuarios FROM grupousuarios WHERE LOWER(grupo) = 'atencion al cliente belgrano' LIMIT 1)
      WHERE order_id = ?
    `;

    const db = await pool.promise().getConnection();
    try {
      await db.beginTransaction();
      const [r] = await db.execute(qCreateMoveName, valuesCreateMovname);
      const moveName_id = r.insertId;
      await Promise.all(arrayMovements.map(el =>
        db.execute(qCreateMovement, [...el, moveName_id, branch_id])
      ));
      await db.execute(qUpdateOrder, [order_id]);
      await db.commit();
      return res.status(200).json({ moveName_id });
    } catch (err) {
      await db.rollback();
      console.error(err);
      return res.status(500).send(err);
    } finally {
      db.release();
    }
  });

  // 3. "Se arrepintió": cancela la pre-venta. Dos sub-acciones manejadas
  //    por el frontend con el mismo endpoint — el caller arma los movements
  //    correctos:
  //      - devolver: caja_id -seña, seña_id +seña
  //      - ganancia: venta_id -seña, seña_id +seña
  //    Ambas terminan la orden con state=ENTREGADO + returned_at + sin user.
  router.post('/movesPreVentaArrepentido', async (req, res) => {
    const { valuesCreateMovname, arrayMovements, branch_id, order_id } = req.body;

    const qCreateMoveName = "INSERT INTO movname (ingreso, egreso, operacion, monto, fecha, userId, branch_id, order_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
    const qCreateMovement = "INSERT INTO movements (movcategories_id, unidades, branch_id, movname_id) VALUES (?, ?, ?, ?)";
    const qFinalizeOrder = `
      UPDATE orders
      SET returned_at = CONVERT_TZ(NOW(), '+00:00', '-03:00'),
          state_changed_at = CONVERT_TZ(NOW(), '+00:00', '-03:00'),
          state_id = (SELECT delivered_state_id FROM branch_settings LIMIT 1),
          users_id = NULL
      WHERE order_id = ?
    `;

    const db = await pool.promise().getConnection();
    try {
      await db.beginTransaction();
      const [r] = await db.execute(qCreateMoveName, valuesCreateMovname);
      const moveName_id = r.insertId;
      await Promise.all(arrayMovements.map(el =>
        db.execute(qCreateMovement, [...el, branch_id, moveName_id])
      ));
      await db.execute(qFinalizeOrder, [order_id]);
      await db.commit();
      return res.status(200).json({ moveName_id });
    } catch (err) {
      await db.rollback();
      console.error(err);
      return res.status(500).send(err);
    } finally {
      db.release();
    }
  });

  // read
  router.get("/:id", (req, res) => {
    const moveId = req.params.id;
    // Extendido para Libro Contable:
    //   - es_dolar_ingreso/egreso + tipo_ingreso/egreso → moneda y clasificación
    //     income/expense/transfer (LEFT JOIN movcategories por nombre).
    //   - device_label (CONCAT brand + type + model) cuando order_id existe →
    //     se appendea a "Cobro orden #X" en la UI.
    const qgetMovements = `
      SELECT idmovname, movname.ingreso, movname.egreso, operacion, monto, fecha,
        users.username, movname.order_id,
        mci.es_dolar AS es_dolar_ingreso,
        mci.tipo     AS tipo_ingreso,
        mce.es_dolar AS es_dolar_egreso,
        mce.tipo     AS tipo_egreso,
        TRIM(CONCAT_WS(' ', b.brand, t.type, d.model)) AS device_label
      FROM movname
      JOIN users ON movname.userId = users.idusers
      LEFT JOIN movcategories mci ON mci.categories = movname.ingreso
      LEFT JOIN movcategories mce ON mce.categories = movname.egreso
      LEFT JOIN orders o  ON o.order_id = movname.order_id
      LEFT JOIN devices d ON d.iddevices = o.device_id
      LEFT JOIN brands b  ON b.brandid = d.brand_id
      LEFT JOIN types t   ON t.typeid = d.type_id
      WHERE movname.branch_id = ?
      ORDER BY STR_TO_DATE(fecha, '%d/%m/%Y %H:%i:%s') DESC
    `;
    
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
  // Caso especial: si el movname es un "Retiro pre-venta", el cobro se
  // tiene que poder deshacer entero — la orden vuelve a COMPRAR REPUESTO,
  // se restaura el stock de los items que fueron descontados, y se borra
  // movname (CASCADE → movements + cobros). Las señas previas viven en
  // otros movname y no se tocan.
  //
  // Para cualquier otro tipo de movname, comportamiento legacy: DELETE
  // directo + CASCADE.
  router.delete("/:id", async (req, res) => {
    const moveId = req.params.id;
    const db = await pool.promise().getConnection();
    try {
      const [meta] = await db.execute(
        'SELECT idmovname, operacion, order_id FROM movname WHERE idmovname = ?',
        [moveId]
      );
      if (meta.length === 0) {
        db.release();
        return res.status(404).json({ error: 'movname no encontrado' });
      }
      const { operacion, order_id } = meta[0];
      const esRetiroPreventa =
        order_id !== null &&
        typeof operacion === 'string' &&
        operacion.startsWith('Retiro pre-venta');

      if (!esRetiroPreventa) {
        // Path legacy: borrado directo, CASCADE limpia movements/cobros.
        await db.execute('DELETE FROM movname WHERE idmovname = ?', [moveId]);
        db.release();
        return res.status(200).json({ reverted: false });
      }

      // Path nuevo: revertir cobro completo en transacción.
      await db.beginTransaction();
      try {
        // 1) Resolver estado destino + grupo. Si no existen, abortamos
        //    sin tocar nada — la orden no debe quedar en estado roto.
        const [[stateRow]] = await db.execute(
          "SELECT idstates FROM states WHERE state = 'COMPRAR REPUESTO' LIMIT 1"
        );
        const [[grupoRow]] = await db.execute(
          "SELECT idgrupousuarios FROM grupousuarios WHERE LOWER(grupo) = 'atencion al cliente belgrano' LIMIT 1"
        );
        if (!stateRow || !grupoRow) {
          throw new Error('Faltan COMPRAR REPUESTO / Atencion al cliente Belgrano en el catálogo');
        }

        // 2) Restaurar stock SÓLO por las filas de reducestock que se
        //    crearon DURANTE este cobro (movname_id = moveId). Las filas
        //    pre-existentes (movname_id NULL — creadas desde Mensajes
        //    antes del cobro) quedan intactas: al re-cobrar volverán a
        //    cargarse automáticamente vía existingReducestock.
        await db.execute(
          `UPDATE stockbranch sb
           JOIN (
             SELECT stockbranch_id, COUNT(*) AS n
             FROM reducestock
             WHERE movname_id = ? AND stockbranch_id IS NOT NULL
             GROUP BY stockbranch_id
           ) cnt ON cnt.stockbranch_id = sb.stockbranchid
           SET sb.cantidad_restante = sb.cantidad_restante + cnt.n`,
          [moveId]
        );

        // 3) Borrar SÓLO las filas reducestock del cobro. Las preexistentes
        //    (movname_id NULL) sobreviven.
        await db.execute('DELETE FROM reducestock WHERE movname_id = ?', [moveId]);

        // 4) Revertir la orden al estado pre-cobro.
        await db.execute(
          `UPDATE orders
           SET state_id         = ?,
               users_id         = ?,
               returned_at      = NULL,
               state_changed_at = CONVERT_TZ(NOW(), '+00:00', '-03:00')
           WHERE order_id = ?`,
          [stateRow.idstates, grupoRow.idgrupousuarios, order_id]
        );

        // 5) Borrar movname — CASCADE limpia movements + cobros.
        await db.execute('DELETE FROM movname WHERE idmovname = ?', [moveId]);

        await db.commit();
        return res.status(200).json({
          reverted: true,
          order_id,
          new_state_id: stateRow.idstates,
          new_users_id: grupoRow.idgrupousuarios,
        });
      } catch (err) {
        await db.rollback();
        console.error('movname DELETE revert:', err.message);
        return res.status(500).json({ error: err.message });
      }
    } catch (err) {
      console.error(err);
      return res.status(500).send(err.message);
    } finally {
      try { db.release(); } catch (_) {}
    }
  })

  module.exports = router