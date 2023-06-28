const express = require('express');
const router = express.Router();

// Agregar base de datos
const db = require('../database/dbConfig');
/*-----------------CREACION DE CLIENTES--------------- */
// CRUD de clientes
// create
router.post('/', async (req, res) => {
    const { name, surname, email, instagram, phone, postal } = req.body;
  
    const values = [
      name,
      surname,
      email,
      instagram,
      phone,
      postal
    ]
  
    const qClient = 'SELECT * FROM clients WHERE (name = ? and surname = ?) and (email = ? or instagram = ? or phone = ?)';
    const newEmail = email === "" ? "1" : email;
    const newIg = instagram === "" ? "1" : instagram;
    const newPhone = phone === "" ? "1" : phone;
    const valuesCheck = [
      name,
      surname,
      newEmail,
      newIg,
      newPhone,
    ]
  
    db.query(qClient, valuesCheck, (err, data) => {
      if (err) {
        console.log("error: ", err);
        return res.status(400).send(err);
      }
      if(data.length > 0){
        return res.status(200).send(data);
      } else {
        const qCreateClient = "INSERT INTO clients (name, surname, email, instagram, phone, postal) VALUES (?, ?, ?, ?, ?, ?)";
        db.query(qCreateClient, values, (err, result) => {
          if (err) {
            console.log("error: ", err);
            return res.status(400).send("No se pudo agregar al cliente.");
          }
          return res.status(200).send([{idclients: result.insertId}]);
        });    
      }
    });
  });
  // read
  router.get("/", (req, res) => {
    const qgetClients = "SELECT * FROM clients ORDER BY name";
    db.query(qgetClients, (err, data) => {
      if (err) {
        console.log(err);
        return res.status(400).json(err);
      }
      return res.status(200).json(data);
    });
  })
  // update
  router.put("/:id", (req, res) => {
    const clientId = req.params.id;
    const { name, surname, email, instagram, phone, postal } = req.body;
  
  
    const values = [
      name,
      surname,
      email,
      instagram,
      phone,
      postal
    ]
    const qupdateClient = "UPDATE clients SET `name` = ?, `surname` = ?, `email` = ?, `instagram` = ?, `phone` = ?, `postal` = ? WHERE idclients = ?";
    
    db.query(qupdateClient, [...values, clientId], (err, data) => {
      if (err) return res.status(400).send(err);
      return res.status(200).json(data);
    }); 
  })
  // delete
  router.delete("/:id", (req, res) => {
    const clientId = req.params.id;
    const qdeleteClient = " DELETE FROM clients WHERE idclients = ? ";
  
    db.query(qdeleteClient, [clientId], (err, data) => {
      if (err) return res.status(400).send(err);
      return res.status(200).json(data);
    });
  })

  module.exports = router