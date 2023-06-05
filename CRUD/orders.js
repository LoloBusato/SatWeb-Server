const express = require('express');
const router = express.Router();

// Agregar base de datos
const db = require('../database/dbConfig');
/*-----------------CREACION DE ORDENES DE TRABAJO--------------- */
// create
router.post("/", (req, res) => {
  const { accesorios, branches_id, client_id, device_id, device_color, password, problem, serial, state_id, users_id } = req.body;

  const fechaActual = new Date();
  const anio = (fechaActual.getFullYear()).toString().slice(-2);
  const mes = ('0' + (fechaActual.getMonth() + 1)).slice(-2);
  const dia = ('0' + fechaActual.getDate()).slice(-2);
  const created_at = `${dia}/${mes}/${anio}`;

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
  const qgetOrders = "SELECT idclients, branches.contact, branches.info, idusers, device_color, idbranches, idstates, iddevices, order_id, created_at, returned_at, problem, orders.password, accesorios, serial, name, surname, email, postal, instagram, phone, model, brand, type, branch, state, color, username FROM satweb.orders INNER JOIN satweb.clients ON satweb.orders.client_id = satweb.clients.idclients INNER JOIN satweb.devices ON satweb.orders.device_id = satweb.devices.iddevices JOIN satweb.brands ON satweb.devices.brand_id = satweb.brands.brandid JOIN satweb.types ON satweb.devices.type_id = satweb.types.typeid INNER JOIN satweb.branches ON satweb.orders.branches_id = satweb.branches.idbranches INNER JOIN satweb.states ON satweb.orders.state_id = satweb.states.idstates INNER JOIN satweb.users ON satweb.orders.users_id = satweb.users.idusers";
  db.query(qgetOrders, (err, data) => {
    if (err) {
      console.log(err);
      return res.status(400).json("error al obtener la lista de Stock");
    }
    return res.status(200).json(data);
  });
})
// update
router.put("/:id", (req, res) => {
  const orderId = req.params.id;

  const { accesorios, branches_id, device_id, password, problem, serial, state_id, users_id } = req.body;

  const values = [
    device_id, 
    branches_id, 
    state_id, 
    problem, 
    password, 
    accesorios, 
    serial, 
    users_id,
  ]

  console.log(values)

  const qupdateOrder = "UPDATE orders SET `device_id` = ?, `branches_id` = ?,  `state_id` = ?, `problem` = ?, `password` = ?, `accesorios` = ?, `serial` = ?, `users_id` = ? WHERE order_id = ?";

  db.query(qupdateOrder, [...values,orderId], (err, data) => {
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