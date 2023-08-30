const express = require('express');
const router = express.Router();

// Agregar base de datos
const db = require('../database/dbConfig');
/* ------------------------------------------------------------- */
// CRUD de marcas
// create
router.post('/', async (req, res) => {
    const { brand } = req.body;
  
    const qCreateBrand = "INSERT INTO brands (brand) VALUES (?)";
    db.query(qCreateBrand, [brand], (err, data) => {
      if (err) {
        console.log("error: ", err);
        return res.status(400).send("No se pudo agregar la nueva marca.");
      }
      return res.status(200).send("La nueva marca se agregó correctamente.");
    });    
  });
  // read
  router.get("/", (req, res) => {
    const qgetBrands = "SELECT * FROM brands ORDER BY brand";
    db.query(qgetBrands, (err, data) => {
      if (err) {
        console.log(err);
        return res.status(400).json(err);
      }
      return res.status(200).json(data);
    });
  })
  // update
  router.put("/:id", (req, res) => {
    const brandId = req.params.id;
    const qupdateBrand = "UPDATE brands SET `brand`= ? WHERE brandid = ?";
  
    const values = [
      req.body.brand,
    ];
  
    db.query(qupdateBrand, [...values,brandId], (err, data) => {
      if (err) return res.status(400).send(err);
      return res.status(200).json(data);
    });
  })
  // delete
  router.delete("/:id", (req, res) => {
    const brandId = req.params.id;
    const qdeleteBrand = " DELETE FROM brands WHERE brandid = ? ";
  
    db.query(qdeleteBrand, [brandId], (err, data) => {
      if (err) return res.status(400).send(err);
      return res.status(200).json(data);
    });
  })
  /* ------------------------------------------------------------- */
module.exports = router  