const express = require('express');
const pool = require('../../database/dbConfig');

function createCRUDRoutes(config) {
    const { tableName, columnName, idName, variableFront } = config;

    const router = express.Router();

    router.post('/', async (req, res) => {
        const value = req.body[variableFront];
        const qInsert = `INSERT INTO ${tableName} (${columnName}) VALUES (?)`;

        pool.getConnection((err, db) => {
            if (err) return res.status(500).send(err);
            
            db.query(qInsert, [value], (err, data) => {
                db.release()
                if (err) return res.status(500).send(err);
                return res.status(200).json(data)
            });
        })
    });

    router.get('/', (req, res) => {
        const qSelectAll = `SELECT * FROM ${tableName} ORDER BY ${columnName}`;

        pool.getConnection((err, db) => {
            if (err) return res.status(500).send(err);
            
            db.query(qSelectAll, (err, data) => {
                db.release()
                if (err) return res.status(500).send(err);
                return res.status(200).json(data)
            });
        })
    });

    router.put(`/:id`, (req, res) => {
        const id = req.params.id;
        const value = req.body[variableFront];
        const qUpdate = `UPDATE ${tableName} SET ${columnName} = ? WHERE ${idName} = ?`;

        pool.getConnection((err, db) => {
            if (err) return res.status(500).send(err);
            
            db.query(qUpdate, [value, id], (err, data) => {
                db.release()
                if (err) return res.status(500).send(err);
                return res.status(200).json(data)
            });
        })
    });

    router.delete(`/:id`, (req, res) => {
        const id = req.params.id;
        const qDelete = `DELETE FROM ${tableName} WHERE ${idName} = ?`;

        pool.getConnection((err, db) => {
            if (err) return res.status(500).send(err);
            
            db.query(qDelete, [id], (err, data) => {
                db.release()
                if (err) return res.status(500).send(err);
                return res.status(200).json(data)
            });
        })
    });

    return router;
}

module.exports = createCRUDRoutes;