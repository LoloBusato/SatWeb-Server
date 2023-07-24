const express = require('express');
const router = express.Router();

// Agregar base de datos
const db = require('../database/dbConfig');
/*-----------------CREACION DE ORDENES DE TRABAJO--------------- */
// create
router.post("/", (req, res) => {
  const { accesorios, branches_id, client_id, device_id, device_color, password, problem, serial, state_id, users_id, created_at } = req.body;

  const values = [
    client_id, 
    device_id, 
    branches_id, 
    created_at, 
    state_id, 
    problem, 
    password, 
    accesorios, 
    serial, 
    users_id,
    device_color,
  ]

  const qCreateOrder = "INSERT INTO orders (client_id, device_id, branches_id, created_at, state_id, problem, password, accesorios, serial, users_id, device_color) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
  
  db.query(qCreateOrder, values, (err, data) => {
    if (err) {
      console.log("error: ", err);
      return res.status(400).send("No se pudo agregar la orden.");
    }
    return res.status(200).send(data);
  });  
})
// read
router.get("/", (req, res) => {
  const qgetOrders = "SELECT * FROM orders JOIN clients ON orders.client_id = clients.idclients JOIN devices ON orders.device_id = devices.iddevices JOIN brands ON devices.brand_id = brands.brandid JOIN types ON devices.type_id = types.typeid JOIN branches ON orders.branches_id = branches.idbranches JOIN states ON orders.state_id = states.idstates JOIN grupousuarios ON orders.users_id = grupousuarios.idgrupousuarios WHERE state != 'ENTREGADO' ORDER BY order_id";
  db.query(qgetOrders, (err, data) => {
    if (err) {
      console.log(err);
      return res.status(400).json("error al obtener la lista de ordenes activas");
    }
    return res.status(200).json(data);
  });
})

router.get("/entregados", (req, res) => {
  const qgetOrders = "SELECT * FROM orders JOIN clients ON orders.client_id = clients.idclients JOIN devices ON orders.device_id = devices.iddevices JOIN brands ON devices.brand_id = brands.brandid JOIN types ON devices.type_id = types.typeid JOIN branches ON orders.branches_id = branches.idbranches JOIN states ON orders.state_id = states.idstates JOIN grupousuarios ON orders.users_id = grupousuarios.idgrupousuarios WHERE state = 'ENTREGADO' ORDER BY order_id";
  db.query(qgetOrders, (err, data) => {
    if (err) {
      console.log(err);
      return res.status(400).json("error al obtener la lista de ordenes entregadas");
    }
    return res.status(200).json(data);
  });
})
router.get("/:id", (req, res) => {
  const orderId = req.params.id;
  const qgetOrders = "SELECT * FROM orders JOIN clients ON orders.client_id = clients.idclients JOIN devices ON orders.device_id = devices.iddevices JOIN brands ON devices.brand_id = brands.brandid JOIN types ON devices.type_id = types.typeid JOIN branches ON orders.branches_id = branches.idbranches JOIN states ON orders.state_id = states.idstates JOIN grupousuarios ON orders.users_id = grupousuarios.idgrupousuarios WHERE order_id = ?";
  db.query(qgetOrders,[orderId], (err, data) => {
    if (err) {
      console.log(err);
      return res.status(400).json("error al obtener la orden");
    }
    return res.status(200).json(data);
  });
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

  db.query(qupdateOrder, [...values,orderId], (err, data) => {
    if (err) return res.status(400).send(err);
    return res.status(200).json(data);
  });
})
// update
router.put("/finalizar/:id", (req, res) => {
  const orderId = req.params.id;

  const { fecha } = req.body;

  const qupdateOrder = "UPDATE orders SET `returned_at` = ?, `state_id` = 6, `users_id` = 18 WHERE order_id = ?";

  db.query(qupdateOrder, [fecha, orderId], (err, data) => {
    if (err) return res.status(400).send(err);
    return res.status(200).json(data);
  });
})
// delete
router.delete("/:id", (req, res) => {
  const orderId = req.params.id;
  const qdeleteOrder = " DELETE FROM orders WHERE order_id = ? ";

  db.query(qdeleteOrder, [orderId], (err, data) => {
    if (err) return res.status(400).send(err);
    return res.status(200).json(data);
  });
})

module.exports = router