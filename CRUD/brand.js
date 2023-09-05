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
    
    pool.getConnection((err, db) => {
      if (err) return res.status(500).send(err);
      
      db.query(qCreateBrand, [brand], (err, data) => {
        db.release()
        if (err) return res.status(500).send(err);
        return res.status(200).json(data)
      });
    })
  });
  // read
  router.get("/", (req, res) => {
    const qgetBrands = "SELECT * FROM brands ORDER BY brand";

    pool.getConnection((err, db) => {
      if (err) return res.status(500).send(err);
      
      db.query(qgetBrands, (err, data) => {
        db.release()
        if (err) return res.status(500).send(err);
        return res.status(200).json(data)
      });
    })
  })
  // update
  router.put("/:id", (req, res) => {
    const brandId = req.params.id;
    const qupdateBrand = "UPDATE brands SET `brand`= ? WHERE brandid = ?";
    const values = [
      req.body.brand,
    ];
  
    pool.getConnection((err, db) => {
      if (err) return res.status(500).send(err);
      
      db.query(qupdateBrand, [...values,brandId], (err, data) => {
        db.release()
        if (err) return res.status(500).send(err);
        return res.status(200).json(data)
      });
    })
  })
  // delete
  router.delete("/:id", (req, res) => {
    const brandId = req.params.id;
    const qdeleteBrand = " DELETE FROM brands WHERE brandid = ? ";
  
    pool.getConnection((err, db) => {
      if (err) return res.status(500).send(err);
      
      db.query(qdeleteBrand, [brandId], (err, data) => {
        db.release()
        if (err) return res.status(500).send(err);
        return res.status(200).json(data)
      });
    })
  })
  /* ------------------------------------------------------------- */
module.exports = router  