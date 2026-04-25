const express = require('express');
const router = express.Router();

// Agregar base de datos
const pool = require('../database/dbConfig');
/*-----------------CREACION DE ORDENES DE TRABAJO--------------- */
// create
router.post("/", (req, res) => {
  const { accesorios, branches_id, client_id, device_id, device_color, password, problem, serial, state_id, users_id } = req.body;
  // created_at lo genera el server en AR-local wall-clock (CONVERT_TZ). El
  // body podría traer created_at del cliente legacy, pero lo ignoramos — la
  // fecha autoritativa es el momento del insert en DB.
  // current_branch_id se duplica desde branches_id (ambos NOT NULL).
  const values = [
    client_id,
    device_id,
    branches_id,
    branches_id,
    state_id,
    problem,
    password,
    accesorios,
    serial,
    users_id,
    device_color,
  ]
  const qCreateOrder = "INSERT INTO orders (client_id, device_id, branches_id, current_branch_id, created_at, state_id, problem, password, accesorios, serial, users_id, device_color) VALUES (?, ?, ?, ?, CONVERT_TZ(NOW(), '+00:00', '-03:00'), ?, ?, ?, ?, ?, ?, ?)";
  
  pool.getConnection((err, db) => {
    if (err) return res.status(500).send(err);
    
    db.query(qCreateOrder, values, (err, data) => {
      db.release()
      if (err) return res.status(500).send(err);
      return res.status(200).json(data)
    });
  })
})
// read
// Estados "archivados" — ocultos del listado principal. El flujo es:
//   REPARADO → REPARADO CLIENTE AVISADO → (cliente retira → ENTREGADO)
//                                           → (90 días sin retiro → INCUCAI auto-archivado)
// La lista principal solo muestra trabajo en curso; cada bucket tiene su
// endpoint dedicado para el toggle del frontend (ver /orders/para-retirar,
// /orders/entregados, /orders/incucai). Hardcodeamos por nombre manteniendo
// el patrón existente de /entregados — la lógica automática (archivo +
// conteos por sucursal) vive en v2 con branch_settings.
const HIDDEN_STATES = ['ENTREGADO', 'REPARADO CLIENTE AVISADO', 'INCUCAI'];
const BASE_ORDERS_SELECT = "SELECT * FROM orders JOIN clients ON orders.client_id = clients.idclients JOIN devices ON orders.device_id = devices.iddevices JOIN brands ON devices.brand_id = brands.brandid JOIN types ON devices.type_id = types.typeid JOIN branches ON orders.branches_id = branches.idbranches JOIN states ON orders.state_id = states.idstates JOIN grupousuarios ON orders.users_id = grupousuarios.idgrupousuarios";

router.get("/", (req, res) => {
  const placeholders = HIDDEN_STATES.map(() => '?').join(',');
  const qgetOrders = `${BASE_ORDERS_SELECT} WHERE state NOT IN (${placeholders}) ORDER BY order_id`;

  pool.getConnection((err, db) => {
    if (err) return res.status(500).send(err);

    db.query(qgetOrders, HIDDEN_STATES, (err, data) => {
      db.release()
      if (err) return res.status(500).send(err);
      return res.status(200).json(data)
    });
  })
})

router.get("/entregados", (req, res) => {
  const qgetOrders = `${BASE_ORDERS_SELECT} WHERE state = 'ENTREGADO' ORDER BY order_id`;

  pool.getConnection((err, db) => {
    if (err) return res.status(500).send(err);

    db.query(qgetOrders, (err, data) => {
      db.release()
      if (err) return res.status(500).send(err);
      return res.status(200).json(data)
    });
  })
})

router.get("/para-retirar", (req, res) => {
  const qgetOrders = `${BASE_ORDERS_SELECT} WHERE state = 'REPARADO CLIENTE AVISADO' ORDER BY order_id`;

  pool.getConnection((err, db) => {
    if (err) return res.status(500).send(err);

    db.query(qgetOrders, (err, data) => {
      db.release()
      if (err) return res.status(500).send(err);
      return res.status(200).json(data)
    });
  })
})

router.get("/incucai", (req, res) => {
  const qgetOrders = `${BASE_ORDERS_SELECT} WHERE state = 'INCUCAI' ORDER BY order_id`;

  pool.getConnection((err, db) => {
    if (err) return res.status(500).send(err);

    db.query(qgetOrders, (err, data) => {
      db.release()
      if (err) return res.status(500).send(err);
      return res.status(200).json(data)
    });
  })
})

router.get("/:id", (req, res) => {
  const orderId = req.params.id;
  const qgetOrders = "SELECT * FROM orders JOIN clients ON orders.client_id = clients.idclients JOIN devices ON orders.device_id = devices.iddevices JOIN brands ON devices.brand_id = brands.brandid JOIN types ON devices.type_id = types.typeid JOIN branches ON orders.branches_id = branches.idbranches JOIN states ON orders.state_id = states.idstates JOIN grupousuarios ON orders.users_id = grupousuarios.idgrupousuarios WHERE order_id = ?";
  
  pool.getConnection((err, db) => {
    if (err) return res.status(500).send(err);
    
    db.query(qgetOrders,[orderId], (err, data) => {
      db.release()
      if (err) return res.status(500).send(err);
      return res.status(200).json(data)
    });
  })
})
// update
// Regla INCUCAI: si el técnico mueve la orden al estado INCUCAI, el grupo
// asignado se fuerza al grupo con permiso v2 `branches:view_all` que tenga
// al menos 1 user activo habilitado (el admin real). La elección del
// dropdown de grupo se ignora en ese caso. Misma regla en v2
// (OrderRepository.updateState) — aplica al archivado automático.
router.put("/:id", (req, res) => {
  const orderId = req.params.id;
  const { accesorios, branches_id, device_id, password, problem, serial, state_id, users_id, device_color } = req.body;

  pool.getConnection((err, db) => {
    if (err) return res.status(500).send(err);

    const qLookup = `
      SELECT
        (SELECT idstates FROM states WHERE state = 'INCUCAI' AND deleted_at IS NULL LIMIT 1) AS incucai_id,
        (SELECT g.idgrupousuarios
         FROM grupousuarios g
         JOIN group_permissions gp ON gp.group_id = g.idgrupousuarios
         JOIN permissions p ON p.id = gp.permission_id
         JOIN users u ON u.grupos_id = g.idgrupousuarios
         WHERE p.code = 'branches:view_all'
           AND g.deleted_at IS NULL
           AND u.deleted_at IS NULL
           AND u.enabled = 1
         ORDER BY g.idgrupousuarios
         LIMIT 1) AS admin_group_id
    `;

    db.query(qLookup, (errLookup, metaRows) => {
      if (errLookup) {
        db.release();
        return res.status(500).send(errLookup);
      }

      const { incucai_id, admin_group_id } = metaRows[0] || {};
      let finalUsersId = users_id;
      if (incucai_id != null && Number(state_id) === Number(incucai_id) && admin_group_id != null) {
        finalUsersId = admin_group_id;
      }

      const values = [
        device_id,
        branches_id,
        state_id,
        problem,
        password,
        accesorios,
        serial,
        finalUsersId,
        device_color,
      ];
      const qupdateOrder = "UPDATE orders SET `device_id` = ?, `branches_id` = ?,  `state_id` = ?, `problem` = ?, `password` = ?, `accesorios` = ?, `serial` = ?, `users_id` = ?, `device_color` = ? WHERE order_id = ?";

      db.query(qupdateOrder, [...values, orderId], (err, data) => {
        db.release();
        if (err) return res.status(500).send(err);
        return res.status(200).json(data);
      });
    });
  })
})
// update
router.put("/finalizar/:id", (req, res) => {
  const orderId = req.params.id;
  // Ignoramos el `fecha` del body; NOW() server-side en AR local evita que
  // el cliente pueda pasarnos una fecha inconsistente al marcar entregada.
  const qupdateOrder = "UPDATE orders SET `returned_at` = CONVERT_TZ(NOW(), '+00:00', '-03:00'), `state_id` = 6, `users_id` = 18 WHERE order_id = ?";

  pool.getConnection((err, db) => {
    if (err) return res.status(500).send(err);

    db.query(qupdateOrder, [orderId], (err, data) => {
      db.release()
      if (err) return res.status(500).send(err);
      return res.status(200).json(data)
    });
  })
})
// delete
router.delete("/:id", (req, res) => {
  const orderId = req.params.id;
  const qdeleteOrder = " DELETE FROM orders WHERE order_id = ? ";

  pool.getConnection((err, db) => {
    if (err) return res.status(500).send(err);
    
    db.query(qdeleteOrder, [orderId], (err, data) => {
      db.release()
      if (err) return res.status(500).send(err);
      return res.status(200).json(data)
    });
  })
})

module.exports = router