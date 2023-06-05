const express = require('express');
const router = express.Router();

// Agregar base de datos
const db = require('../database/dbConfig');
/*-----------------CREACION DE MOVNAME--------------- */
// CRUD de movname
// create
router.post('/', async (req, res) => {
    const { ingreso, egreso, operacion, monto, userId } = req.body;

    const fechaActual = new Date();
    const anio = (fechaActual.getFullYear()).toString().slice(-2);
    const mes = ('0' + (fechaActual.getMonth() + 1)).slice(-2);
    const dia = ('0' + fechaActual.getDate()).slice(-2);
    const fecha = `${dia}/${mes}/${anio}`;

    const values = [
        ingreso, 
        egreso, 
        operacion, 
        monto, 
        fecha,
        userId
    ]
  
    const qCreateMove= "INSERT INTO movname (ingreso, egreso, operacion, monto, fecha, userId) VALUES (?, ?, ?, ?, ?, ?)";
    db.query(qCreateMove, values, (err, result) => {
        if (err) {
        console.log("error: ", err);
        return res.status(400).send("No se pudo agregar el movimiento.");
        }
        return res.status(200).send(result);
    });    
  });
  // read
  router.get("/", (req, res) => {
    const qgetMovements = "SELECT idmovname, ingreso, egreso, operacion, monto, fecha, username FROM satweb.movname JOIN users ON userId = idusers ORDER BY str_to_date(fecha, '%d/%m/%y') DESC;";
    db.query(qgetMovements, (err, data) => {
      if (err) {
        console.log(err);
        return res.status(400).json(err);
      }
      return res.status(200).json(data);
    });
  })
  // update
  router.put("/:id", (req, res) => {
    const moveId = req.params.id;
    const { accountId, movCategoriesId, userId, movement, valueUsd, valuePesos, valueTrans, valueMp } = req.body;
  
    const values = [

    ]
    const qupdateMovement = "UPDATE movements SET `accountId` = ?, `movCategoriesId` = ?, `userId` = ?, `movement` = ?, `valueUsd` = ?, `valuePesos` = ?, `valueTrans` = ?, `valueMp` = ? WHERE idmovements = ?";
    db.query(qupdateMovement, [...values, moveId], (err, data) => {
        if (err) return res.status(400).send(err);
        return res.status(200).json(data);
    }); 
  })
  // delete
  router.delete("/:id", (req, res) => {
    const moveId = req.params.id;
    const qdeleteMovement = " DELETE FROM movements WHERE idmovements = ? ";
  
    db.query(qdeleteMovement, [moveId], (err, data) => {
      if (err) return res.status(400).send(err);
      return res.status(200).json(data);
    });
  })

  module.exports = router