const express = require('express');
const router = express.Router();

// Agregar base de datos
const db = require('../database/dbConfig');
/*-----------------CREACION DE CATEGORIAS--------------- */
// CRUD de categorias
// create
router.post('/', async (req, res) => {
    const { categories } = req.body;
    const qCreateCategory = "INSERT INTO movcategories (categories) VALUES (?)";
    
    pool.getConnection((err, db) => {
      if (err) return res.status(500).send(err);
      
      db.query(qCreateCategory, [categories], (err, data) => {
        db.release()
        if (err) return res.status(500).send(err);
        return res.status(200).json(data)
      });
    }) 
  });
  // read
  router.get("/", (req, res) => {
    const qgetCategoriest = "SELECT * FROM movcategories ORDER BY categories";
    
    pool.getConnection((err, db) => {
      if (err) return res.status(500).send(err);
      
      db.query(qgetCategoriest, (err, data) => {
        db.release()
        if (err) return res.status(500).send(err);
        return res.status(200).json(data)
      });
    })
  })
  router.get("/:nombre", (req, res) => {
    const qgetCatId = "SELECT idmovcategories FROM movcategories WHERE categories = ?";
    const catName = req.params.nombre;

    pool.getConnection((err, db) => {
      if (err) return res.status(500).send(err);
      
      db.query(qgetCatId, [catName], (err, data) => {
        db.release()
        if (err) return res.status(500).send(err);
        return res.status(200).json(data)
      });
    })
  })
  // update
  router.put("/:id", (req, res) => {
    const categoriesId = req.params.id;
    const { categories } = req.body;
    const qupdateCategories = "UPDATE movcategories SET `categories` = ? WHERE idmovcategories = ?";
    
    pool.getConnection((err, db) => {
      if (err) return res.status(500).send(err);
      
      db.query(qupdateCategories, [categories, categoriesId], (err, data) => {
        db.release()
        if (err) return res.status(500).send(err);
        return res.status(200).json(data)
      });
    })
  })
  // delete
  router.delete("/:id", (req, res) => {
    const categoriesId = req.params.id;
    const qdeleteCategories = " DELETE FROM movcategories WHERE idmovcategories = ? ";
  
    pool.getConnection((err, db) => {
      if (err) return res.status(500).send(err);
      
      db.query(qdeleteCategories, [categoriesId], (err, data) => {
        db.release()
        if (err) return res.status(500).send(err);
        return res.status(200).json(data)
      });
    })
  })

  module.exports = router