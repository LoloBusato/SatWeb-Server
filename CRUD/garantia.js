const express = require('express');
const router = express.Router();

// Agregar base de datos
const pool = require('../database/dbConfig');
/*-----------------CREACION DE SUCURSALES--------------- */
// CRUD de sucursales
// create
router.post('/', async (req, res) => {
  const { values, idreducestock } = req.body;
  const qCreateGarantia = "INSERT INTO garantia (stock_id, estado_garantia_id) VALUES (?, ?)";
  const qUpdateReduceStock = "UPDATE reducestock SET es_garantia = 1 WHERE idreducestock = ? "

  pool.getConnection((err, db) => {
    if (err) return res.status(500).send(err);

    db.beginTransaction(err => {
      if (err) return res.status(500).send('Error al iniciar la transacción');

      try {

        db.query(qCreateGarantia, values, (err, data) => {
          if (err) throw err
        });

        db.query(qUpdateReduceStock, [idreducestock], (err, data) => {
          if (err) throw err
        });

        db.commit(err => {
          if (err) {
            return db.rollback(() => {
              db.release()
              return res.status(500).send('Error al realizar commit');
            });
          }

          db.release()
          return res.status(200).send("Operacion completada");
        });
      } catch (err) {
        db.rollback(() => {
          db.release()
          return res.status(500).send('Error en la transacción');
        });
      }
    }); 
  })  
});
// read
router.get("/", (req, res) => {
    const qgetGarantia = "SELECT * FROM garantia JOIN stock ON garantia.stock_id = stock.idstock JOIN garantia_estados ON garantia.estado_garantia_id = garantia_estados.idgarantia_estados ORDER BY idgarantia";
    
    pool.getConnection((err, db) => {
      if (err) return res.status(500).send(err);
      
      db.query(qgetGarantia, (err, data) => {
        db.release()
        if (err) return res.status(500).send(err);
        return res.status(200).json(data)
      });
    })
  })
  // update
router.put("/", (req, res) => {
    const qupdateGarantia = "UPDATE garantia SET `estado_garantia_id`= ? WHERE idgarantia = ?";
    const qdeleteGarantia = "DELETE FROM garantia WHERE idgarantia = ? ";
    const qUpdateCantidad = "UPDATE stockbranch SET `cantidad_restante` = ? WHERE stockbranchid = ?"

    const { arrayValues } = req.body;
    const tipo = 0
    const idgarantia = 1
    const estadoid = 2
    const cantidad_restante = 3
    const stockbranchid = 4
    const createStockValues = 5
    const createValuesDistribute = 6
  
    pool.getConnection((err, db) => {
      if (err) return res.status(500).send(err);
      
      try {
        arrayValues.forEach(element => {
          if (element[tipo] === 1 || element[tipo] === 0) {
            db.query(qupdateGarantia, [element[idgarantia], element[estadoid]], (err, data) => {
              if (err) throw err
            });
          } else {
            db.query(qdeleteGarantia, [element[idgarantia]], (err, data) => {
              if (err) throw err
            });
            db.query(qUpdateCantidad, [element[cantidad_restante], element[stockbranchid]], (err, data) => {
              if (err) throw err
            });
            if (element[tipo] === 2) {

            } else if (element[tipo] === 3) {
              const qCreateStock = "INSERT INTO stock (repuesto_id, cantidad, precio_compra, proveedor_id, fecha_compra, cantidad_limite, branch_id) VALUES (?, ?, ?, ?, ?, ?, ?)";
              const qDistributeStock = "INSERT INTO stockbranch (stock_id, branch_id, cantidad_branch, cantidad_restante) VALUES (?, ?, ?, ?)"
              db.query(qCreateStock, element[createStockValues], (err, data) => {
                if (err) throw err
                
                const stockId = data.insertId
      
                db.query(qDistributeStock, [stockId,...element[createValuesDistribute]], (err, data) => {
                  if (err) throw err
                }); 
              });

            } else if (element[tipo] === 4) {

            }
          }
        });
  
        db.commit(err => {
          if (err) {
            return db.rollback(() => {
              db.release()
              return res.status(500).send('Error al realizar commit');
            });
          }
          db.release()
          return res.status(200).json('Repuesto agregado con exito');
        });

      } catch (err) {
        db.rollback(() => {
          db.release()
          return res.status(500).send('Error en la transacción');
        });
      }
    })
  })
// delete
router.delete("/:id", (req, res) => {
    const garantiaId = req.params.id;
    const qdeleteGarantia = "DELETE FROM garantia WHERE idgarantia = ? ";
  
    pool.getConnection((err, db) => {
      if (err) return res.status(500).send(err);
      
      db.query(qdeleteGarantia, [garantiaId], (err, data) => {
        db.release()
        if (err) return res.status(500).send(err);
        return res.status(200).json(data)
      });
    })
  })

module.exports = router