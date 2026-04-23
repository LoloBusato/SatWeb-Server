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
router.get("/", (req, res) => {
  const qgetOrders = "SELECT * FROM orders JOIN clients ON orders.client_id = clients.idclients JOIN devices ON orders.device_id = devices.iddevices JOIN brands ON devices.brand_id = brands.brandid JOIN types ON devices.type_id = types.typeid JOIN branches ON orders.branches_id = branches.idbranches JOIN states ON orders.state_id = states.idstates JOIN grupousuarios ON orders.users_id = grupousuarios.idgrupousuarios WHERE state != 'ENTREGADO' ORDER BY order_id";
  
  pool.getConnection((err, db) => {
    if (err) return res.status(500).send(err);
    
    db.query(qgetOrders, (err, data) => {
      db.release()
      if (err) return res.status(500).send(err);
      return res.status(200).json(data)
    });
  })
})

router.get("/entregados", (req, res) => {
  const qgetOrders = "SELECT * FROM orders JOIN clients ON orders.client_id = clients.idclients JOIN devices ON orders.device_id = devices.iddevices JOIN brands ON devices.brand_id = brands.brandid JOIN types ON devices.type_id = types.typeid JOIN branches ON orders.branches_id = branches.idbranches JOIN states ON orders.state_id = states.idstates JOIN grupousuarios ON orders.users_id = grupousuarios.idgrupousuarios WHERE state = 'ENTREGADO' ORDER BY order_id";
  
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
router.put("/:id", (req, res) => {
  const orderId = req.params.id;
  const { accesorios, branches_id, device_id, password, problem, serial, state_id, users_id, device_color } = req.body;
  const values = [
    device_id, 
    branches_id, 
    state_id, 
    problem, 
    password, 
    accesorios, 
    serial, 
    users_id,
    device_color
  ]
  const qupdateOrder = "UPDATE orders SET `device_id` = ?, `branches_id` = ?,  `state_id` = ?, `problem` = ?, `password` = ?, `accesorios` = ?, `serial` = ?, `users_id` = ?, `device_color` = ? WHERE order_id = ?";

  pool.getConnection((err, db) => {
    if (err) return res.status(500).send(err);
    
    db.query(qupdateOrder, [...values,orderId], (err, data) => {
      db.release()
      if (err) return res.status(500).send(err);
      return res.status(200).json(data)
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