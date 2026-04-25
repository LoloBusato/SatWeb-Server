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
//   REPARADO → ready_state → (cliente retira → delivered_state)
//                          → (incucai_after_days sin retiro → incucai_state archivado auto)
// Resolvemos los IDs desde branch_settings en cada request: ahora los nombres
// de estado son libremente renombrables (los 3 especiales se identifican por
// ID, no por string). branch_settings tiene los mismos valores en las 3
// sucursales activas, así que LIMIT 1 alcanza para la lógica global del
// listado. Si en el futuro hace falta scope per-branch, la query se
// parametriza con branchId.
const BASE_ORDERS_SELECT = "SELECT * FROM orders JOIN clients ON orders.client_id = clients.idclients JOIN devices ON orders.device_id = devices.iddevices JOIN brands ON devices.brand_id = brands.brandid JOIN types ON devices.type_id = types.typeid JOIN branches ON orders.branches_id = branches.idbranches JOIN states ON orders.state_id = states.idstates JOIN grupousuarios ON orders.users_id = grupousuarios.idgrupousuarios";

const Q_RESOLVE_SPECIAL_STATE_IDS = `
  SELECT delivered_state_id, ready_state_id, incucai_state_id
  FROM branch_settings LIMIT 1
`;

function resolveSpecialStateIds(db, cb) {
  db.query(Q_RESOLVE_SPECIAL_STATE_IDS, (err, rows) => {
    if (err) return cb(err);
    const r = rows[0];
    if (!r) return cb(new Error('branch_settings vacío — configurar al menos una sucursal'));
    cb(null, {
      delivered: r.delivered_state_id,
      ready: r.ready_state_id,
      incucai: r.incucai_state_id,
    });
  });
}

router.get("/", (req, res) => {
  pool.getConnection((err, db) => {
    if (err) return res.status(500).send(err);
    resolveSpecialStateIds(db, (errIds, ids) => {
      if (errIds) { db.release(); return res.status(500).send(errIds.message || errIds); }
      const hiddenIds = [ids.delivered, ids.ready, ids.incucai];
      const q = `${BASE_ORDERS_SELECT} WHERE orders.state_id NOT IN (?, ?, ?) ORDER BY order_id`;
      db.query(q, hiddenIds, (err2, data) => {
        db.release();
        if (err2) return res.status(500).send(err2);
        return res.status(200).json(data);
      });
    });
  });
})

router.get("/entregados", (req, res) => {
  pool.getConnection((err, db) => {
    if (err) return res.status(500).send(err);
    resolveSpecialStateIds(db, (errIds, ids) => {
      if (errIds) { db.release(); return res.status(500).send(errIds.message || errIds); }
      const q = `${BASE_ORDERS_SELECT} WHERE orders.state_id = ? ORDER BY order_id`;
      db.query(q, [ids.delivered], (err2, data) => {
        db.release();
        if (err2) return res.status(500).send(err2);
        return res.status(200).json(data);
      });
    });
  });
})

router.get("/para-retirar", (req, res) => {
  pool.getConnection((err, db) => {
    if (err) return res.status(500).send(err);
    resolveSpecialStateIds(db, (errIds, ids) => {
      if (errIds) { db.release(); return res.status(500).send(errIds.message || errIds); }
      const q = `${BASE_ORDERS_SELECT} WHERE orders.state_id = ? ORDER BY order_id`;
      db.query(q, [ids.ready], (err2, data) => {
        db.release();
        if (err2) return res.status(500).send(err2);
        return res.status(200).json(data);
      });
    });
  });
})

router.get("/incucai", (req, res) => {
  pool.getConnection((err, db) => {
    if (err) return res.status(500).send(err);
    resolveSpecialStateIds(db, (errIds, ids) => {
      if (errIds) { db.release(); return res.status(500).send(errIds.message || errIds); }
      const q = `${BASE_ORDERS_SELECT} WHERE orders.state_id = ? ORDER BY order_id`;
      db.query(q, [ids.incucai], (err2, data) => {
        db.release();
        if (err2) return res.status(500).send(err2);
        return res.status(200).json(data);
      });
    });
  });
})

// Resuelve los 3 estados especiales (delivered/ready/incucai) con sus IDs
// y nombres reales en una sola query, para que el frontend pinte labels
// dinámicos (los checkboxes de Repairs.js no están más hardcodeados con
// "Entregados", "Para retirar", "INCUCAI" — toman el state.state actual).
router.get("/special-states", (req, res) => {
  const q = `
    SELECT
      bs.delivered_state_id, ds.state AS delivered_name,
      bs.ready_state_id,     rs.state AS ready_name,
      bs.incucai_state_id,   ius.state AS incucai_name
    FROM branch_settings bs
    JOIN states ds  ON ds.idstates  = bs.delivered_state_id
    JOIN states rs  ON rs.idstates  = bs.ready_state_id
    JOIN states ius ON ius.idstates = bs.incucai_state_id
    LIMIT 1
  `;
  pool.getConnection((err, db) => {
    if (err) return res.status(500).send(err);
    db.query(q, (err2, rows) => {
      db.release();
      if (err2) return res.status(500).send(err2);
      if (!rows[0]) return res.status(500).send('branch_settings vacío');
      return res.status(200).json(rows[0]);
    });
  });
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
        (SELECT incucai_state_id FROM branch_settings LIMIT 1) AS incucai_id,
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
  // state_id resuelto desde branch_settings.delivered_state_id (antes era
  // hardcoded 6) para no acoplar a un id particular si el usuario reordena
  // o cambia el estado canónico de "entregado".
  const qupdateOrder = `
    UPDATE orders
    SET returned_at = CONVERT_TZ(NOW(), '+00:00', '-03:00'),
        state_id = (SELECT delivered_state_id FROM branch_settings LIMIT 1),
        users_id = 18
    WHERE order_id = ?
  `;

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