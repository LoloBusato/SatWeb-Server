const express = require('express');
const router = express.Router();

// Agregar base de datos
const pool = require('../database/dbConfig');
/*-----------------CREACION DE CATEGORIAS--------------- */
// CRUD de categorias
// create
router.post('/', async (req, res) => {
    const { categories, tipo, es_dolar, branch_id } = req.body;
    const qCreateCategory = "INSERT INTO movcategories (categories, tipo, es_dolar, branch_id) VALUES (?, ?, ?, ?)";
    
    const valuesCategorias = [
      categories, 
      tipo, 
      es_dolar, 
      branch_id
    ]

    pool.getConnection((err, db) => {
      if (err) return res.status(500).send(err);
      
      db.query(qCreateCategory, valuesCategorias, (err, data) => {
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
  // Bloqueamos rename/delete de categorías marcadas con is_system_category=1
  // (10 categorías hardcodeadas por NOMBRE en Resumen.js + flujo de Cobro
  // Sucursal). Si cambian, el cálculo de utilidad neta rompe en silencio
  // (categoriesDicc[oldName] = undefined → NaN). Mismo patrón que el guard
  // de PROTECTED_STATE_NAMES que tuvimos para estados (que ya removimos
  // porque migramos estados a IDs — pero acá Resumen.js todavía matchea
  // por nombre, así que el guard hace falta).
  router.put("/:id", (req, res) => {
    const categoriesId = req.params.id;
    const { categories, tipo, es_dolar } = req.body;

    pool.getConnection((err, db) => {
      if (err) return res.status(500).send(err);

      db.query("SELECT is_system_category, categories FROM movcategories WHERE idmovcategories = ?", [categoriesId], (errCheck, rows) => {
        if (errCheck) { db.release(); return res.status(500).send(errCheck); }
        if (!rows[0]) { db.release(); return res.status(404).send('Categoría no encontrada'); }
        if (rows[0].is_system_category === 1) {
          db.release();
          return res.status(409).send(`No se puede editar la categoría "${rows[0].categories}" — el sistema referencia ese nombre en el cálculo financiero. Es de solo lectura.`);
        }

        const qupdateCategories = "UPDATE movcategories SET `categories` = ?, `tipo` = ?, `es_dolar` = ? WHERE idmovcategories = ?";
        db.query(qupdateCategories, [categories, tipo, es_dolar, categoriesId], (err, data) => {
          db.release();
          if (err) return res.status(500).send(err);
          return res.status(200).json(data);
        });
      });
    });
  })
  // delete
  router.delete("/:id", (req, res) => {
    const categoriesId = req.params.id;

    pool.getConnection((err, db) => {
      if (err) return res.status(500).send(err);

      // Pre-check: 1) sistema → 409, 2) tiene movements asociados → 409.
      // El movements.movcategories_id es FK con NO ACTION; sin este check
      // el DELETE devolvería ER_ROW_IS_REFERENCED_2 crudo y el frontend lo
      // silenciaba.
      const qCheck = `
        SELECT
          mc.is_system_category,
          mc.categories,
          (SELECT COUNT(*) FROM movements mv WHERE mv.movcategories_id = mc.idmovcategories) AS movs
        FROM movcategories mc WHERE mc.idmovcategories = ?
      `;
      db.query(qCheck, [categoriesId], (errCheck, rows) => {
        if (errCheck) { db.release(); return res.status(500).send(errCheck); }
        if (!rows[0]) { db.release(); return res.status(404).send('Categoría no encontrada'); }
        if (rows[0].is_system_category === 1) {
          db.release();
          return res.status(409).send(`No se puede eliminar la categoría "${rows[0].categories}" — es del sistema.`);
        }
        if (rows[0].movs > 0) {
          db.release();
          return res.status(409).send(`No se puede eliminar "${rows[0].categories}" — tiene ${rows[0].movs} movimiento(s) asociado(s).`);
        }

        const qdeleteCategories = "DELETE FROM movcategories WHERE idmovcategories = ?";
        db.query(qdeleteCategories, [categoriesId], (err, data) => {
          db.release();
          if (err) return res.status(500).send(err);
          return res.status(200).json(data);
        });
      });
    });
  })

  module.exports = router