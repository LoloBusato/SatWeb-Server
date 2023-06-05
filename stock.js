const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');

const app = express();
app.use(express.json())
app.use(cors()) // Use this after the variable declaration

const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "ACM1pt++",
  database: "satweb"
});
/*-----------------CREACION DE SISTEMA DE STOCK----------------- */
/*
ID
Repuesto => creacion de sistema de repuestos por nombre
Cantidad
Precio de compra en USD
Proveedor => creacion de sistema de proveedores
        nombre
        numero de telefono
        direccion
Fecha de ingreso => default | new Date()
*/
// create
  app.post("/stock", (req, res) => {
    const { repuesto_id, cantidad, precio_compra, proveedor_id } = req.body;
    let fecha_compra = req.body.fecha_compra
    const qCreateStock = "INSERT INTO stock (repuesto_id, cantidad, precio_compra, proveedor_id, fecha_compra) VALUES (?, ?, ?, ?, ?)";

    if(fecha_compra == ''){
      const fechaActual = new Date();
      const anio = fechaActual.getFullYear();
      const mes = ('0' + (fechaActual.getMonth() + 1)).slice(-2);
      const dia = ('0' + fechaActual.getDate()).slice(-2);
      fecha_compra = anio + '-' + mes + '-' + dia;
    }

    const values = [
      repuesto_id, 
      cantidad, 
      precio_compra, 
      proveedor_id, 
      fecha_compra, 
    ]

    db.query(qCreateStock, values, (err, data) => {
      if (err) {
        console.log("error: ", err);
        return res.status(400).send("No se pudo agregar el stock.");
      }
      return res.status(200).send("Stock agregado correctamente.");
    });    
  })
  // read
  app.get("/stock", (req, res) => {
    const qgetStock = "SELECT * FROM stock JOIN repuestos ON stock.repuesto_id = repuestos.idrepuestos JOIN proveedores ON stock.proveedor_id = proveedores.idproveedores";
    db.query(qgetStock, (err, data) => {
      if (err) {
        console.log(err);
        return res.status(400).json("error al obtener la lista de Stock");
      }
      return res.status(200).json(data);
    });
  })
  // update
  app.put("/stock/:id", (req, res) => {
    const stockId = req.params.id;
    const qupdateStock = "UPDATE stock SET `repuesto_id` = ?, `cantidad` = ?, `precio_compra` = ?, `proveedor_id` = ?, `fecha_compra` = ? WHERE idstock = ?";
    const { repuesto_id, cantidad, precio_compra, proveedor_id } = req.body;
    let fecha_compra = req.body.fecha_compra

    if(fecha_compra == ''){
      const fechaActual = new Date();
      const anio = fechaActual.getFullYear();
      const mes = ('0' + (fechaActual.getMonth() + 1)).slice(-2);
      const dia = ('0' + fechaActual.getDate()).slice(-2);
      fecha_compra = anio + '-' + mes + '-' + dia;
    }

    const values = [
      repuesto_id, 
      cantidad, 
      precio_compra, 
      proveedor_id, 
      fecha_compra, 
    ]
  
    db.query(qupdateStock, [...values,stockId], (err, data) => {
      if (err) return res.status(400).send(err);
      return res.status(200).json(data);
    });
  })
  // delete
  app.delete("/stock/:id", (req, res) => {
    const stockId = req.params.id;
    const qdeleteStock = " DELETE FROM stock WHERE idstock = ? ";
  
    db.query(qdeleteStock, [stockId], (err, data) => {
      if (err) return res.status(400).send(err);
      return res.status(200).json(data);
    });
  })

/*-----------------CREACION DE SISTEMA DE REPUESTOS----------------- */
  // create
  app.post("/stock/item", (req, res) => {
    const { repuesto } = req.body;
    const qCreateItem = "INSERT INTO repuestos (repuesto) VALUES (?)";
    db.query(qCreateItem, [repuesto], (err, data) => {
      if (err) {
        console.log("error: ", err);
        return res.status(400).send("No se pudo agregar el repuesto.");
      }
      return res.status(200).send("Repuesto agregado correctamente.");
    });    
  })
  // read
  app.get("/stock/item", (req, res) => {
    const qgetItem = "SELECT * FROM repuestos LIMIT 50";
    db.query(qgetItem, (err, result) => {
      if (err) {
        console.error(err);
        return res.status(500).send('Error al obtener la lista de repuestos');
      } else {
        return res.status(200).send(result);
      }
    });
  })
  // update
  app.put("/stock/item/:id", (req, res) => {
    const itemId = req.params.id;
    const qupdateItem = "UPDATE repuestos SET `repuesto` = ? WHERE idrepuestos = ?";
    const { repuesto } = req.body;
    
    db.query(qupdateItem, [repuesto,itemId], (err, data) => {
      if (err) return res.status(400).send(err);
      return res.status(200).json(data);
    });
  })
  // delete
  app.delete("/stock/item/:id", (req, res) => {
    const itemId = req.params.id;
    const qdeleteItem = " DELETE FROM repuestos WHERE idrepuestos = ? ";

    db.query(qdeleteItem, [itemId], (err, data) => {
      if (err) return res.status(400).send(err);
      return res.status(200).json(data);
    });
  })
  app.get('/item/:nombre', (req, res) => {

    const nombre = req.params.nombre;
    const sql = `SELECT idrepuestos FROM repuestos WHERE repuesto = ?`;

    db.query(sql, [nombre], (err, result) => {
      if (err) {
        console.error(err);
        res.status(500).send('Error al obtener el ID del repuesto');
      } else if (result.length === 0) {
        res.status(404).send('No se encontró ningún repuesto con ese nombre');
      } else {
        const repuestoId = result[0].idrepuestos;
        res.status(200).send(`${repuestoId}`);
      }
    });
  });

/*-----------------CREACION DE SISTEMA DE PROVEEDORES----------------- */
  // create
  app.post("/supplier", (req, res) => {
    const { nombre, telefono, direccion } = req.body;
    const values = [
      nombre,
      telefono, 
      direccion
    ]
    console.log(values)

    const qCreateSupplier = "INSERT INTO proveedores (nombre, telefono, direccion) VALUES (?, ?, ?)";
    db.query(qCreateSupplier, values, (err, data) => {
      if (err) {
        console.log("error: ", err);
        return res.status(400).send("No se pudo agregar el proveedor.");
      }
      return res.status(200).send("Proveedor agregado correctamente.");
    });    
  })
  // read
  app.get("/supplier", (req, res) => {
    const qgetSupplier = `SELECT * FROM proveedores LIMIT 20`;
    db.query(qgetSupplier, (err, result) => {
      if (err) {
        console.error(err);
        return res.status(500).send('Error al obtener la lista de proveedores');
      } else {
        return res.status(200).json(result);
      }
    });
  })
  // update
  app.put("/supplier/:id", (req, res) => {
    const supplierId = req.params.id;
    const qupdateSupplier = "UPDATE proveedores SET `nombre` = ?, `telefono` = ?, `direccion` = ? WHERE idproveedores = ?";
    const { nombre, telefono, direccion } = req.body;
    
    const values = [
      nombre,
      telefono, 
      direccion
    ]
    db.query(qupdateSupplier, [...values,supplierId], (err, data) => {
      if (err) return res.status(400).send(err);
      return res.status(200).json(data);
    });
  })
  // delete
  app.delete("/supplier/:id", (req, res) => {
    const supplierId = req.params.id;
    const qdeleteSupplier = " DELETE FROM proveedores WHERE idproveedores = ? ";

    db.query(qdeleteSupplier, [supplierId], (err, data) => {
      if (err) return res.status(400).send(err);
      return res.status(200).json(data);
    });
  })
  app.get('/supplier/:nombre', (req, res) => {

    const nombre = req.params.nombre;
    const sql = `SELECT idproveedores FROM proveedores WHERE nombre = ?`;

    db.query(sql, [nombre], (err, result) => {
      if (err) {
        console.error(err);
        res.status(500).send('Error al obtener el ID del proveedor');
      } else if (result.length === 0) {
        res.status(404).send('No se encontró ningún proveedor con ese nombre');
      } else {
        const proveedorId = result[0].idproveedores;
        res.status(200).send(`${proveedorId}`);
      }
    });
  });

const port = process.env.PORT || 3001;

app.listen(port, () => {
console.log(`Server running on port ${port}`);
});